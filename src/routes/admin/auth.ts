export const ADMIN_COOKIE_NAME = "admin_session";
const ADMIN_USER = "admin";
const ADMIN_PASS = "Curry";
const ADMIN_COOKIE_VALUE = "ok";

function parseCookieHeader(header: string | null): Record<string, string> {
  if (!header) {
    return {};
  }
  return header
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, item) => {
      const idx = item.indexOf("=");
      if (idx <= 0) {
        return acc;
      }
      const key = decodeURIComponent(item.slice(0, idx).trim());
      const value = decodeURIComponent(item.slice(idx + 1).trim());
      acc[key] = value;
      return acc;
    }, {});
}

export function isAdminAuthorized(request: Request): boolean {
  const cookieHeader = request.headers.get("cookie");
  const cookies = parseCookieHeader(cookieHeader);
  return cookies[ADMIN_COOKIE_NAME] === ADMIN_COOKIE_VALUE;
}

export async function handleAdminLogin(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  let body: { username?: string; password?: string };
  try {
    body = (await request.json()) as { username?: string; password?: string };
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const username = (body.username || "").trim();
  const password = (body.password || "").trim();
  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    return new Response(JSON.stringify({ ok: false, error: "帳號或密碼錯誤" }), {
      status: 401,
      headers: { "content-type": "application/json" },
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
      status: 405,
      headers: { "content-type": "application/json" },
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
