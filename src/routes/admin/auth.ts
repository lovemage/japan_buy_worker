import type { D1DatabaseLike } from "../../types/d1";
import type { RequestContext } from "../../context";
import { normalizeSlug, getSlugValidationError } from "../../shared/slug-rules.js";

export const STORE_COOKIE_NAME = "store_session";
const SESSION_TTL_SECONDS = 86400 * 7; // 7 days

// Legacy cookie name for backward compatibility during transition
const LEGACY_COOKIE_NAME = "admin_session";

// ── Helpers ──

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function parseCookieHeader(header: string | null): Record<string, string> {
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
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

function json(payload: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

// ── Password hashing (kept for bootstrap store backward compat) ──

export async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const s = salt || toHex(crypto.getRandomValues(new Uint8Array(16)));
  const data = new TextEncoder().encode(s + password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return { hash: toHex(digest), salt: s };
}

// ── Store session management ──

async function createStoreSession(db: D1DatabaseLike, storeId: number): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await db
    .prepare("INSERT INTO store_sessions (token, store_id, expires_at) VALUES (?, ?, ?)")
    .bind(token, storeId, expiresAt)
    .run();
  // Clean up expired sessions
  await db.prepare("DELETE FROM store_sessions WHERE expires_at < datetime('now')").run().catch(() => {});
  return token;
}

async function validateStoreSession(
  db: D1DatabaseLike,
  token: string,
  storeId: number
): Promise<boolean> {
  if (!token || token.length !== 64) return false;
  const row = await db
    .prepare("SELECT token FROM store_sessions WHERE token = ? AND store_id = ? AND expires_at > datetime('now')")
    .bind(token, storeId)
    .first<{ token: string }>();
  return !!row;
}

async function deleteStoreSession(db: D1DatabaseLike, token: string): Promise<void> {
  if (!token) return;
  await db.prepare("DELETE FROM store_sessions WHERE token = ?").bind(token).run().catch(() => {});
}

// ── Public API: check if current request is authorized for this store ──

export async function isStoreOwnerAuthorized(request: Request, ctx: RequestContext): Promise<boolean> {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const token = cookies[STORE_COOKIE_NAME] || cookies[LEGACY_COOKIE_NAME];
  if (!token) return false;
  return validateStoreSession(ctx.db, token, ctx.storeId);
}

// Legacy compat: used by index.ts during transition
export async function isAdminAuthorized(request: Request, db: D1DatabaseLike): Promise<boolean> {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const token = cookies[STORE_COOKIE_NAME] || cookies[LEGACY_COOKIE_NAME];
  if (!token) return false;
  // Check store_sessions for bootstrap store (id=1)
  const row = await db
    .prepare("SELECT token FROM store_sessions WHERE token = ? AND store_id = 1 AND expires_at > datetime('now')")
    .bind(token)
    .first<{ token: string }>();
  return !!row;
}

// ── Google OAuth ──

type GoogleTokenResponse = {
  access_token: string;
  id_token: string;
  token_type: string;
};

type GoogleUserInfo = {
  sub: string; // google_id
  email: string;
  name: string;
  picture: string;
};

type AuthEnv = {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  LINE_CHANNEL_ID: string;
  LINE_CHANNEL_SECRET: string;
  RESEND_API_KEY: string;
  EVERY8D_UID: string;
  EVERY8D_PWD: string;
  EVERY8D_SITE_URL: string;
  SMS_RELAY_URL?: string;
  SMS_RELAY_TOKEN?: string;
  APP_URL: string; // e.g. "https://vovosnap.com"
};

export function getGoogleAuthUrl(authEnv: AuthEnv, state: string): string {
  const params = new URLSearchParams({
    client_id: authEnv.GOOGLE_CLIENT_ID,
    redirect_uri: `${authEnv.APP_URL}/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeGoogleCode(code: string, authEnv: AuthEnv): Promise<GoogleTokenResponse> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: authEnv.GOOGLE_CLIENT_ID,
      client_secret: authEnv.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${authEnv.APP_URL}/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google token exchange failed: ${text}`);
  }
  return resp.json() as Promise<GoogleTokenResponse>;
}

async function getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const resp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error("Failed to get Google user info");
  return resp.json() as Promise<GoogleUserInfo>;
}

// ── Google OAuth: initiate ──

export function handleGoogleAuthRedirect(authEnv: AuthEnv): Response {
  const state = generateToken().slice(0, 32);
  const url = getGoogleAuthUrl(authEnv, state);
  return new Response(null, {
    status: 302,
    headers: {
      location: url,
      "set-cookie": `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
    },
  });
}

// ── Shared: login existing store and redirect ──

async function loginAndRedirect(
  db: D1DatabaseLike,
  store: { id: number; slug: string; onboarding_step: string },
  authEnv: AuthEnv
): Promise<Response> {
  const sessionToken = await createStoreSession(db, store.id);
  const redirectPath = store.onboarding_step === "complete"
    ? `/s/${store.slug}/admin`
    : `/onboarding`;

  return new Response(null, {
    status: 302,
    headers: {
      location: `${authEnv.APP_URL}${redirectPath}`,
      "set-cookie": `${STORE_COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`,
    },
  });
}

// ── Google OAuth: callback ──

export async function handleGoogleAuthCallback(
  request: Request,
  db: D1DatabaseLike,
  authEnv: AuthEnv
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) return json({ ok: false, error: `Google auth error: ${error}` }, 400);
  if (!code || !state) return json({ ok: false, error: "Missing code or state" }, 400);

  // Verify state
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  if (cookies["oauth_state"] !== state) {
    return json({ ok: false, error: "Invalid OAuth state" }, 400);
  }

  // Exchange code for tokens
  const tokens = await exchangeGoogleCode(code, authEnv);
  const userInfo = await getGoogleUserInfo(tokens.access_token);

  // Check if store already exists for this Google account
  const existingStore = await db
    .prepare("SELECT id, slug, onboarding_step FROM stores WHERE google_id = ?")
    .bind(userInfo.sub)
    .first<{ id: number; slug: string; onboarding_step: string }>();

  if (existingStore) {
    return loginAndRedirect(db, existingStore, authEnv);
  }

  // Account merge: check if a store with the same email already exists (e.g. registered via LINE)
  const emailStore = await db
    .prepare("SELECT id, slug, onboarding_step FROM stores WHERE owner_email = ? AND google_id IS NULL")
    .bind(userInfo.email)
    .first<{ id: number; slug: string; onboarding_step: string }>();

  if (emailStore) {
    // Link Google account to existing store
    await db
      .prepare("UPDATE stores SET google_id = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(userInfo.sub, emailStore.id)
      .run();
    return loginAndRedirect(db, emailStore, authEnv);
  }

  // Register: create new store
  const tempSlug = `store-${Date.now()}`;
  await db
    .prepare(
      `INSERT INTO stores (slug, name, owner_email, password_hash, password_salt, google_id, destination_country, display_currency, is_active, onboarding_step)
       VALUES (?, ?, ?, '', '', ?, 'tw', 'TWD', 1, 'email_pending')`
    )
    .bind(tempSlug, userInfo.name || "My Store", userInfo.email, userInfo.sub)
    .run();

  // Fetch the newly created store ID
  const newStore = await db
    .prepare("SELECT id FROM stores WHERE google_id = ?")
    .bind(userInfo.sub)
    .first<{ id: number }>();

  if (!newStore) return json({ ok: false, error: "Failed to create store" }, 500);

  // Send verification email via Resend
  const emailToken = generateToken();
  const expiresAt = new Date(Date.now() + 3600_000).toISOString(); // 1 hour
  await db
    .prepare("INSERT INTO email_verifications (store_id, token, expires_at) VALUES (?, ?, ?)")
    .bind(newStore.id, emailToken, expiresAt)
    .run();

  try {
    await sendVerificationEmail(authEnv.RESEND_API_KEY, userInfo.email, emailToken, authEnv.APP_URL);
  } catch (e) {
    console.error("Failed to send verification email:", e);
  }

  // Create session for the new store
  const sessionToken = await createStoreSession(db, newStore.id);

  const headers = new Headers();
  headers.set("location", `${authEnv.APP_URL}/onboarding`);
  headers.append("set-cookie", `${STORE_COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`);
  headers.append("set-cookie", `oauth_state=; Path=/; HttpOnly; Max-Age=0`);

  return new Response(null, { status: 302, headers });
}

// ── LINE Login OAuth ──

type LineTokenResponse = {
  access_token: string;
  id_token: string;
  token_type: string;
  scope: string;
};

type LineIdTokenPayload = {
  sub: string; // LINE user ID
  name: string;
  email?: string;
};

function getLineAuthUrl(authEnv: AuthEnv, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: authEnv.LINE_CHANNEL_ID,
    redirect_uri: `${authEnv.APP_URL}/auth/line/callback`,
    state,
    scope: "profile openid email",
  });
  return `https://access.line.me/oauth2/v2.1/authorize?${params}`;
}

async function exchangeLineCode(code: string, authEnv: AuthEnv): Promise<LineTokenResponse> {
  const resp = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${authEnv.APP_URL}/auth/line/callback`,
      client_id: authEnv.LINE_CHANNEL_ID,
      client_secret: authEnv.LINE_CHANNEL_SECRET,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`LINE token exchange failed: ${text}`);
  }
  return resp.json() as Promise<LineTokenResponse>;
}

function decodeLineIdToken(idToken: string): LineIdTokenPayload {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Invalid LINE ID token");
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
  return { sub: payload.sub, name: payload.name || "", email: payload.email };
}

// Helper for LINE ID token decoding
function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

// ── LINE Login: initiate ──

export function handleLineAuthRedirect(authEnv: AuthEnv): Response {
  const state = generateToken().slice(0, 32);
  const url = getLineAuthUrl(authEnv, state);
  return new Response(null, {
    status: 302,
    headers: {
      location: url,
      "set-cookie": `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
    },
  });
}

// ── LINE Login: callback ──

export async function handleLineAuthCallback(
  request: Request,
  db: D1DatabaseLike,
  authEnv: AuthEnv
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) return json({ ok: false, error: `LINE auth error: ${error}` }, 400);
  if (!code || !state) return json({ ok: false, error: "Missing code or state" }, 400);

  // Verify state
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  if (cookies["oauth_state"] !== state) {
    return json({ ok: false, error: "Invalid OAuth state" }, 400);
  }

  // Exchange code for tokens
  const tokens = await exchangeLineCode(code, authEnv);
  const lineUser = decodeLineIdToken(tokens.id_token);

  // Check if store already exists for this LINE account
  const existingStore = await db
    .prepare("SELECT id, slug, onboarding_step FROM stores WHERE line_login_id = ?")
    .bind(lineUser.sub)
    .first<{ id: number; slug: string; onboarding_step: string }>();

  if (existingStore) {
    return loginAndRedirect(db, existingStore, authEnv);
  }

  // Account merge: if LINE provided email, check if a store with that email already exists (e.g. registered via Google)
  if (lineUser.email) {
    const emailStore = await db
      .prepare("SELECT id, slug, onboarding_step FROM stores WHERE owner_email = ? AND line_login_id IS NULL")
      .bind(lineUser.email)
      .first<{ id: number; slug: string; onboarding_step: string }>();

    if (emailStore) {
      // Link LINE account to existing store
      await db
        .prepare("UPDATE stores SET line_login_id = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(lineUser.sub, emailStore.id)
        .run();
      return loginAndRedirect(db, emailStore, authEnv);
    }
  }

  // Register: create new store
  const tempSlug = `store-${Date.now()}`;
  // owner_email is NOT NULL UNIQUE — use placeholder if LINE didn't provide email
  const ownerEmail = lineUser.email || `line-pending-${lineUser.sub}@placeholder.local`;

  await db
    .prepare(
      `INSERT INTO stores (slug, name, owner_email, password_hash, password_salt, line_login_id, destination_country, display_currency, is_active, onboarding_step)
       VALUES (?, ?, ?, '', '', ?, 'tw', 'TWD', 1, 'email_pending')`
    )
    .bind(tempSlug, lineUser.name || "My Store", ownerEmail, lineUser.sub)
    .run();

  // Fetch the newly created store ID
  const newStore = await db
    .prepare("SELECT id FROM stores WHERE line_login_id = ?")
    .bind(lineUser.sub)
    .first<{ id: number }>();

  if (!newStore) return json({ ok: false, error: "Failed to create store" }, 500);

  // If LINE provided a real email, send verification email immediately
  if (lineUser.email) {
    const emailToken = generateToken();
    const expiresAt = new Date(Date.now() + 3600_000).toISOString();
    await db
      .prepare("INSERT INTO email_verifications (store_id, token, expires_at) VALUES (?, ?, ?)")
      .bind(newStore.id, emailToken, expiresAt)
      .run();

    try {
      await sendVerificationEmail(authEnv.RESEND_API_KEY, lineUser.email, emailToken, authEnv.APP_URL);
    } catch (e) {
      console.error("Failed to send verification email:", e);
    }
  }

  // Create session for the new store
  const sessionToken = await createStoreSession(db, newStore.id);

  const headers = new Headers();
  headers.set("location", `${authEnv.APP_URL}/onboarding`);
  headers.append("set-cookie", `${STORE_COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`);
  headers.append("set-cookie", `oauth_state=; Path=/; HttpOnly; Max-Age=0`);

  return new Response(null, { status: 302, headers });
}

// ── Email verification via Resend ──

async function sendVerificationEmail(
  apiKey: string,
  email: string,
  token: string,
  appUrl: string
): Promise<void> {
  const verifyUrl = `${appUrl}/auth/verify-email?token=${token}`;
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: "vovosnap <noreply@vovosnap.com>",
      to: [email],
      subject: "驗證你的 vovosnap 帳號",
      html: `
        <h2>歡迎加入 vovosnap!</h2>
        <p>點擊下方連結驗證你的 email：</p>
        <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#333;color:#fff;text-decoration:none;border-radius:6px;">驗證 Email</a>
        <p style="color:#888;font-size:12px;margin-top:20px;">此連結 1 小時後失效。</p>
      `,
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`Resend API error (${resp.status}):`, errText);
    throw new Error(`Resend failed: ${resp.status} ${errText}`);
  }
}

export async function handleVerifyEmail(request: Request, db: D1DatabaseLike, authEnv: AuthEnv): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return json({ ok: false, error: "Missing token" }, 400);

  const row = await db
    .prepare("SELECT store_id FROM email_verifications WHERE token = ? AND expires_at > datetime('now')")
    .bind(token)
    .first<{ store_id: number }>();

  if (!row) {
    // Show a user-friendly page instead of raw JSON
    return new Response(`
      <html><head><meta charset="UTF-8"><title>vovosnap</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:60px 20px;">
        <h2>連結已失效或無效</h2>
        <p style="color:#888;">請回到 <a href="${authEnv.APP_URL}/onboarding">onboarding 頁面</a> 重新發送驗證信。</p>
      </body></html>
    `, { status: 400, headers: { "content-type": "text/html; charset=UTF-8" } });
  }

  await db
    .prepare("UPDATE stores SET email_verified = 1, onboarding_step = 'phone_pending', updated_at = datetime('now') WHERE id = ? AND onboarding_step = 'email_pending'")
    .bind(row.store_id)
    .run();

  // Clean up used token
  await db.prepare("DELETE FROM email_verifications WHERE token = ?").bind(token).run();

  // Redirect to onboarding (store setup step)
  return new Response(null, {
    status: 302,
    headers: { location: `${authEnv.APP_URL}/onboarding` },
  });
}

// ── Set email for LINE Login users who didn't grant email scope ──

export async function handleSetEmail(
  request: Request,
  db: D1DatabaseLike,
  authEnv: AuthEnv
): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const sessionToken = cookies[STORE_COOKIE_NAME];
  if (!sessionToken) return json({ ok: false, error: "Unauthorized" }, 401);

  const session = await db
    .prepare("SELECT store_id FROM store_sessions WHERE token = ? AND expires_at > datetime('now')")
    .bind(sessionToken)
    .first<{ store_id: number }>();
  if (!session) return json({ ok: false, error: "Unauthorized" }, 401);

  const store = await db
    .prepare("SELECT owner_email, email_verified FROM stores WHERE id = ?")
    .bind(session.store_id)
    .first<{ owner_email: string | null; email_verified: number }>();
  if (!store) return json({ ok: false, error: "Store not found" }, 404);
  if (store.email_verified) return json({ ok: true, message: "Already verified" });

  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const email = (body.email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: "請輸入有效的 Email" }, 400);
  }

  // Check if email is already used by another store
  const existing = await db
    .prepare("SELECT id, line_login_id, google_id FROM stores WHERE owner_email = ? AND id != ?")
    .bind(email, session.store_id)
    .first<{ id: number; line_login_id: string | null; google_id: string | null }>();

  if (existing) {
    // Account merge: current store is a LINE-only placeholder, target has the same email
    // Get current store's line_login_id to transfer it
    const currentStore = await db
      .prepare("SELECT line_login_id FROM stores WHERE id = ?")
      .bind(session.store_id)
      .first<{ line_login_id: string | null }>();

    if (currentStore?.line_login_id && !existing.line_login_id) {
      // Merge: link LINE provider to existing store, delete placeholder
      // Clear line_login_id from placeholder first to avoid UNIQUE constraint violation
      await db
        .prepare("UPDATE stores SET line_login_id = NULL, updated_at = datetime('now') WHERE id = ?")
        .bind(session.store_id)
        .run();
      await db
        .prepare("UPDATE stores SET line_login_id = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(currentStore.line_login_id, existing.id)
        .run();

      // Move session to the merged store
      await db
        .prepare("UPDATE store_sessions SET store_id = ? WHERE token = ?")
        .bind(existing.id, sessionToken)
        .run();

      // Delete placeholder store and its orphaned data
      await db.prepare("DELETE FROM email_verifications WHERE store_id = ?").bind(session.store_id).run();
      await db.prepare("DELETE FROM store_sessions WHERE store_id = ?").bind(session.store_id).run();
      await db.prepare("DELETE FROM stores WHERE id = ?").bind(session.store_id).run();

      return json({ ok: true, message: "Account merged", merged: true });
    }

    return json({ ok: false, error: "此 Email 已被其他帳號使用" }, 409);
  }

  // Update store email
  await db
    .prepare("UPDATE stores SET owner_email = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(email, session.store_id)
    .run();

  // Send verification email
  const emailToken = generateToken();
  const expiresAt = new Date(Date.now() + 3600_000).toISOString();
  await db
    .prepare("INSERT INTO email_verifications (store_id, token, expires_at) VALUES (?, ?, ?)")
    .bind(session.store_id, emailToken, expiresAt)
    .run();

  try {
    await sendVerificationEmail(authEnv.RESEND_API_KEY, email, emailToken, authEnv.APP_URL);
  } catch (e) {
    console.error("Failed to send verification email:", e);
    return json({ ok: false, error: "發送驗證信失敗，請稍後再試" }, 500);
  }

  return json({ ok: true, message: "Verification email sent" });
}

// ── Resend verification email ──

export async function handleResendVerificationEmail(
  request: Request,
  db: D1DatabaseLike,
  authEnv: AuthEnv
): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

  // Get store from session
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const sessionToken = cookies[STORE_COOKIE_NAME];
  if (!sessionToken) return json({ ok: false, error: "Unauthorized" }, 401);

  const session = await db
    .prepare("SELECT store_id FROM store_sessions WHERE token = ? AND expires_at > datetime('now')")
    .bind(sessionToken)
    .first<{ store_id: number }>();
  if (!session) return json({ ok: false, error: "Unauthorized" }, 401);

  const store = await db
    .prepare("SELECT owner_email, email_verified FROM stores WHERE id = ?")
    .bind(session.store_id)
    .first<{ owner_email: string; email_verified: number }>();
  if (!store) return json({ ok: false, error: "Store not found" }, 404);
  if (store.email_verified) return json({ ok: true, message: "Already verified" });

  // Delete only expired tokens (keep valid ones so old emails still work)
  await db.prepare("DELETE FROM email_verifications WHERE store_id = ? AND expires_at < datetime('now')").bind(session.store_id).run();

  const emailToken = generateToken();
  const expiresAt = new Date(Date.now() + 3600_000).toISOString();
  await db
    .prepare("INSERT INTO email_verifications (store_id, token, expires_at) VALUES (?, ?, ?)")
    .bind(session.store_id, emailToken, expiresAt)
    .run();

  await sendVerificationEmail(authEnv.RESEND_API_KEY, store.owner_email, emailToken, authEnv.APP_URL);

  return json({ ok: true, message: "Verification email sent" });
}

// ── Every8D SMS Phone verification ──

import {
  sendSMS,
  generateVerificationCode,
  createEvery8DConfig,
} from "../../services/every8d.js";

const SMS_CODE_EXPIRY_SECONDS = 600; // 10 minutes
const SMS_MAX_ATTEMPTS = 5;

/**
 * Send phone verification code via Every8D SMS
 */
export async function handleSendPhoneCode(
  request: Request,
  db: D1DatabaseLike,
  authEnv: AuthEnv
): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

  // Get store from session
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const sessionToken = cookies[STORE_COOKIE_NAME];
  if (!sessionToken) return json({ ok: false, error: "Unauthorized" }, 401);

  const session = await db
    .prepare("SELECT store_id FROM store_sessions WHERE token = ? AND expires_at > datetime('now')")
    .bind(sessionToken)
    .first<{ store_id: number }>();
  if (!session) return json({ ok: false, error: "Unauthorized" }, 401);

  let body: { phoneNumber?: string };
  try {
    body = (await request.json()) as { phoneNumber?: string };
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const { phoneNumber } = body;
  if (!phoneNumber) return json({ ok: false, error: "Missing phoneNumber" }, 400);

  // Validate phone format (basic)
  const cleanPhone = phoneNumber.replace(/[\s\-()]/g, "");
  if (!/^[+]?[0-9]{8,15}$/.test(cleanPhone)) {
    return json({ ok: false, error: "手機號碼格式不正確" }, 400);
  }

  // Test phone numbers — bypass duplicate check
  const TEST_PHONES = ["+886912305910", "+886928901964", "+886979661678"];
  const isTestPhone = TEST_PHONES.includes(cleanPhone);

  // Check if phone number is already used by another store
  if (!isTestPhone) {
    const existing = await db
      .prepare("SELECT id FROM stores WHERE phone_number = ? AND id != ?")
      .bind(cleanPhone, session.store_id)
      .first<{ id: number }>();
    if (existing) {
      return json({ ok: false, error: "此手機號碼已被其他帳號使用" }, 409);
    }
  }

  // Rate limit: check if we sent a code recently (within 60 seconds)
  const recentCode = await db
    .prepare("SELECT id FROM phone_verification_codes WHERE store_id = ? AND created_at > datetime('now', '-60 seconds')")
    .bind(session.store_id)
    .first();
  if (recentCode) {
    return json({ ok: false, error: "請等待 60 秒後再重新發送" }, 429);
  }

  // Generate verification code
  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + SMS_CODE_EXPIRY_SECONDS * 1000).toISOString();

  // Delete old codes for this store
  await db.prepare("DELETE FROM phone_verification_codes WHERE store_id = ?").bind(session.store_id).run();

  // Insert new code
  await db
    .prepare("INSERT INTO phone_verification_codes (store_id, phone_number, code, expires_at) VALUES (?, ?, ?, ?)")
    .bind(session.store_id, cleanPhone, code, expiresAt)
    .run();

  // Send SMS via Every8D
  // Check credentials are configured
  if (!authEnv.EVERY8D_UID || !authEnv.EVERY8D_PWD) {
    console.error("Every8D credentials missing: EVERY8D_UID or EVERY8D_PWD not set");
    return json({ ok: false, error: "簡訊服務未配置，請聯繫管理員" }, 500);
  }

  try {
    const config = createEvery8DConfig({
      EVERY8D_UID: authEnv.EVERY8D_UID,
      EVERY8D_PWD: authEnv.EVERY8D_PWD,
      EVERY8D_SITE_URL: authEnv.EVERY8D_SITE_URL,
      SMS_RELAY_URL: authEnv.SMS_RELAY_URL,
      SMS_RELAY_TOKEN: authEnv.SMS_RELAY_TOKEN,
    });

    const message = `您的 vovosnap 驗證碼為 ${code}，有效期 10 分鐘。如非本人操作請忽略此簡訊。`;
    console.log("Sending SMS via Every8D to:", cleanPhone, "site:", config.siteUrl);
    const result = await sendSMS(config, cleanPhone, message);
    console.log("Every8D SMS result:", result);

    return json({ ok: true, message: "驗證碼已發送" });
  } catch (e) {
    console.error("Every8D SMS error:", e);
    return json({ ok: false, error: "發送簡訊失敗: " + (e instanceof Error ? e.message : String(e)) }, 500);
  }
}

/**
 * Verify phone code
 */
export async function handleVerifyPhone(
  request: Request,
  db: D1DatabaseLike,
  authEnv: AuthEnv
): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

  // Get store from session
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const sessionToken = cookies[STORE_COOKIE_NAME];
  if (!sessionToken) return json({ ok: false, error: "Unauthorized" }, 401);

  const session = await db
    .prepare("SELECT store_id FROM store_sessions WHERE token = ? AND expires_at > datetime('now')")
    .bind(sessionToken)
    .first<{ store_id: number }>();
  if (!session) return json({ ok: false, error: "Unauthorized" }, 401);

  let body: { code?: string };
  try {
    body = (await request.json()) as { code?: string };
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const { code } = body;
  if (!code) return json({ ok: false, error: "Missing verification code" }, 400);

  // Get stored verification code
  const storedCode = await db
    .prepare("SELECT id, phone_number, code, attempts, expires_at FROM phone_verification_codes WHERE store_id = ?")
    .bind(session.store_id)
    .first<{ id: number; phone_number: string; code: string; attempts: number; expires_at: string }>();

  if (!storedCode) {
    return json({ ok: false, error: "請先發送驗證碼" }, 400);
  }

  // Check expiry
  if (new Date(storedCode.expires_at) < new Date()) {
    await db.prepare("DELETE FROM phone_verification_codes WHERE id = ?").bind(storedCode.id).run();
    return json({ ok: false, error: "驗證碼已過期，請重新發送" }, 400);
  }

  // Check attempts
  if (storedCode.attempts >= SMS_MAX_ATTEMPTS) {
    await db.prepare("DELETE FROM phone_verification_codes WHERE id = ?").bind(storedCode.id).run();
    return json({ ok: false, error: "嘗試次數過多，請重新發送驗證碼" }, 429);
  }

  // Verify code
  if (storedCode.code !== code) {
    // Increment attempts
    await db
      .prepare("UPDATE phone_verification_codes SET attempts = attempts + 1 WHERE id = ?")
      .bind(storedCode.id)
      .run();
    return json({ ok: false, error: "驗證碼錯誤" }, 400);
  }

  // Code is correct - update store with verified phone
  await db
    .prepare(
      `UPDATE stores SET phone_number = ?, phone_verified = 1,
       onboarding_step = CASE WHEN onboarding_step = 'phone_pending' THEN 'store_setup' ELSE onboarding_step END,
       updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(storedCode.phone_number, session.store_id)
    .run();

  // Delete used verification code
  await db.prepare("DELETE FROM phone_verification_codes WHERE id = ?").bind(storedCode.id).run();

  return json({ ok: true });
}

// ── Store onboarding: set slug and finalize ──

export async function handleCompleteOnboarding(
  request: Request,
  db: D1DatabaseLike
): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const sessionToken = cookies[STORE_COOKIE_NAME];
  if (!sessionToken) return json({ ok: false, error: "Unauthorized" }, 401);

  const session = await db
    .prepare("SELECT store_id FROM store_sessions WHERE token = ? AND expires_at > datetime('now')")
    .bind(sessionToken)
    .first<{ store_id: number }>();
  if (!session) return json({ ok: false, error: "Unauthorized" }, 401);

  const store = await db
    .prepare("SELECT email_verified, phone_verified, onboarding_step FROM stores WHERE id = ?")
    .bind(session.store_id)
    .first<{ email_verified: number; phone_verified: number; onboarding_step: string }>();

  if (!store) return json({ ok: false, error: "Store not found" }, 404);
  if (!store.email_verified) return json({ ok: false, error: "Email not verified" }, 400);

  let body: { slug?: string; name?: string; lineId?: string; description?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const slug = normalizeSlug(body.slug || "");
  const name = (body.name || "").trim();

  const slugError = getSlugValidationError(slug);
  if (slugError) {
    return json({ ok: false, error: slugError }, 400);
  }

  if (!name || name.length < 1 || name.length > 100) {
    return json({ ok: false, error: "Store name is required (max 100 chars)" }, 400);
  }

  // Check slug uniqueness
  const existing = await db
    .prepare("SELECT id FROM stores WHERE slug = ? AND id != ?")
    .bind(slug, session.store_id)
    .first();
  if (existing) {
    return json({ ok: false, error: "This slug is already taken" }, 400);
  }

  // Update store
  const description = (body.description || "").trim().slice(0, 200);
  await db
    .prepare(
      `UPDATE stores SET slug = ?, name = ?, description = ?, line_id = ?, subdomain = ?,
       onboarding_step = 'complete', updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(slug, name, description, body.lineId || null, slug, session.store_id)
    .run();

  return json({ ok: true, slug, redirectUrl: `/s/${slug}/admin` });
}

// ── Store logout ──

export async function handleStoreLogout(request: Request, ctx: RequestContext): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const token = cookies[STORE_COOKIE_NAME] || cookies[LEGACY_COOKIE_NAME];
  await deleteStoreSession(ctx.db, token);

  return json({ ok: true }, 200, {
    "set-cookie": `${STORE_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  });
}

// ── Get current session store info ──

export async function handleGetCurrentStore(
  request: Request,
  db: D1DatabaseLike
): Promise<Response> {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const sessionToken = cookies[STORE_COOKIE_NAME];
  if (!sessionToken) return json({ ok: false, error: "Not logged in" }, 401);

  const session = await db
    .prepare("SELECT store_id FROM store_sessions WHERE token = ? AND expires_at > datetime('now')")
    .bind(sessionToken)
    .first<{ store_id: number }>();
  if (!session) return json({ ok: false, error: "Session expired" }, 401);

  const store = await db
    .prepare(
      `SELECT id, slug, name, owner_email, destination_country, display_currency,
       line_id, plan, email_verified, phone_verified, onboarding_step
       FROM stores WHERE id = ?`
    )
    .bind(session.store_id)
    .first<Record<string, any>>();

  if (!store) return json({ ok: false, error: "Store not found" }, 404);
  // Hide placeholder email from LINE Login users
  if (store.owner_email && store.owner_email.endsWith("@placeholder.local")) {
    store.owner_email = null;
  }
  return json({ ok: true, store });
}

// Legacy handlers for backward compat (used by index.ts during transition)
export async function handleAdminLogin(request: Request, env: { DB: D1DatabaseLike }): Promise<Response> {
  // Bootstrap store login via password (temporary, will be removed)
  if (request.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

  let body: { username?: string; password?: string };
  try {
    body = (await request.json()) as { username?: string; password?: string };
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const password = (body.password || "").trim();
  if (!password) return json({ ok: false, error: "帳號或密碼錯誤" }, 401);

  // Verify against bootstrap store's password
  const store = await env.DB
    .prepare("SELECT id, password_hash, password_salt FROM stores WHERE id = 1")
    .first<{ id: number; password_hash: string; password_salt: string }>();

  if (!store || !store.password_hash) return json({ ok: false, error: "帳號或密碼錯誤" }, 401);

  const result = await hashPassword(password, store.password_salt);
  if (result.hash !== store.password_hash) {
    return json({ ok: false, error: "帳號或密碼錯誤" }, 401);
  }

  const token = await createStoreSession(env.DB, 1);

  return json({ ok: true }, 200, {
    "set-cookie": `${STORE_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`,
  });
}

export async function handleAdminLogout(request: Request, env: { DB: D1DatabaseLike }): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const token = cookies[STORE_COOKIE_NAME] || cookies[LEGACY_COOKIE_NAME];
  await deleteStoreSession(env.DB, token);

  return json({ ok: true }, 200, {
    "set-cookie": `${STORE_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
  });
}
