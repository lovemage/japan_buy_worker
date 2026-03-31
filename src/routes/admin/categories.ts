import type { D1DatabaseLike } from "../../types/d1";

type Env = {
  DB: D1DatabaseLike;
};

export async function handleAdminCategories(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method === "GET") {
    const rows = await env.DB
      .prepare(
        `SELECT category, COUNT(1) as total
         FROM products
         WHERE is_active = 1 AND category IS NOT NULL AND TRIM(category) != ''
         GROUP BY category
         ORDER BY total DESC, category ASC`
      )
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
      const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'custom_categories'").first<{ value: string }>();
      if (row?.value) existingList = JSON.parse(row.value);
    } catch { /* empty */ }
    if (!existingList.includes(name)) {
      existingList.push(name);
      await env.DB
        .prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('custom_categories', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
        .bind(JSON.stringify(existingList))
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
    const result = await env.DB
      .prepare("UPDATE products SET category = ?, updated_at = datetime('now') WHERE category = ?")
      .bind(newName, oldName)
      .run();
    try {
      const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'custom_categories'").first<{ value: string }>();
      if (row?.value) {
        let list: string[] = JSON.parse(row.value);
        list = list.map((c) => c === oldName ? newName : c);
        await env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('custom_categories', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')").bind(JSON.stringify(list)).run();
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
    await env.DB
      .prepare("UPDATE products SET category = NULL, updated_at = datetime('now') WHERE category = ?")
      .bind(name)
      .run();
    try {
      const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'custom_categories'").first<{ value: string }>();
      if (row?.value) {
        const list: string[] = JSON.parse(row.value).filter((c: string) => c !== name);
        await env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('custom_categories', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')").bind(JSON.stringify(list)).run();
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
