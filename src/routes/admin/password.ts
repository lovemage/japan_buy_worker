import type { D1DatabaseLike } from "../../types/d1";
import { verifyPassword, setPassword } from "./auth";

type Env = {
  DB: D1DatabaseLike;
};

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

  if (newPassword.length < 8) {
    return new Response(JSON.stringify({ ok: false, error: "新密碼至少 8 個字元" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  const valid = await verifyPassword(env.DB, oldPassword);
  if (!valid) {
    return new Response(JSON.stringify({ ok: false, error: "舊密碼錯誤" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  await setPassword(env.DB, newPassword);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { "content-type": "application/json" },
  });
}
