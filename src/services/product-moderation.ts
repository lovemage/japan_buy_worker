import type { D1DatabaseLike } from "../types/d1";
import { parseStoredProductPayload } from "../jobs/product-records";
import { getGeminiApiKey, getGeminiModel } from "../routes/admin/settings";
import {
  adminUrl,
  escapeHtml,
  isRealEmail,
  markNotificationFailed,
  markNotificationSent,
  reserveNotification,
  sendEmail,
  type EmailNotificationEnv,
} from "./email-notifications";
import {
  ACTIVE_CASE_STATUSES,
  CASE_STATUS_LABELS,
  DEFAULT_SCAN_MAX_PRODUCTS,
  RISK_LABELS,
  RULES,
  SCAN_BATCH_SIZE,
  SCAN_RESPONSE_SCHEMA,
  STRIKE_WINDOW_DAYS,
  adminActionAllowed,
  buildScanPrompt,
  caseSortKey,
  deadlineFrom,
  fingerprintInput,
  formatTaipeiDate,
  isOverdue,
  keywordAssessment,
  normalizeAiResults,
  sanitizeSellerMessage,
  sellerActionAllowed,
  sha256Hex,
  shouldSuggestSuspension,
  statusAfterSellerResponse,
} from "../shared/moderation-logic.js";

export type ModerationEnv = EmailNotificationEnv;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type Assessment = { risk: string; rule: string; reason: string };

type CandidateRow = {
  id: number;
  store_id: number;
  title_zh_tw: string | null;
  title_ja: string | null;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  source_payload_json: string | null;
  moderation_scanned_hash: string | null;
  moderation_cleared_hash: string | null;
};

type Candidate = CandidateRow & { description: string; gallery: string[]; hash: string };

export type ScanSummary = {
  at: string;
  trigger: string;
  scanned: number;
  flagged: number;
  notifiedStores: number;
  aiUsed: boolean;
  remaining: number;
  errors: string[];
};

const APPEND_NOTE_SQL = "CASE WHEN admin_note IS NULL OR admin_note = '' THEN ? ELSE admin_note || char(10) || ? END";
const ACTIVE_STATUS_SQL = ACTIVE_CASE_STATUSES.map((s) => `'${s}'`).join(", ");

async function getSetting(db: D1DatabaseLike, key: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT value FROM app_settings WHERE store_id = 0 AND key = ?")
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

async function putSetting(db: D1DatabaseLike, key: string, value: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (0, ?, ?, datetime('now'))
       ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .bind(key, value)
    .run();
}

async function logAction(
  db: D1DatabaseLike,
  input: { caseId: number; storeId: number; productId: number; actor: string; action: string; detail?: string }
) {
  await db
    .prepare(
      `INSERT INTO moderation_actions (case_id, store_id, product_id, actor, action, detail)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(input.caseId, input.storeId, input.productId, input.actor, input.action, input.detail ?? null)
    .run();
}

// ── AI classification ──

async function classifyWithGemini(
  apiKey: string,
  model: string,
  products: Candidate[],
  fetchImpl: FetchLike
): Promise<Map<number, Assessment>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: buildScanPrompt(products) }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: SCAN_RESPONSE_SCHEMA,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "[]";
    return normalizeAiResults(JSON.parse(text), products.map((p) => p.id));
  } finally {
    clearTimeout(timer);
  }
}

async function recordScanUsage(db: D1DatabaseLike, now: Date, calls: number) {
  if (calls <= 0) return;
  const monthKey = `${now.getUTCFullYear()}_${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  await db
    .prepare(
      `INSERT INTO api_usage_logs (store_id, api_type, month_key, call_count, last_called_at)
       VALUES (0, 'moderation_scan', ?, ?, datetime('now'))
       ON CONFLICT(store_id, api_type, month_key) DO UPDATE SET call_count = call_count + excluded.call_count, last_called_at = datetime('now')`
    )
    .bind(monthKey, calls)
    .run()
    .catch(() => {});
}

// ── Scan job ──

export async function loadScanCandidates(db: D1DatabaseLike): Promise<Candidate[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.store_id, p.title_zh_tw, p.title_ja, p.brand, p.category, p.image_url,
              p.source_payload_json, p.moderation_scanned_hash, p.moderation_cleared_hash
       FROM products p
       JOIN stores s ON s.id = p.store_id
       WHERE p.is_active = 1 AND s.is_active = 1 AND p.moderation_status = 'none'
       ORDER BY p.moderation_scanned_at IS NOT NULL, p.moderation_scanned_at ASC, p.id ASC`
    )
    .all<CandidateRow>();

  const out: Candidate[] = [];
  for (const row of results) {
    const payload = parseStoredProductPayload(row.source_payload_json);
    const description = payload.description || "";
    const hash = await sha256Hex(fingerprintInput({ ...row, description }));
    if (hash === row.moderation_scanned_hash) continue;
    out.push({ ...row, description, gallery: payload.gallery.slice(0, 4), hash });
  }
  return out;
}

async function openCase(
  db: D1DatabaseLike,
  product: Candidate,
  assessment: Assessment,
  source: string,
  now: Date
): Promise<number | null> {
  const snapshot = JSON.stringify({
    title: product.title_zh_tw || product.title_ja || "",
    brand: product.brand || "",
    category: product.category || "",
    description: product.description.slice(0, 2000),
    image: product.image_url || "",
    gallery: product.gallery,
  });
  const inserted = await db
    .prepare(
      `INSERT OR IGNORE INTO moderation_cases
         (store_id, product_id, source, risk_level, rule_code, reason, status, seller_deadline_at, snapshot_json)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)
       RETURNING id`
    )
    .bind(product.store_id, product.id, source, assessment.risk, assessment.rule, assessment.reason, deadlineFrom(now), snapshot)
    .first<{ id: number }>();
  if (!inserted?.id) return null;

  await db
    .prepare("UPDATE products SET moderation_status = 'flagged' WHERE id = ? AND moderation_status = 'none'")
    .bind(product.id)
    .run();
  await logAction(db, {
    caseId: inserted.id,
    storeId: product.store_id,
    productId: product.id,
    actor: "system",
    action: "flagged",
    detail: `${source}｜${RISK_LABELS[assessment.risk as keyof typeof RISK_LABELS] || assessment.risk}｜${assessment.reason}`,
  });
  return inserted.id;
}

export async function runModerationScan(
  env: ModerationEnv,
  options: { trigger: "cron" | "manual"; maxProducts?: number; now?: Date; fetchImpl?: FetchLike }
): Promise<ScanSummary> {
  const db = env.DB;
  const now = options.now ?? new Date();
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const summary: ScanSummary = {
    at: now.toISOString(),
    trigger: options.trigger,
    scanned: 0,
    flagged: 0,
    notifiedStores: 0,
    aiUsed: false,
    remaining: 0,
    errors: [],
  };

  if (options.trigger === "cron" && (await getSetting(db, "moderation_scan_enabled")) === "0") {
    summary.errors.push("排程掃描已停用");
    await putSetting(db, "moderation_last_scan", JSON.stringify(summary));
    return summary;
  }

  await deliverPendingNotices(env, summary);

  const configuredMax = Number(await getSetting(db, "moderation_scan_max_products"));
  const maxProducts = options.maxProducts ?? (Number.isFinite(configuredMax) && configuredMax > 0 ? configuredMax : DEFAULT_SCAN_MAX_PRODUCTS);

  const candidates = await loadScanCandidates(db);
  const queue = candidates.slice(0, maxProducts);
  summary.remaining = candidates.length - queue.length;

  const apiKey = await getGeminiApiKey(db, 0, "free");
  const model = await getGeminiModel(db);
  let aiCalls = 0;
  const newCases = new Map<number, number[]>(); // storeId -> case ids

  for (let i = 0; i < queue.length; i += SCAN_BATCH_SIZE) {
    const batch = queue.slice(i, i + SCAN_BATCH_SIZE);
    let aiResults = new Map<number, Assessment>();
    if (apiKey) {
      try {
        aiResults = await classifyWithGemini(apiKey, model, batch, fetchImpl);
        aiCalls += 1;
        summary.aiUsed = true;
      } catch (error) {
        summary.errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    for (const product of batch) {
      const fromAi = aiResults.get(product.id);
      const assessment = fromAi ?? keywordAssessment(product);
      const source = fromAi ? "ai_scan" : "keyword_scan";
      if (assessment.risk !== "none" && product.hash !== product.moderation_cleared_hash) {
        const caseId = await openCase(db, product, assessment, source, now);
        if (caseId) {
          summary.flagged += 1;
          const list = newCases.get(product.store_id) ?? [];
          list.push(caseId);
          newCases.set(product.store_id, list);
        }
      }
      await db
        .prepare("UPDATE products SET moderation_scanned_hash = ?, moderation_scanned_at = ? WHERE id = ?")
        .bind(product.hash, now.toISOString(), product.id)
        .run();
      summary.scanned += 1;
    }
  }

  await recordScanUsage(db, now, aiCalls);

  for (const [storeId, caseIds] of newCases) {
    try {
      if (await notifySellerOfNewCases(env, storeId, caseIds)) summary.notifiedStores += 1;
    } catch (error) {
      summary.errors.push(`store ${storeId} 通知失敗：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  summary.errors = summary.errors.slice(0, 10);
  await putSetting(db, "moderation_last_scan", JSON.stringify(summary));
  return summary;
}

// ── Seller notifications ──

type StoreRow = { id: number; slug: string; name: string | null; owner_email: string | null };

async function getStore(db: D1DatabaseLike, storeId: number): Promise<StoreRow | null> {
  return db
    .prepare("SELECT id, slug, name, owner_email FROM stores WHERE id = ?")
    .bind(storeId)
    .first<StoreRow>();
}

type CaseRow = {
  id: number;
  store_id: number;
  product_id: number;
  source: string;
  risk_level: string;
  rule_code: string;
  reason: string | null;
  status: string;
  seller_deadline_at: string | null;
  seller_response: string | null;
  seller_responded_at: string | null;
  admin_note: string | null;
  snapshot_json: string;
  notified_at: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

function snapshotTitle(row: { snapshot_json?: string | null }): string {
  try {
    return String(JSON.parse(row.snapshot_json || "{}").title || "").trim() || "（未命名商品）";
  } catch {
    return "（未命名商品）";
  }
}

function ruleLabel(code: string): string {
  return RULES[code as keyof typeof RULES]?.label || RULES.other.label;
}

function ruleGuidance(code: string): string {
  return RULES[code as keyof typeof RULES]?.guidance || RULES.other.guidance;
}

async function deliver(
  env: ModerationEnv,
  store: StoreRow,
  input: { eventType: string; dedupeKey: string; subject: string; lines: string[]; htmlBody: string }
): Promise<boolean> {
  if (!isRealEmail(store.owner_email)) return false;
  const shouldSend = await reserveNotification(env.DB, {
    storeId: store.id,
    eventType: input.eventType,
    dedupeKey: input.dedupeKey,
    recipientEmail: store.owner_email,
  });
  if (!shouldSend) return false;
  try {
    await sendEmail(env, { to: store.owner_email, subject: input.subject, text: input.lines.join("\n"), html: input.htmlBody });
    await markNotificationSent(env.DB, input.eventType, input.dedupeKey);
    return true;
  } catch (error) {
    await markNotificationFailed(env.DB, input.eventType, input.dedupeKey, error);
    throw error;
  }
}

export async function notifySellerOfNewCases(env: ModerationEnv, storeId: number, caseIds: number[]): Promise<boolean> {
  if (caseIds.length === 0) return false;
  const store = await getStore(env.DB, storeId);
  if (!store) return false;
  const placeholders = caseIds.map(() => "?").join(", ");
  const { results: cases } = await env.DB
    .prepare(`SELECT * FROM moderation_cases WHERE id IN (${placeholders}) ORDER BY id`)
    .bind(...caseIds)
    .all<CaseRow>();
  if (cases.length === 0) return false;

  const storeName = store.name || "你的商店";
  const deadline = formatTaipeiDate(cases[0].seller_deadline_at);
  const link = adminUrl(env.APP_URL, store.slug);
  const items = cases.map((c) => ({ title: snapshotTitle(c), rule: ruleLabel(c.rule_code), reason: c.reason || ruleGuidance(c.rule_code) }));

  let sent = false;
  let failure: unknown = null;
  try {
    sent = await deliver(env, store, {
      eventType: "moderation_notice",
      dedupeKey: `cases:${caseIds.join(",")}`,
      subject: `我拍｜你的商店有 ${cases.length} 件商品需要確認`,
      lines: [
        `${storeName} 你好，`,
        "",
        "平台每週會檢查商品是否符合台灣法規。以下商品可能屬於需要販售資格的類別，這是提醒，商品目前仍正常販售：",
        "",
        ...items.map((it) => `・${it.title}（${it.rule}）：${it.reason}`),
        "",
        `請在 ${deadline} 前到會員後台的「商品合規提醒」確認：`,
        "1. 有合法販售資格：留言說明，例如輸入許可、產品登錄字號或進貨來源。",
        "2. 沒有資格或不確定：自行下架或修改商品內容。",
        "逾期未處理的商品，平台將依服務條款第 5.1 條審查後處理。",
        "",
        `前往會員後台：${link}`,
        "",
        "這封信由系統自動判斷寄出，若判斷有誤，回覆說明即可，我們會人工確認。",
      ],
      htmlBody: `
        <p>${escapeHtml(storeName)} 你好，</p>
        <p>平台每週會檢查商品是否符合台灣法規。以下商品可能屬於需要販售資格的類別，<strong>這是提醒，商品目前仍正常販售</strong>：</p>
        <ul>${items.map((it) => `<li><strong>${escapeHtml(it.title)}</strong>（${escapeHtml(it.rule)}）：${escapeHtml(it.reason)}</li>`).join("")}</ul>
        <p>請在 <strong>${escapeHtml(deadline)}</strong> 前到會員後台的「商品合規提醒」確認：</p>
        <ol>
          <li>有合法販售資格：留言說明，例如輸入許可、產品登錄字號或進貨來源。</li>
          <li>沒有資格或不確定：自行下架或修改商品內容。</li>
        </ol>
        <p>逾期未處理的商品，平台將依服務條款第 5.1 條審查後處理。</p>
        <p><a href="${escapeHtml(link)}">前往會員後台</a></p>
        <p style="color:#888;font-size:12px;">這封信由系統自動判斷寄出，若判斷有誤，回覆說明即可，我們會人工確認。</p>
      `,
    });
  } catch (error) {
    failure = error;
  }

  for (const c of cases) {
    if (sent) {
      await env.DB.prepare("UPDATE moderation_cases SET notified_at = datetime('now') WHERE id = ?").bind(c.id).run();
    }
    await logAction(env.DB, {
      caseId: c.id,
      storeId: c.store_id,
      productId: c.product_id,
      actor: "system",
      action: sent ? "notified" : "notify_failed",
      detail: sent ? store.owner_email || "" : failure instanceof Error ? failure.message : "未寄出（無有效 Email）",
    });
  }
  if (failure) throw failure;
  return sent;
}

// Cases opened outside the scan loop (manual review by the platform) are
// written with notified_at = NULL; the next scan run sends their emails.
async function deliverPendingNotices(env: ModerationEnv, summary: ScanSummary): Promise<void> {
  const { results } = await env.DB
    .prepare(
      `SELECT id, store_id, status FROM moderation_cases
       WHERE source = 'manual_review' AND notified_at IS NULL AND status IN ('open', 'removed')
         AND created_at > datetime('now', '-14 days')
       ORDER BY store_id, id`
    )
    .all<{ id: number; store_id: number; status: string }>();
  const groups = new Map<string, { storeId: number; status: string; ids: number[] }>();
  for (const row of results) {
    const key = `${row.store_id}:${row.status}`;
    const group = groups.get(key) ?? { storeId: row.store_id, status: row.status, ids: [] };
    group.ids.push(row.id);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    try {
      const sent = group.status === "removed"
        ? await notifySellerOfRemovals(env, group.storeId, group.ids)
        : await notifySellerOfNewCases(env, group.storeId, group.ids);
      if (sent) summary.notifiedStores += 1;
    } catch (error) {
      summary.errors.push(`store ${group.storeId} 通知失敗：${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export async function notifySellerOfRemovals(env: ModerationEnv, storeId: number, caseIds: number[]): Promise<boolean> {
  if (caseIds.length === 0) return false;
  const store = await getStore(env.DB, storeId);
  if (!store) return false;
  const placeholders = caseIds.map(() => "?").join(", ");
  const { results: cases } = await env.DB
    .prepare(`SELECT * FROM moderation_cases WHERE id IN (${placeholders}) ORDER BY id`)
    .bind(...caseIds)
    .all<CaseRow>();
  if (cases.length === 0) return false;

  const storeName = store.name || "你的商店";
  const link = adminUrl(env.APP_URL, store.slug);
  const items = cases.map((c) => ({ title: snapshotTitle(c), rule: ruleLabel(c.rule_code), reason: c.reason || ruleGuidance(c.rule_code) }));

  let sent = false;
  let failure: unknown = null;
  try {
    sent = await deliver(env, store, {
      eventType: "moderation_removal",
      dedupeKey: `removed:${caseIds.join(",")}`,
      subject: `我拍｜你的商店有 ${cases.length} 件商品已由平台暫時下架`,
      lines: [
        `${storeName} 你好，`,
        "",
        "平台審查商品時，發現以下商品可能不符合台灣法規，已依服務條款第 5.1 條暫時下架：",
        "",
        ...items.map((it) => `・${it.title}（${it.rule}）：${it.reason}`),
        "",
        "商品資料與照片都會保留。若你具備合法販售資格，請到會員後台的「商品合規提醒」提出申訴並附上證明，例如輸入許可、產品登錄字號或許可證字號，我們會再次審核。",
        "商品描述若含有療效或保證效果的字句，修改內容後也可以提出申訴。",
        "",
        `前往會員後台：${link}`,
      ],
      htmlBody: `
        <p>${escapeHtml(storeName)} 你好，</p>
        <p>平台審查商品時，發現以下商品可能不符合台灣法規，已依服務條款第 5.1 條暫時下架：</p>
        <ul>${items.map((it) => `<li><strong>${escapeHtml(it.title)}</strong>（${escapeHtml(it.rule)}）：${escapeHtml(it.reason)}</li>`).join("")}</ul>
        <p>商品資料與照片都會保留。若你具備合法販售資格，請到會員後台的「商品合規提醒」提出申訴並附上證明，例如輸入許可、產品登錄字號或許可證字號，我們會再次審核。</p>
        <p>商品描述若含有療效或保證效果的字句，修改內容後也可以提出申訴。</p>
        <p><a href="${escapeHtml(link)}">前往會員後台</a></p>
      `,
    });
  } catch (error) {
    failure = error;
  }

  for (const c of cases) {
    if (sent) {
      await env.DB.prepare("UPDATE moderation_cases SET notified_at = datetime('now') WHERE id = ?").bind(c.id).run();
    }
    await logAction(env.DB, {
      caseId: c.id,
      storeId: c.store_id,
      productId: c.product_id,
      actor: "system",
      action: sent ? "notified" : "notify_failed",
      detail: sent ? store.owner_email || "" : failure instanceof Error ? failure.message : "未寄出（無有效 Email）",
    });
  }
  if (failure) throw failure;
  return sent;
}

async function notifySellerOfDecision(env: ModerationEnv, c: CaseRow, action: string, note: string): Promise<boolean> {
  const store = await getStore(env.DB, c.store_id);
  if (!store) return false;
  const storeName = store.name || "你的商店";
  const title = snapshotTitle(c);
  const link = adminUrl(env.APP_URL, store.slug);
  const noteLine = note ? `平台說明：${note}` : "";

  const templates: Record<string, { subject: string; body: string[] }> = {
    remove: {
      subject: `我拍｜商品「${title}」已由平台暫時下架`,
      body: [
        `經平台審查，商品「${title}」可能涉及${ruleLabel(c.rule_code)}的販售規定，已依服務條款第 5.1 條暫時下架。`,
        ruleGuidance(c.rule_code),
        noteLine,
        "若你具備合法販售資格，可以在會員後台的「商品合規提醒」提出申訴並附上證明，我們會再次審核。商品資料與照片都會保留。",
      ],
    },
    dismiss: {
      subject: `我拍｜商品「${title}」審核完成，無需處理`,
      body: [`平台已確認商品「${title}」不需處理，感謝你的配合。`, noteLine],
    },
    restore: {
      subject: `我拍｜商品「${title}」申訴通過`,
      body: [`商品「${title}」的申訴已通過，你可以在會員後台重新上架。`, noteLine],
    },
    uphold: {
      subject: `我拍｜商品「${title}」申訴結果`,
      body: [`經再次審核，商品「${title}」維持下架。`, noteLine, "如有新的證明文件，可以再次提出申訴。"],
    },
  };
  const tpl = templates[action];
  if (!tpl) return false;
  const body = tpl.body.filter(Boolean);
  return deliver(env, store, {
    eventType: `moderation_${action}`,
    dedupeKey: `case:${c.id}:${action}:${Date.now()}`,
    subject: tpl.subject,
    lines: [`${storeName} 你好，`, "", ...body, "", `前往會員後台：${link}`],
    htmlBody: `<p>${escapeHtml(storeName)} 你好，</p>${body.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}<p><a href="${escapeHtml(link)}">前往會員後台</a></p>`,
  });
}

// ── Platform admin ──

export type AdminCaseFilter = "active" | "overdue" | "review" | "removed" | "closed" | "all";

export async function listCasesForAdmin(db: D1DatabaseLike, filter: AdminCaseFilter, now = new Date()) {
  const where =
    filter === "closed"
      ? "c.status NOT IN (" + ACTIVE_STATUS_SQL + ")"
      : filter === "removed"
        ? "c.status = 'removed'"
        : filter === "review"
          ? "c.status IN ('responded', 'appealed')"
          : filter === "all"
            ? "1 = 1"
            : "c.status IN ('open', 'responded', 'appealed')";
  const { results } = await db
    .prepare(
      `SELECT c.*, s.name AS store_name, s.slug AS store_slug, s.owner_email, s.is_active AS store_active, s.plan AS store_plan,
              p.title_zh_tw AS product_title, p.image_url AS product_image, p.is_active AS product_active,
              p.source_product_code AS product_code,
              (SELECT COUNT(*) FROM moderation_cases r
                 WHERE r.store_id = c.store_id AND r.status IN ('removed', 'appealed')
                   AND r.updated_at >= datetime('now', ?)) AS store_strikes
       FROM moderation_cases c
       LEFT JOIN stores s ON s.id = c.store_id
       LEFT JOIN products p ON p.id = c.product_id
       WHERE ${where}
       ORDER BY c.created_at DESC
       LIMIT 300`
    )
    .bind(`-${STRIKE_WINDOW_DAYS} days`)
    .all<CaseRow & Record<string, unknown>>();

  const rows = results
    .map((r) => ({
      ...r,
      overdue: isOverdue(r, now),
      suggest_suspension: shouldSuggestSuspension(Number(r.store_strikes || 0)),
      status_label: CASE_STATUS_LABELS[r.status as keyof typeof CASE_STATUS_LABELS] || r.status,
      risk_label: RISK_LABELS[r.risk_level as keyof typeof RISK_LABELS] || r.risk_level,
      rule_label: ruleLabel(r.rule_code),
    }))
    .filter((r) => filter !== "overdue" || r.overdue);

  rows.sort((a, b) => {
    const ka = caseSortKey(a, now);
    const kb = caseSortKey(b, now);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] < kb[i]) return -1;
      if (ka[i] > kb[i]) return 1;
    }
    return 0;
  });
  return rows;
}

export async function getCaseDetail(db: D1DatabaseLike, caseId: number) {
  const c = await db.prepare("SELECT * FROM moderation_cases WHERE id = ?").bind(caseId).first<CaseRow>();
  if (!c) return null;
  const [{ results: actions }, product, store] = await Promise.all([
    db.prepare("SELECT * FROM moderation_actions WHERE case_id = ? ORDER BY id").bind(caseId).all(),
    db
      .prepare(
        "SELECT id, source_product_code, title_zh_tw, title_ja, brand, category, image_url, source_payload_json, is_active, moderation_status FROM products WHERE id = ?"
      )
      .bind(c.product_id)
      .first<Record<string, unknown>>(),
    getStore(db, c.store_id),
  ]);
  let currentProduct = null;
  if (product) {
    const payload = parseStoredProductPayload(product.source_payload_json as string | null);
    currentProduct = {
      id: product.id,
      code: product.source_product_code,
      title: product.title_zh_tw || product.title_ja,
      brand: product.brand,
      category: product.category,
      image: product.image_url,
      description: payload.description,
      isActive: product.is_active,
      moderationStatus: product.moderation_status,
    };
  }
  let snapshot: Record<string, unknown> = {};
  try {
    snapshot = JSON.parse(c.snapshot_json || "{}");
  } catch {
    /* keep empty */
  }
  return {
    ...c,
    snapshot,
    overdue: isOverdue(c),
    rule_label: ruleLabel(c.rule_code),
    rule_guidance: ruleGuidance(c.rule_code),
    risk_label: RISK_LABELS[c.risk_level as keyof typeof RISK_LABELS] || c.risk_level,
    status_label: CASE_STATUS_LABELS[c.status as keyof typeof CASE_STATUS_LABELS] || c.status,
    store,
    currentProduct,
    actions,
  };
}

export async function adminActOnCase(
  env: ModerationEnv,
  caseId: number,
  action: string,
  rawNote: string
): Promise<{ ok: true; status: string; emailed: boolean } | { ok: false; error: string; status?: number }> {
  const db = env.DB;
  const c = await db.prepare("SELECT * FROM moderation_cases WHERE id = ?").bind(caseId).first<CaseRow>();
  if (!c) return { ok: false, error: "案件不存在", status: 404 };
  if (!adminActionAllowed(action, c.status)) {
    return { ok: false, error: `目前狀態（${CASE_STATUS_LABELS[c.status as keyof typeof CASE_STATUS_LABELS] || c.status}）不能執行這個動作`, status: 409 };
  }
  const note = String(rawNote || "").trim().slice(0, 1000);
  const base = { caseId: c.id, storeId: c.store_id, productId: c.product_id, actor: "platform_admin" };

  if (action === "note") {
    if (!note) return { ok: false, error: "請輸入備註內容", status: 400 };
    await db
      .prepare(`UPDATE moderation_cases SET admin_note = ${APPEND_NOTE_SQL}, updated_at = datetime('now') WHERE id = ?`)
      .bind(note, note, c.id)
      .run();
    await logAction(db, { ...base, action: "note", detail: note });
    return { ok: true, status: c.status, emailed: false };
  }

  let nextStatus = c.status;
  if (action === "remove" || action === "uphold") {
    nextStatus = "removed";
    await db
      .prepare("UPDATE products SET is_active = 0, moderation_status = 'removed', updated_at = datetime('now') WHERE id = ?")
      .bind(c.product_id)
      .run();
    await db
      .prepare("UPDATE moderation_cases SET status = 'removed', resolved_at = NULL, updated_at = datetime('now') WHERE id = ?")
      .bind(c.id)
      .run();
  } else if (action === "dismiss" || action === "restore") {
    nextStatus = action === "dismiss" ? "dismissed" : "restored";
    // Remember the cleared content so the next scan does not raise the same flag.
    await db
      .prepare("UPDATE products SET moderation_status = 'none', moderation_cleared_hash = moderation_scanned_hash WHERE id = ?")
      .bind(c.product_id)
      .run();
    await db
      .prepare("UPDATE moderation_cases SET status = ?, resolved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
      .bind(nextStatus, c.id)
      .run();
  }
  if (note) {
    await db
      .prepare(`UPDATE moderation_cases SET admin_note = ${APPEND_NOTE_SQL} WHERE id = ?`)
      .bind(note, note, c.id)
      .run();
  }
  await logAction(db, { ...base, action: action === "uphold" ? "appeal_rejected" : action === "dismiss" ? "dismissed" : action === "restore" ? "restored" : "removed", detail: note });

  let emailed = false;
  try {
    emailed = await notifySellerOfDecision(env, c, action, note);
    if (emailed) {
      // A decision email covers any notice still pending for this case.
      await db.prepare("UPDATE moderation_cases SET notified_at = COALESCE(notified_at, datetime('now')) WHERE id = ?").bind(c.id).run();
    }
    await logAction(db, { ...base, actor: "system", action: emailed ? "notified" : "notify_failed", detail: emailed ? action : "未寄出（無有效 Email）" });
  } catch (error) {
    await logAction(db, { ...base, actor: "system", action: "notify_failed", detail: error instanceof Error ? error.message : String(error) });
  }
  return { ok: true, status: nextStatus, emailed };
}

export async function getModerationSummary(db: D1DatabaseLike) {
  const { results } = await db
    .prepare("SELECT status, COUNT(*) AS n FROM moderation_cases GROUP BY status")
    .all<{ status: string; n: number }>();
  const counts: Record<string, number> = {};
  for (const r of results) counts[r.status] = Number(r.n);
  const overdue = await db
    .prepare("SELECT COUNT(*) AS n FROM moderation_cases WHERE status = 'open' AND seller_deadline_at < ?")
    .bind(new Date().toISOString())
    .first<{ n: number }>();
  let lastScan: ScanSummary | null = null;
  try {
    lastScan = JSON.parse((await getSetting(db, "moderation_last_scan")) || "null");
  } catch {
    lastScan = null;
  }
  return {
    counts,
    overdue: Number(overdue?.n || 0),
    lastScan,
    scanEnabled: (await getSetting(db, "moderation_scan_enabled")) !== "0",
  };
}

export async function setScanEnabled(db: D1DatabaseLike, enabled: boolean) {
  await putSetting(db, "moderation_scan_enabled", enabled ? "1" : "0");
}

// ── Seller ──

export async function listSellerCases(db: D1DatabaseLike, storeId: number) {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.product_id, c.risk_level, c.rule_code, c.reason, c.status, c.seller_deadline_at,
              c.seller_response, c.seller_responded_at, c.snapshot_json, c.created_at, c.resolved_at,
              p.source_product_code AS product_code, p.is_active AS product_active
       FROM moderation_cases c
       LEFT JOIN products p ON p.id = c.product_id
       WHERE c.store_id = ?
         AND (c.status IN (${ACTIVE_STATUS_SQL}) OR c.resolved_at >= datetime('now', '-30 days'))
         AND c.status != 'seller_removed'
         -- Deleted or seller-delisted products no longer need a notice; platform removals stay for appeals.
         AND p.id IS NOT NULL
         AND (p.is_active = 1 OR c.status IN ('removed', 'appealed'))
       ORDER BY c.created_at DESC
       LIMIT 100`
    )
    .bind(storeId)
    .all<CaseRow & { product_code: string | null; product_active: number | null }>();
  return results.map((c) => ({
    id: c.id,
    productId: c.product_id,
    productCode: c.product_code,
    productActive: c.product_active,
    title: snapshotTitle(c),
    rule: ruleLabel(c.rule_code),
    guidance: ruleGuidance(c.rule_code),
    reason: c.reason,
    status: c.status,
    statusLabel: CASE_STATUS_LABELS[c.status as keyof typeof CASE_STATUS_LABELS] || c.status,
    deadline: c.seller_deadline_at,
    deadlineText: formatTaipeiDate(c.seller_deadline_at),
    overdue: isOverdue(c),
    sellerResponse: c.seller_response,
    canRespond: sellerActionAllowed("respond", c.status),
    canSelfRemove: sellerActionAllowed("self_remove", c.status),
  }));
}

async function getSellerCase(db: D1DatabaseLike, storeId: number, caseId: number) {
  return db
    .prepare("SELECT * FROM moderation_cases WHERE id = ? AND store_id = ?")
    .bind(caseId, storeId)
    .first<CaseRow>();
}

export async function sellerRespond(db: D1DatabaseLike, storeId: number, caseId: number, rawMessage: string) {
  const c = await getSellerCase(db, storeId, caseId);
  if (!c) return { ok: false as const, error: "案件不存在", status: 404 };
  if (!sellerActionAllowed("respond", c.status)) return { ok: false as const, error: "此案件已結案，無需回覆", status: 409 };
  const message = sanitizeSellerMessage(rawMessage);
  if (message.length < 5) return { ok: false as const, error: "請簡單說明商品的販售資格或來源（至少 5 個字）", status: 400 };
  const nextStatus = statusAfterSellerResponse(c.status);
  await db
    .prepare(
      `UPDATE moderation_cases
       SET seller_response = ?, seller_responded_at = datetime('now'), status = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(message, nextStatus, c.id)
    .run();
  await logAction(db, {
    caseId: c.id,
    storeId,
    productId: c.product_id,
    actor: "seller",
    action: nextStatus === "appealed" ? "appeal" : "seller_response",
    detail: message,
  });
  return { ok: true as const, status: nextStatus };
}

export async function sellerSelfRemove(db: D1DatabaseLike, storeId: number, caseId: number) {
  const c = await getSellerCase(db, storeId, caseId);
  if (!c) return { ok: false as const, error: "案件不存在", status: 404 };
  if (!sellerActionAllowed("self_remove", c.status)) return { ok: false as const, error: "此案件目前不能自行下架", status: 409 };
  // Clearing the scan hash means a relisted product is checked again on the next scan.
  await db
    .prepare(
      `UPDATE products SET is_active = 0, moderation_status = 'none', moderation_scanned_hash = NULL, updated_at = datetime('now')
       WHERE id = ? AND store_id = ?`
    )
    .bind(c.product_id, storeId)
    .run();
  await db
    .prepare("UPDATE moderation_cases SET status = 'seller_removed', resolved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
    .bind(c.id)
    .run();
  await logAction(db, { caseId: c.id, storeId, productId: c.product_id, actor: "seller", action: "seller_removed" });
  return { ok: true as const, status: "seller_removed" };
}

// Called when a seller deletes a product: close notices that no longer need an answer.
export async function closeCasesForDeletedProduct(db: D1DatabaseLike, storeId: number, productId: number) {
  const { results } = await db
    .prepare("SELECT id FROM moderation_cases WHERE store_id = ? AND product_id = ? AND status IN ('open', 'responded')")
    .bind(storeId, productId)
    .all<{ id: number }>();
  for (const row of results) {
    await db
      .prepare("UPDATE moderation_cases SET status = 'seller_removed', resolved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
      .bind(row.id)
      .run();
    await logAction(db, { caseId: row.id, storeId, productId, actor: "seller", action: "seller_removed", detail: "商品已刪除" });
  }
}

// ── Guards ──

export async function isRemovedByPlatform(db: D1DatabaseLike, storeId: number, productId: number): Promise<boolean> {
  const row = await db
    .prepare("SELECT moderation_status FROM products WHERE id = ? AND store_id = ?")
    .bind(productId, storeId)
    .first<{ moderation_status: string | null }>();
  return row?.moderation_status === "removed";
}

export async function findRemovedProductIds(db: D1DatabaseLike, storeId: number, productIds: number[]): Promise<number[]> {
  const ids = [...new Set(productIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return [];
  const { results } = await db
    .prepare(`SELECT id FROM products WHERE store_id = ? AND moderation_status = 'removed' AND id IN (${ids.map(() => "?").join(", ")})`)
    .bind(storeId, ...ids)
    .all<{ id: number }>();
  return results.map((r) => Number(r.id));
}
