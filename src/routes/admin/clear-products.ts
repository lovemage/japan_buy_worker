import type { D1DatabaseLike } from "../../types/d1";

type Env = {
  DB: D1DatabaseLike;
  IMAGES?: R2Bucket;
};

const DEFAULT_ADMIN_PASS = "Curry";

async function verifyPassword(db: D1DatabaseLike, password: string): Promise<boolean> {
  let currentPass = DEFAULT_ADMIN_PASS;
  try {
    const row = await db
      .prepare("SELECT value FROM app_settings WHERE key = 'admin_password'")
      .first<{ value: string }>();
    if (row?.value) currentPass = row.value;
  } catch { /* fallback */ }
  return password === currentPass;
}

export async function handleAdminClearSyncProducts(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }

  let body: { password?: string };
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  const password = (body.password || "").trim();
  if (!password) {
    return new Response(JSON.stringify({ ok: false, error: "請輸入管理員密碼" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  const valid = await verifyPassword(env.DB, password);
  if (!valid) {
    return new Response(JSON.stringify({ ok: false, error: "密碼錯誤" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  const result = await env.DB
    .prepare("DELETE FROM products WHERE source_site != 'manual'")
    .run();

  return new Response(
    JSON.stringify({ ok: true, deleted: result?.meta?.changes || 0 }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

export async function handleAdminClearManualProducts(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }

  let body: { password?: string };
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  const password = (body.password || "").trim();
  if (!password) {
    return new Response(JSON.stringify({ ok: false, error: "請輸入管理員密碼" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  const valid = await verifyPassword(env.DB, password);
  if (!valid) {
    return new Response(JSON.stringify({ ok: false, error: "密碼錯誤" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  // Delete R2 images for manual products
  if (env.IMAGES) {
    const rows = await env.DB
      .prepare("SELECT source_product_code FROM products WHERE source_site = 'manual'")
      .all<{ source_product_code: string }>();
    const codes = Array.isArray(rows?.results) ? rows.results : [];
    for (const row of codes) {
      const prefix = `products/${row.source_product_code}/`;
      const listed = await env.IMAGES.list({ prefix });
      for (const obj of listed.objects) {
        await env.IMAGES.delete(obj.key);
      }
    }
  }

  const result = await env.DB
    .prepare("DELETE FROM products WHERE source_site = 'manual'")
    .run();

  return new Response(
    JSON.stringify({ ok: true, deleted: result?.meta?.changes || 0 }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
