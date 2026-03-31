import type { D1DatabaseLike } from "../../types/d1";

export const ADMIN_COOKIE_NAME = "admin_session";
const ADMIN_USER = "admin";
const SESSION_TTL_SECONDS = 86400; // 24 hours

type Env = {
  DB: D1DatabaseLike;
};

// ── Password hashing (SHA-256 + salt via Web Crypto) ──

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const s = salt || toHex(crypto.getRandomValues(new Uint8Array(16)));
  const data = new TextEncoder().encode(s + password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return { hash: toHex(digest), salt: s };
}

export async function verifyPassword(db: D1DatabaseLike, password: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT value FROM app_settings WHERE key = 'admin_password'")
    .first<{ value: string }>();
  if (!row?.value) return false; // no password set = must set one first

  // Support both legacy plaintext and new hash:salt format
  const stored = row.value;
  if (stored.includes(":")) {
    const [hash, salt] = stored.split(":");
    const result = await hashPassword(password, salt);
    return result.hash === hash;
  }
  // Legacy plaintext comparison (will be migrated on next password change)
  return password === stored;
}

export async function setPassword(db: D1DatabaseLike, password: string): Promise<void> {
  const { hash, salt } = await hashPassword(password);
  const value = `${hash}:${salt}`;
  await db
    .prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES ('admin_password', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    )
    .bind(value)
    .run();
}

// ── Session management ──

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

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toHex(bytes);
}

async function createSession(db: D1DatabaseLike): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await db
    .prepare("INSERT INTO admin_sessions (token, expires_at) VALUES (?, ?)")
    .bind(token, expiresAt)
    .run();
  // Clean up expired sessions (non-blocking best-effort)
  await db.prepare("DELETE FROM admin_sessions WHERE expires_at < datetime('now')").run().catch(() => {});
  return token;
}

async function validateSession(db: D1DatabaseLike, token: string): Promise<boolean> {
  if (!token || token.length !== 64) return false;
  const row = await db
    .prepare("SELECT token FROM admin_sessions WHERE token = ? AND expires_at > datetime('now')")
    .bind(token)
    .first<{ token: string }>();
  return !!row;
}

async function deleteSession(db: D1DatabaseLike, token: string): Promise<void> {
  if (!token) return;
  await db.prepare("DELETE FROM admin_sessions WHERE token = ?").bind(token).run().catch(() => {});
}

export async function isAdminAuthorized(request: Request, db: D1DatabaseLike): Promise<boolean> {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const token = cookies[ADMIN_COOKIE_NAME];
  if (!token) return false;
  return validateSession(db, token);
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

  if (username !== ADMIN_USER) {
    return new Response(JSON.stringify({ ok: false, error: "帳號或密碼錯誤" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  const valid = await verifyPassword(env.DB, password);
  if (!valid) {
    return new Response(JSON.stringify({ ok: false, error: "帳號或密碼錯誤" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  const token = await createSession(env.DB);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": `${ADMIN_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`,
    },
  });
}

export async function handleAdminLogout(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }

  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const token = cookies[ADMIN_COOKIE_NAME];
  await deleteSession(env.DB, token);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": `${ADMIN_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
    },
  });
}
