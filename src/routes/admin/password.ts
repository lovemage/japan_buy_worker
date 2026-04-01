import type { RequestContext } from "../../context";

function toHex(buf: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const s = salt || toHex(crypto.getRandomValues(new Uint8Array(16)));
  const data = new TextEncoder().encode(s + password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return { hash: toHex(digest), salt: s };
}

export async function handleAdminChangePassword(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }

  let body: { oldPassword?: string; newPassword?: string };
  try {
    body = (await request.json()) as { oldPassword?: string; newPassword?: string };
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  const oldPassword = (body.oldPassword || "").trim();
  const newPassword = (body.newPassword || "").trim();

  if (!oldPassword || !newPassword) {
    return new Response(JSON.stringify({ ok: false, error: "舊密碼和新密碼為必填" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  if (newPassword.length < 8) {
    return new Response(JSON.stringify({ ok: false, error: "新密碼至少 8 個字元" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  // Verify old password against stores table
  const store = await ctx.db
    .prepare("SELECT password_hash, password_salt FROM stores WHERE id = ?")
    .bind(ctx.storeId)
    .first<{ password_hash: string; password_salt: string }>();

  if (!store?.password_hash || !store?.password_salt) {
    return new Response(JSON.stringify({ ok: false, error: "舊密碼錯誤" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  const oldResult = await hashPassword(oldPassword, store.password_salt);
  if (oldResult.hash !== store.password_hash) {
    return new Response(JSON.stringify({ ok: false, error: "舊密碼錯誤" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  // Hash new password and update stores table
  const { hash, salt } = await hashPassword(newPassword);
  await ctx.db
    .prepare("UPDATE stores SET password_hash = ?, password_salt = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(hash, salt, ctx.storeId)
    .run();

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { "content-type": "application/json" },
  });
}
