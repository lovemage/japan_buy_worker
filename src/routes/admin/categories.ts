import type { RequestContext } from "../../context";

export async function handleAdminCategories(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
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
