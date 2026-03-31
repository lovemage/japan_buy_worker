import type { D1DatabaseLike } from "../../types/d1";

export const ADMIN_COOKIE_NAME = "admin_session";
const ADMIN_USER = "admin";
const DEFAULT_ADMIN_PASS = "Curry";
const ADMIN_COOKIE_VALUE = "ok";

type Env = {
  DB: D1DatabaseLike;
};

function parseCookieHeader(header: string | null): Record<string, string> {
  if (!header) return {};
  return header
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, item) => {
      const idx = item.indexOf("=");
      if (idx <= 0) return acc;
      acc[decodeURIComponent(item.slice(0, idx).trim())] = decodeURIComponent(item.slice(idx + 1).trim());
      return acc;
    }, {});
}

export function isAdminAuthorized(request: Request): boolean {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  return cookies[ADMIN_COOKIE_NAME] === ADMIN_COOKIE_VALUE;
}

async function getAdminPassword(db: D1DatabaseLike): Promise<string> {
  try {
    const row = await db
      .prepare("SELECT value FROM app_settings WHERE key = 'admin_password'")
      .first<{ value: string }>();
    return row?.value || DEFAULT_ADMIN_PASS;
  } catch {
    return DEFAULT_ADMIN_PASS;
  }
}

export async function handleAdminLogin(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }

  let body: { username?: string; password?: string };
  try {
    body = (await request.json()) as { username?: string; password?: string };
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  const username = (body.username || "").trim();
  const password = (body.password || "").trim();
  const adminPass = await getAdminPassword(env.DB);

  if (username !== ADMIN_USER || password !== adminPass) {
    return new Response(JSON.stringify({ ok: false, error: "帳號或密碼錯誤" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": `${ADMIN_COOKIE_NAME}=${ADMIN_COOKIE_VALUE}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
    },
  });
}

export async function handleAdminLogout(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": `${ADMIN_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    },
  });
}
