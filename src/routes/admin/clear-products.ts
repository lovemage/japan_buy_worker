import type { RequestContext } from "../../context";

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyStorePassword(ctx: RequestContext, password: string): Promise<boolean> {
  const store = await ctx.db
    .prepare("SELECT password_hash, password_salt FROM stores WHERE id = ?")
    .bind(ctx.storeId)
    .first<{ password_hash: string; password_salt: string }>();
  if (!store?.password_hash || !store?.password_salt) return false;

  const data = new TextEncoder().encode(store.password_salt + password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest) === store.password_hash;
}

export async function handleAdminClearSyncProducts(
  request: Request,
  ctx: RequestContext
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

  const valid = await verifyStorePassword(ctx, password);
  if (!valid) {
    return new Response(JSON.stringify({ ok: false, error: "密碼錯誤" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  const result = await ctx.db
    .prepare("DELETE FROM products WHERE source_site != 'manual' AND store_id = ?")
    .bind(ctx.storeId)
    .run();

  return new Response(
    JSON.stringify({ ok: true, deleted: result?.meta?.changes || 0 }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

export async function handleAdminClearManualProducts(
  request: Request,
  ctx: RequestContext
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

  const valid = await verifyStorePassword(ctx, password);
  if (!valid) {
    return new Response(JSON.stringify({ ok: false, error: "密碼錯誤" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  // Delete R2 images for manual products
  if (ctx.r2) {
    const rows = await ctx.db
      .prepare("SELECT source_product_code FROM products WHERE source_site = 'manual' AND store_id = ?")
      .bind(ctx.storeId)
      .all<{ source_product_code: string }>();
    const codes = Array.isArray(rows?.results) ? rows.results : [];
    for (const row of codes) {
      const prefix = `${ctx.storeId}/products/${row.source_product_code}/`;
      const listed = await ctx.r2.list({ prefix });
      for (const obj of listed.objects) {
        await ctx.r2.delete(obj.key);
      }
    }
  }

  const result = await ctx.db
    .prepare("DELETE FROM products WHERE source_site = 'manual' AND store_id = ?")
    .bind(ctx.storeId)
    .run();

  return new Response(
    JSON.stringify({ ok: true, deleted: result?.meta?.changes || 0 }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
