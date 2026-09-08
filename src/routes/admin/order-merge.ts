import type { RequestContext } from "../../context";
import {
  canBeMerged,
  canBeMergePrimary,
  validateMerge,
  buildMergeNote,
} from "../../shared/order-merge-logic.js";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type MergeFormRow = {
  id: number;
  store_id: number;
  order_code: string | null;
  customer_name: string;
  member_phone: string | null;
  status: string;
  notes: string | null;
  shipping_total_twd: number | null;
  merged_into_id: number | null;
  remittance_status: string | null;
  paid_payment_orders: number;
  created_at: string;
};

// 合併資格要看的欄位都在這裡取齊，包含「有沒有已付款的線上收款單」。
const MERGE_FORM_COLUMNS = `
  rf.id,
  rf.store_id,
  rf.order_code,
  rf.customer_name,
  rf.member_phone,
  rf.status,
  rf.notes,
  rf.shipping_total_twd,
  rf.merged_into_id,
  rf.remittance_status,
  (SELECT COUNT(*) FROM store_payment_orders spo
    WHERE spo.requirement_form_id = rf.id AND spo.status = 'paid') AS paid_payment_orders,
  rf.created_at
`;

async function loadForm(ctx: RequestContext, id: number): Promise<MergeFormRow | null> {
  return ctx.db
    .prepare(`SELECT ${MERGE_FORM_COLUMNS} FROM requirement_forms rf WHERE rf.id = ? AND rf.store_id = ? LIMIT 1`)
    .bind(id, ctx.storeId)
    .first<MergeFormRow>();
}

async function itemCounts(ctx: RequestContext, ids: number[]): Promise<Map<number, { count: number; totalTwd: number }>> {
  const map = new Map<number, { count: number; totalTwd: number }>();
  if (ids.length === 0) return map;
  const placeholders = ids.map(() => "?").join(",");
  const res = await ctx.db
    .prepare(
      `SELECT requirement_form_id, COUNT(*) AS cnt, COALESCE(SUM(subtotal_twd), 0) AS total
         FROM requirement_items
        WHERE requirement_form_id IN (${placeholders})
        GROUP BY requirement_form_id`
    )
    .bind(...ids)
    .all<{ requirement_form_id: number; cnt: number; total: number }>();
  for (const row of res?.results || []) {
    map.set(Number(row.requirement_form_id), { count: Number(row.cnt), totalTwd: Number(row.total) });
  }
  return map;
}

// GET /api/admin/merge-candidates?formId=123
// 回傳同店同電話、且目前可以被併入這張單的其他訂單。
export async function handleMergeCandidates(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method !== "GET") {
    return json({ ok: false, error: "Method Not Allowed" }, 405);
  }

  const url = new URL(request.url);
  const formId = Number(url.searchParams.get("formId") || "");
  if (!Number.isInteger(formId) || formId <= 0) {
    return json({ ok: false, error: "formId is required" }, 400);
  }

  const primary = await loadForm(ctx, formId);
  if (!primary?.id) {
    return json({ ok: false, error: "Requirement not found" }, 404);
  }

  const primaryCheck = canBeMergePrimary(primary);
  if (!primaryCheck.ok) {
    return json({ ok: true, primaryId: formId, mergeable: false, reason: primaryCheck.error, candidates: [] });
  }

  const phone = String(primary.member_phone || "");
  if (!phone) {
    return json({ ok: true, primaryId: formId, mergeable: false, reason: "此訂單沒有電話，無法比對同一位客戶", candidates: [] });
  }

  // 這裡不套用列表的分頁上限：合併候選常常是很久以前的舊訂單。
  const rows = await ctx.db
    .prepare(
      `SELECT ${MERGE_FORM_COLUMNS}
         FROM requirement_forms rf
        WHERE rf.store_id = ? AND rf.member_phone = ? AND rf.id != ?
        ORDER BY rf.created_at DESC, rf.id DESC
        LIMIT 50`
    )
    .bind(ctx.storeId, phone, formId)
    .all<MergeFormRow>();

  const eligible = (rows?.results || []).filter((row) => canBeMerged(row).ok);
  const counts = await itemCounts(ctx, eligible.map((row) => row.id));

  return json({
    ok: true,
    primaryId: formId,
    mergeable: true,
    memberPhone: phone,
    candidates: eligible.map((row) => ({
      id: row.id,
      orderCode: row.order_code || String(row.id),
      customerName: row.customer_name,
      status: row.status,
      createdAt: row.created_at,
      itemCount: counts.get(row.id)?.count || 0,
      itemsTotalTwd: counts.get(row.id)?.totalTwd || 0,
      shippingTotalTwd: Number(row.shipping_total_twd || 0),
    })),
  });
}

// POST /api/admin/requirements/merge  { primaryId, mergeIds: [] }
export async function handleOrderMerge(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method Not Allowed" }, 405);
  }

  let body: { primaryId?: number; mergeIds?: number[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const primaryId = Number(body?.primaryId);
  const mergeIds = Array.isArray(body?.mergeIds)
    ? Array.from(new Set(body.mergeIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)))
    : [];
  if (!Number.isInteger(primaryId) || primaryId <= 0) {
    return json({ ok: false, error: "primaryId is required" }, 400);
  }
  if (mergeIds.length === 0) {
    return json({ ok: false, error: "請選擇至少一張要合併的訂單" }, 400);
  }

  const primary = await loadForm(ctx, primaryId);
  if (!primary?.id) {
    return json({ ok: false, error: "Requirement not found" }, 404);
  }

  // 前端送來的狀態一律不採信，資格全部重查一次
  const placeholders = mergeIds.map(() => "?").join(",");
  const othersRes = await ctx.db
    .prepare(
      `SELECT ${MERGE_FORM_COLUMNS}
         FROM requirement_forms rf
        WHERE rf.id IN (${placeholders}) AND rf.store_id = ?`
    )
    .bind(...mergeIds, ctx.storeId)
    .all<MergeFormRow>();
  const others = othersRes?.results || [];

  if (others.length !== mergeIds.length) {
    return json({ ok: false, error: "有訂單不存在或不屬於這個商店" }, 400);
  }

  const check = validateMerge(primary, others);
  if (!check.ok) {
    return json({ ok: false, error: check.error }, 400);
  }

  const mergedNote = buildMergeNote(primary.notes, others);

  // 一次 transaction：品項搬家 → 被併單標記 → 主單備註。任一步失敗全部回滾。
  await ctx.db.batch([
    ctx.db
      .prepare(
        `UPDATE requirement_items
            SET requirement_form_id = ?,
                origin_form_id = COALESCE(origin_form_id, requirement_form_id)
          WHERE requirement_form_id IN (${placeholders})`
      )
      .bind(primaryId, ...mergeIds),
    ctx.db
      .prepare(
        `UPDATE requirement_forms
            SET status = 'merged',
                merged_into_id = ?,
                merged_at = datetime('now'),
                updated_at = datetime('now')
          WHERE id IN (${placeholders}) AND store_id = ?`
      )
      .bind(primaryId, ...mergeIds, ctx.storeId),
    ctx.db
      .prepare(
        // 品項變了，先前針對舊品項算出來的調整金額已經失效，清掉讓店家重新調
        `UPDATE requirement_forms
            SET notes = ?,
                adjusted_items_total_twd = NULL,
                updated_at = datetime('now')
          WHERE id = ? AND store_id = ?`
      )
      .bind(mergedNote, primaryId, ctx.storeId),
  ]);

  return json({
    ok: true,
    primaryId,
    primaryOrderCode: primary.order_code || String(primary.id),
    mergedIds: mergeIds,
    mergedOrderCodes: others.map((row) => row.order_code || String(row.id)),
  });
}

// POST /api/admin/requirements/unmerge  { formId }
// 依 origin_form_id 把品項搬回原訂單，還原成合併前的狀態。
export async function handleOrderUnmerge(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method Not Allowed" }, 405);
  }

  let body: { formId?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const formId = Number(body?.formId);
  if (!Number.isInteger(formId) || formId <= 0) {
    return json({ ok: false, error: "formId is required" }, 400);
  }

  const form = await loadForm(ctx, formId);
  if (!form?.id) {
    return json({ ok: false, error: "Requirement not found" }, 404);
  }
  if (String(form.status) !== "merged" || form.merged_into_id === null) {
    return json({ ok: false, error: "這張訂單沒有被合併，不需要拆回" }, 400);
  }

  await ctx.db.batch([
    ctx.db
      .prepare(
        `UPDATE requirement_items
            SET requirement_form_id = origin_form_id,
                origin_form_id = NULL
          WHERE origin_form_id = ?`
      )
      .bind(formId),
    ctx.db
      .prepare(
        // 拆回一律回到 pending：合併期間主單可能已經被推進到別的狀態，
        // 直接沿用會讓一張沒人處理過的單看起來像已經處理完。
        `UPDATE requirement_forms
            SET status = 'pending',
                merged_into_id = NULL,
                merged_at = NULL,
                updated_at = datetime('now')
          WHERE id = ? AND store_id = ?`
      )
      .bind(formId, ctx.storeId),
  ]);

  return json({ ok: true, formId, orderCode: form.order_code || String(form.id) });
}
