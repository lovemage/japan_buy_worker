import type { D1DatabaseLike } from "../../types/d1";

type Env = {
  DB: D1DatabaseLike;
};

const DEFAULT_ADMIN_PASS = "Curry";

export async function handleAdminChangePassword(
  request: Request,
  env: Env
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

  if (newPassword.length < 4) {
    return new Response(JSON.stringify({ ok: false, error: "新密碼至少 4 個字元" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  let currentPass = DEFAULT_ADMIN_PASS;
  try {
    const row = await env.DB
      .prepare("SELECT value FROM app_settings WHERE key = 'admin_password'")
      .first<{ value: string }>();
    if (row?.value) currentPass = row.value;
  } catch { /* fallback to default */ }

  if (oldPassword !== currentPass) {
    return new Response(JSON.stringify({ ok: false, error: "舊密碼錯誤" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  await env.DB
    .prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES ('admin_password', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    )
    .bind(newPassword)
    .run();

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { "content-type": "application/json" },
  });
}
