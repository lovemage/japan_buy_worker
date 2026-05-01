import type { RequestContext } from "../../context";
import { getOpenRouterApiKey, getOpenRouterModel } from "./settings";

const AI_MERGE_PLANS = ["pro", "proplus"] as const;
const AI_MERGE_API_TYPE = "ai_merge_categories";

function jsonRes(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handleAdminCategories(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "";

  if (request.method === "POST" && action === "ai-merge-suggest") {
    return handleAiMergeSuggest(ctx);
  }
  if (request.method === "POST" && action === "ai-merge-apply") {
    return handleAiMergeApply(request, ctx);
  }

  if (request.method === "GET") {
    const rows = await ctx.db
      .prepare(
        `SELECT category, COUNT(1) as total
         FROM products
         WHERE is_active = 1 AND category IS NOT NULL AND TRIM(category) != '' AND store_id = ?
         GROUP BY category
         ORDER BY total DESC, category ASC`
      )
      .bind(ctx.storeId)
      .all<{ category: string; total: number }>();
    const categories = Array.isArray(rows?.results)
      ? rows.results.map((r) => ({ name: r.category, total: r.total }))
      : [];
    return new Response(JSON.stringify({ ok: true, categories }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }

  if (request.method === "POST") {
    let body: { name?: string };
    try { body = (await request.json()) as { name?: string }; }
    catch { return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), { status: 400, headers: { "content-type": "application/json" } }); }
    const name = (body.name || "").trim();
    if (!name) {
      return new Response(JSON.stringify({ ok: false, error: "分類名稱為必填" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }
    let existingList: string[] = [];
    try {
      const row = await ctx.db.prepare("SELECT value FROM app_settings WHERE store_id = ? AND key = 'custom_categories'").bind(ctx.storeId).first<{ value: string }>();
      if (row?.value) existingList = JSON.parse(row.value);
    } catch { /* empty */ }
    if (!existingList.includes(name)) {
      existingList.push(name);
      await ctx.db
        .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'custom_categories', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
        .bind(ctx.storeId, JSON.stringify(existingList))
        .run();
    }
    return new Response(JSON.stringify({ ok: true, name }), {
      status: 201, headers: { "content-type": "application/json" },
    });
  }

  if (request.method === "PATCH") {
    let body: { oldName?: string; newName?: string };
    try { body = (await request.json()) as { oldName?: string; newName?: string }; }
    catch { return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), { status: 400, headers: { "content-type": "application/json" } }); }
    const oldName = (body.oldName || "").trim();
    const newName = (body.newName || "").trim();
    if (!oldName || !newName) {
      return new Response(JSON.stringify({ ok: false, error: "oldName 和 newName 為必填" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }
    const result = await ctx.db
      .prepare("UPDATE products SET category = ?, updated_at = datetime('now') WHERE category = ? AND store_id = ?")
      .bind(newName, oldName, ctx.storeId)
      .run();
    try {
      const row = await ctx.db.prepare("SELECT value FROM app_settings WHERE store_id = ? AND key = 'custom_categories'").bind(ctx.storeId).first<{ value: string }>();
      if (row?.value) {
        let list: string[] = JSON.parse(row.value);
        list = list.map((c) => c === oldName ? newName : c);
        await ctx.db.prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'custom_categories', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')").bind(ctx.storeId, JSON.stringify(list)).run();
      }
    } catch { /* ignore */ }
    return new Response(JSON.stringify({ ok: true, updated: result?.meta?.changes || 0 }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const name = (url.searchParams.get("name") || "").trim();
    if (!name) {
      return new Response(JSON.stringify({ ok: false, error: "name 為必填" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }
    await ctx.db
      .prepare("UPDATE products SET category = NULL, updated_at = datetime('now') WHERE category = ? AND store_id = ?")
      .bind(name, ctx.storeId)
      .run();
    try {
      const row = await ctx.db.prepare("SELECT value FROM app_settings WHERE store_id = ? AND key = 'custom_categories'").bind(ctx.storeId).first<{ value: string }>();
      if (row?.value) {
        const list: string[] = JSON.parse(row.value).filter((c: string) => c !== name);
        await ctx.db.prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'custom_categories', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')").bind(ctx.storeId, JSON.stringify(list)).run();
      }
    } catch { /* ignore */ }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
    status: 405, headers: { "content-type": "application/json" },
  });
}

type MergeGroup = {
  canonicalName: string;
  members: string[];
  reason?: string;
};

async function handleAiMergeSuggest(ctx: RequestContext): Promise<Response> {
  if (!AI_MERGE_PLANS.includes(ctx.storePlan as (typeof AI_MERGE_PLANS)[number])) {
    return jsonRes({ ok: false, error: "AI 自動分類僅限 Pro / Pro+ 方案使用，請升級方案以解鎖此功能。", upgradeRequired: true }, 403);
  }

  const now = new Date();
  const monthKey = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}`;
  const usageRow = await ctx.db
    .prepare(
      `SELECT call_count, last_called_at FROM api_usage_logs
       WHERE store_id = ? AND api_type = ? AND month_key = ?`
    )
    .bind(ctx.storeId, AI_MERGE_API_TYPE, monthKey)
    .first<{ call_count: number; last_called_at: string }>();

  if (usageRow?.last_called_at) {
    const lastDay = usageRow.last_called_at.slice(0, 10);
    const todayStr = now.toISOString().slice(0, 10);
    if (lastDay === todayStr) {
      return jsonRes({ ok: false, error: "AI 自動分類每日限用 1 次，請明天再試。", rateLimited: true }, 429);
    }
  }

  const apiKey = await getOpenRouterApiKey(ctx.db);
  if (!apiKey) {
    return jsonRes({ ok: false, error: "AI 功能尚未啟用，請聯繫 vovosnap 管理員處理" }, 400);
  }
  const modelId = await getOpenRouterModel(ctx.db);
  if (!modelId) {
    return jsonRes({ ok: false, error: "AI 模型尚未設定完成，請聯繫 vovosnap 管理員處理" }, 400);
  }

  const rows = await ctx.db
    .prepare(
      `SELECT category, title_zh_tw, title_ja
       FROM products
       WHERE is_active = 1 AND category IS NOT NULL AND TRIM(category) != '' AND store_id = ?
       ORDER BY id DESC`
    )
    .bind(ctx.storeId)
    .all<{ category: string; title_zh_tw: string | null; title_ja: string | null }>();

  const grouped: Record<string, string[]> = {};
  const list = Array.isArray(rows?.results) ? rows.results : [];
  for (const r of list) {
    const cat = (r.category || "").trim();
    if (!cat) continue;
    if (!grouped[cat]) grouped[cat] = [];
    if (grouped[cat].length < 5) {
      const t = (r.title_zh_tw || r.title_ja || "").trim();
      if (t) grouped[cat].push(t);
    }
  }

  const categoryNames = Object.keys(grouped);
  if (categoryNames.length < 2) {
    return jsonRes({ ok: false, error: "目前分類數量不足以執行合併（至少需要 2 個分類）。" }, 400);
  }

  const prompt = `你是商品分類整理專家。以下是一個電商店家目前的商品分類清單，每個分類附上最近 5 個商品標題作為內容參考。

請分析這些分類，找出語意上重複或高度相似（例如「零食」「日式餅乾」「點心」這類同義或包含關係）、應該被合併的分類群組。

分類清單：
${categoryNames.map((c) => `- 「${c}」（範例：${grouped[c].join("、") || "（無範例）"}）`).join("\n")}

請以以下 JSON 格式回傳：
{
  "merges": [
    {
      "canonicalName": "建議合併後的分類名稱（從原分類中挑最佳的一個，或建議新名稱）",
      "members": ["要被合併的分類A", "要被合併的分類B", ...],
      "reason": "簡短說明為何建議合併（20 字內）"
    }
  ]
}

規則：
- 每個 group 至少要有 2 個 members 才算合併（單一分類不需出現在結果）
- members 必須完全使用上面清單中的分類名稱（不要自己造新的）
- canonicalName 建議優先使用 members 中商品最多、最具代表性的那個名稱
- 若沒有任何分類需要合併，回傳 {"merges": []}
- 不要合併語意明顯不同的分類（例如「保養品」和「零食」絕對不能合併）`;

  let aiRes: Response;
  try {
    aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
  } catch (err) {
    return jsonRes({ ok: false, error: `OpenRouter API 連線失敗：${String(err)}` }, 502);
  }

  if (!aiRes.ok) {
    const errText = await aiRes.text().catch(() => "");
    return jsonRes({ ok: false, error: `OpenRouter API 錯誤 (${aiRes.status})：${errText.slice(0, 300)}` }, 502);
  }

  const aiData = (await aiRes.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const rawText = aiData?.choices?.[0]?.message?.content || "";
  if (!rawText) {
    return jsonRes({ ok: false, error: "AI 未回傳結果" }, 502);
  }

  let parsed: { merges?: MergeGroup[] };
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return jsonRes({ ok: false, error: "AI 回傳格式解析失敗", raw: rawText.slice(0, 500) }, 502);
  }

  const validNames = new Set(categoryNames);
  const merges: MergeGroup[] = (parsed.merges || [])
    .map((g) => ({
      canonicalName: (g.canonicalName || "").trim(),
      members: Array.isArray(g.members)
        ? Array.from(new Set(g.members.map((m) => (m || "").trim()).filter((m) => validNames.has(m))))
        : [],
      reason: (g.reason || "").trim(),
    }))
    .filter((g) => g.canonicalName && g.members.length >= 2);

  // record usage (1 per day per store)
  await ctx.db
    .prepare(
      `INSERT INTO api_usage_logs (store_id, api_type, month_key, call_count, last_called_at)
       VALUES (?, ?, ?, 1, datetime('now'))
       ON CONFLICT(store_id, api_type, month_key) DO UPDATE
         SET call_count = call_count + 1, last_called_at = datetime('now')`
    )
    .bind(ctx.storeId, AI_MERGE_API_TYPE, monthKey)
    .run()
    .catch(() => {});

  // attach product counts so the UI can show "N 件" alongside each member
  const countsRows = await ctx.db
    .prepare(
      `SELECT category, COUNT(1) as total FROM products
       WHERE is_active = 1 AND store_id = ? GROUP BY category`
    )
    .bind(ctx.storeId)
    .all<{ category: string; total: number }>();
  const counts: Record<string, number> = {};
  for (const r of (countsRows?.results || [])) counts[r.category] = r.total;

  return jsonRes({
    ok: true,
    merges: merges.map((g) => ({
      canonicalName: g.canonicalName,
      members: g.members.map((m) => ({ name: m, total: counts[m] || 0 })),
      reason: g.reason,
    })),
  });
}

async function handleAiMergeApply(request: Request, ctx: RequestContext): Promise<Response> {
  if (!AI_MERGE_PLANS.includes(ctx.storePlan as (typeof AI_MERGE_PLANS)[number])) {
    return jsonRes({ ok: false, error: "AI 自動分類僅限 Pro / Pro+ 方案使用。", upgradeRequired: true }, 403);
  }

  let body: { merges?: Array<{ canonicalName?: string; members?: string[] }> };
  try {
    body = (await request.json()) as { merges?: Array<{ canonicalName?: string; members?: string[] }> };
  } catch {
    return jsonRes({ ok: false, error: "Invalid JSON" }, 400);
  }

  const merges = Array.isArray(body.merges) ? body.merges : [];
  if (merges.length === 0) {
    return jsonRes({ ok: false, error: "未提供任何合併動作" }, 400);
  }

  // load custom_categories list once, mutate, save once
  let customList: string[] = [];
  try {
    const row = await ctx.db
      .prepare("SELECT value FROM app_settings WHERE store_id = ? AND key = 'custom_categories'")
      .bind(ctx.storeId)
      .first<{ value: string }>();
    if (row?.value) customList = JSON.parse(row.value);
  } catch { /* empty */ }

  const applied: Array<{ canonicalName: string; members: string[]; productsUpdated: number }> = [];
  const failed: Array<{ canonicalName: string; error: string }> = [];

  for (const m of merges) {
    const canonical = (m.canonicalName || "").trim();
    const membersRaw = Array.isArray(m.members) ? m.members.map((x) => (x || "").trim()).filter(Boolean) : [];
    // dedupe members; canonical itself doesn't need a rename, only the others do
    const others = Array.from(new Set(membersRaw.filter((x) => x !== canonical)));
    if (!canonical || others.length === 0) {
      failed.push({ canonicalName: canonical || "(空)", error: "資料不完整" });
      continue;
    }

    let productsUpdated = 0;
    try {
      for (const oldName of others) {
        const result = await ctx.db
          .prepare("UPDATE products SET category = ?, updated_at = datetime('now') WHERE category = ? AND store_id = ?")
          .bind(canonical, oldName, ctx.storeId)
          .run();
        productsUpdated += result?.meta?.changes || 0;
      }
      // remove merged-away names from custom_categories list, keep canonical
      customList = customList.filter((c) => !others.includes(c));
      if (!customList.includes(canonical)) customList.push(canonical);

      applied.push({ canonicalName: canonical, members: membersRaw, productsUpdated });
    } catch (err) {
      failed.push({ canonicalName: canonical, error: String(err) });
    }
  }

  try {
    await ctx.db
      .prepare(
        `INSERT INTO app_settings (store_id, key, value, updated_at)
         VALUES (?, 'custom_categories', ?, datetime('now'))
         ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      )
      .bind(ctx.storeId, JSON.stringify(customList))
      .run();
  } catch { /* ignore */ }

  return jsonRes({ ok: true, applied, failed });
}
