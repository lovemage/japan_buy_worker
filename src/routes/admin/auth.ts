import type { D1DatabaseLike } from "../../types/d1";
import type { RequestContext } from "../../context";

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
  RESEND_API_KEY: string;
  FIREBASE_PROJECT_ID: string;
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
    // Login: create session and redirect
    const sessionToken = await createStoreSession(db, existingStore.id);
    const redirectPath = existingStore.onboarding_step === "complete"
      ? `/s/${existingStore.slug}/admin`
      : `/onboarding`;

    return new Response(null, {
      status: 302,
      headers: {
        location: `${authEnv.APP_URL}${redirectPath}`,
        "set-cookie": `${STORE_COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`,
      },
    });
  }

  // Register: create new store
  const result = await db
    .prepare(
      `INSERT INTO stores (slug, name, owner_email, password_hash, password_salt, google_id, is_active, onboarding_step)
       VALUES (?, ?, ?, '', '', ?, 1, 'email_pending')
       RETURNING id`
    )
    .bind(
      `store-${Date.now()}`, // temporary slug, user sets real one during onboarding
      userInfo.name || "My Store",
      userInfo.email,
      userInfo.sub
    )
    .first<{ id: number }>();

  if (!result) return json({ ok: false, error: "Failed to create store" }, 500);

  // Send verification email via Resend
  const emailToken = generateToken();
  const expiresAt = new Date(Date.now() + 3600_000).toISOString(); // 1 hour
  await db
    .prepare("INSERT INTO email_verifications (store_id, token, expires_at) VALUES (?, ?, ?)")
    .bind(result.id, emailToken, expiresAt)
    .run();

  await sendVerificationEmail(authEnv.RESEND_API_KEY, userInfo.email, emailToken, authEnv.APP_URL);

  // Create session for the new store
  const sessionToken = await createStoreSession(db, result.id);

  return new Response(null, {
    status: 302,
    headers: {
      location: `${authEnv.APP_URL}/onboarding`,
      "set-cookie": [
        `${STORE_COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`,
        `oauth_state=; Path=/; HttpOnly; Max-Age=0`,
      ].join(", "),
    },
  });
}

// ── Email verification via Resend ──

async function sendVerificationEmail(
  apiKey: string,
  email: string,
  token: string,
  appUrl: string
): Promise<void> {
  const verifyUrl = `${appUrl}/auth/verify-email?token=${token}`;
  await fetch("https://api.resend.com/emails", {
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
}

export async function handleVerifyEmail(request: Request, db: D1DatabaseLike, authEnv: AuthEnv): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return json({ ok: false, error: "Missing token" }, 400);

  const row = await db
    .prepare("SELECT store_id FROM email_verifications WHERE token = ? AND expires_at > datetime('now')")
    .bind(token)
    .first<{ store_id: number }>();

  if (!row) return json({ ok: false, error: "Invalid or expired token" }, 400);

  await db
    .prepare("UPDATE stores SET email_verified = 1, onboarding_step = 'phone_pending', updated_at = datetime('now') WHERE id = ? AND onboarding_step = 'email_pending'")
    .bind(row.store_id)
    .run();

  // Clean up used token
  await db.prepare("DELETE FROM email_verifications WHERE token = ?").bind(token).run();

  // Redirect to onboarding (phone verification step)
  return new Response(null, {
    status: 302,
    headers: { location: `${authEnv.APP_URL}/onboarding` },
  });
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

  // Delete old tokens and create new one
  await db.prepare("DELETE FROM email_verifications WHERE store_id = ?").bind(session.store_id).run();

  const emailToken = generateToken();
  const expiresAt = new Date(Date.now() + 3600_000).toISOString();
  await db
    .prepare("INSERT INTO email_verifications (store_id, token, expires_at) VALUES (?, ?, ?)")
    .bind(session.store_id, emailToken, expiresAt)
    .run();

  await sendVerificationEmail(authEnv.RESEND_API_KEY, store.owner_email, emailToken, authEnv.APP_URL);

  return json({ ok: true, message: "Verification email sent" });
}

// ── Firebase Phone Auth verification ──

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

  let body: { idToken?: string; phoneNumber?: string };
  try {
    body = (await request.json()) as { idToken?: string; phoneNumber?: string };
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const { idToken, phoneNumber } = body;
  if (!idToken || !phoneNumber) return json({ ok: false, error: "Missing idToken or phoneNumber" }, 400);

  // Verify Firebase ID token
  const firebaseValid = await verifyFirebaseIdToken(idToken, authEnv.FIREBASE_PROJECT_ID);
  if (!firebaseValid) {
    return json({ ok: false, error: "Invalid Firebase token" }, 400);
  }

  // Update store with verified phone
  await db
    .prepare(
      `UPDATE stores SET phone_number = ?, phone_verified = 1,
       onboarding_step = CASE WHEN onboarding_step = 'phone_pending' THEN 'store_setup' ELSE onboarding_step END,
       updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(phoneNumber, session.store_id)
    .run();

  return json({ ok: true });
}

// Verify Firebase ID token using Google's public keys
async function verifyFirebaseIdToken(idToken: string, projectId: string): Promise<boolean> {
  try {
    // Decode header to get kid
    const [headerB64] = idToken.split(".");
    const header = JSON.parse(atob(headerB64.replace(/-/g, "+").replace(/_/g, "/")));
    const kid = header.kid;

    // Fetch Google's public keys
    const keysResp = await fetch(
      "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
    );
    const keys = (await keysResp.json()) as Record<string, string>;
    const cert = keys[kid];
    if (!cert) return false;

    // Import the public key
    const pemBody = cert
      .replace("-----BEGIN CERTIFICATE-----", "")
      .replace("-----END CERTIFICATE-----", "")
      .replace(/\s/g, "");
    const der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey(
      "raw",
      der,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );

    // Verify signature
    const [, payloadB64, sigB64] = idToken.split(".");
    const signInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = Uint8Array.from(
      atob(sigB64.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0)
    );

    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signInput);
    if (!valid) return false;

    // Verify claims
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
    const now = Math.floor(Date.now() / 1000);
    if (payload.aud !== projectId) return false;
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) return false;
    if (payload.exp < now) return false;

    return true;
  } catch {
    return false;
  }
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
  if (!store.phone_verified) return json({ ok: false, error: "Phone not verified" }, 400);

  let body: { slug?: string; name?: string; lineId?: string };
  try {
    body = (await request.json()) as { slug?: string; name?: string; lineId?: string };
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const slug = (body.slug || "").trim().toLowerCase();
  const name = (body.name || "").trim();

  // Validate slug
  if (!slug || slug.length < 3 || slug.length > 30) {
    return json({ ok: false, error: "Slug must be 3-30 characters" }, 400);
  }
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && slug.length > 2) {
    return json({ ok: false, error: "Slug must be lowercase alphanumeric with hyphens, no leading/trailing hyphens" }, 400);
  }

  const RESERVED = ["api", "assets", "admin", "register", "platform-admin", "healthz", "s", "www", "auth", "onboarding"];
  if (RESERVED.includes(slug)) {
    return json({ ok: false, error: "This slug is reserved" }, 400);
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
  await db
    .prepare(
      `UPDATE stores SET slug = ?, name = ?, line_id = ?, subdomain = ?,
       onboarding_step = 'complete', updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(slug, name, body.lineId || null, slug, session.store_id)
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
    .first();

  if (!store) return json({ ok: false, error: "Store not found" }, 404);
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
