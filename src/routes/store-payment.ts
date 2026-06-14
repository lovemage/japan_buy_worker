// src/routes/store-payment.ts
// Store-owned PAYUNi collection — backend route handlers.
// All handlers live in this file; index.ts dispatches by pathname prefix.
//
// Security invariants (§15):
//   – Merchant credentials never leave the server in plaintext
//   – Amount is always taken from DB, never from client input
//   – Signature verification (verifyAndDecrypt) happens BEFORE trusting any payload
//   – store_id is re-verified against decrypted MerTradeNo on every notify
//   – Terminal order states (paid/failed/expired/cancelled) are never mutated by notify
//   – Public endpoints return consistent minimal errors to prevent enumeration
//
// Rate limiting (§15.3): TODO — add Durable-Objects / KV-based rate limiting
// on /api/store-pay/public/* and /notify (IP + order + store dimensions).
// This is architectural infrastructure outside the scope of this phase.

import type { D1DatabaseLike } from "../types/d1";
import { buildUppRequest, verifyAndDecrypt, apiBase, encryptInfo, hashInfo } from "../shared/payuni.js";
import { parseCookieHeader, STORE_COOKIE_NAME } from "./admin/auth";
import { seal, open, getLatestVersion, DecryptError } from "../shared/secret-box.js";
import {
  parseCanonicalAmount,
  genMerTradeNo,
  genPublicToken,
  decideStoreNotifyAction,
  computeExpiresAt,
  canUseStoreCollection,
  computeEffectiveEnabled,
} from "../shared/store-payment-logic.js";

// ── Env type ──────────────────────────────────────────────────────────────────

export type StorePayEnv = {
  DB: D1DatabaseLike;
  APP_URL: string;
  MAIN_DOMAIN?: string;
  // STORE_PAY_ENC_KEY_V1, _V2 … are accessed via index signature
  [key: string]: unknown;
};

// ── Row types ─────────────────────────────────────────────────────────────────

type SessionStore = {
  id: number;
  slug: string;
  name: string;
  plan: string;
  plan_expires_at: string | null;
  owner_email: string | null;
  subdomain: string | null;
};

type StorePayConfigRow = {
  id: number;
  store_id: number;
  provider: string;
  mer_id_enc: string | null;
  hash_key_enc: string | null;
  hash_iv_enc: string | null;
  enc_version: number;
  mer_id_last4: string | null;
  is_sandbox: number;
  is_enabled: number;
  last_tested_at: string | null;
  last_test_status: string | null;
  created_at: string;
  updated_at: string;
};

type StorePayOrderRow = {
  id: number;
  store_id: number;
  public_token: string;
  mer_trade_no: string;
  kind: string;
  title: string;
  amount: number;
  currency: string;
  status: string;
  is_sandbox: number;
  buyer_email: string | null;
  requirement_form_id: number | null;
  expires_at: string;
  created_under_plan: string | null;
  plan_valid_until_at: string | null;
  checkout_started_at: string | null;
  pay_type: string | null;
  payuni_trade_no: string | null;
  payuni_auth_no: string | null;
  payuni_pay_time: string | null;
  atm_bank_code: string | null;
  atm_account: string | null;
  atm_expire_at: string | null;
  raw_notify: string | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
};

// ── Small helpers ─────────────────────────────────────────────────────────────

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Generic public error — does NOT reveal whether an order exists (§15.3)
function publicNotFound(): Response {
  return json({ ok: false, error: "not_found" }, 404);
}

async function parseNotifyForm(request: Request): Promise<Record<string, string>> {
  const form = await request.formData();
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) out[k] = String(v);
  return out;
}

// Inline effective-plan check (mirrors context.ts getEffectivePlan logic)
// without requiring a full StoreRow import.
function effectivePlan(plan: string, planExpiresAt: string | null): string {
  const paidPlans = ["plus", "pro", "proplus"];
  if (paidPlans.includes(plan) && planExpiresAt) {
    if (new Date(planExpiresAt) < new Date()) return "free";
  }
  return plan;
}

function configIsValid(cfg: StorePayConfigRow | null): boolean {
  return Boolean(cfg && cfg.mer_id_enc && cfg.hash_key_enc && cfg.hash_iv_enc);
}

function mainDomain(env: StorePayEnv): string {
  return typeof env.MAIN_DOMAIN === "string" ? env.MAIN_DOMAIN : "vovosnap.com";
}

// ── Session / gate helpers ─────────────────────────────────────────────────────

async function getSessionStore(request: Request, db: D1DatabaseLike): Promise<SessionStore | null> {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const token = cookies[STORE_COOKIE_NAME];
  if (!token) return null;
  const session = await db
    .prepare("SELECT store_id FROM store_sessions WHERE token = ? AND expires_at > datetime('now')")
    .bind(token)
    .first<{ store_id: number }>();
  if (!session) return null;
  return db
    .prepare(
      "SELECT id, slug, name, plan, plan_expires_at, owner_email, subdomain " +
      "FROM stores WHERE id = ? AND is_active = 1"
    )
    .bind(session.store_id)
    .first<SessionStore>();
}

// ── Audit log ─────────────────────────────────────────────────────────────────

// Mirrors the ensureLogTable pattern from platform-admin.ts.
async function ensureAuditTable(db: D1DatabaseLike): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS store_pay_audit_logs (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id    INTEGER NOT NULL,
        action      TEXT    NOT NULL,
        is_sandbox  INTEGER,
        mer_id_last4 TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    )
    .run();
}

async function writeAuditLog(
  db: D1DatabaseLike,
  { storeId, action, isSandbox, merIdLast4 }: {
    storeId: number;
    action: string;
    isSandbox: number | null;
    merIdLast4: string | null;
  }
): Promise<void> {
  await ensureAuditTable(db);
  await db
    .prepare(
      "INSERT INTO store_pay_audit_logs (store_id, action, is_sandbox, mer_id_last4) VALUES (?, ?, ?, ?)"
    )
    .bind(storeId, action, isSandbox, merIdLast4)
    .run();
}

// ── PAYUNi test-connection helper ─────────────────────────────────────────────
//
// Calls PAYUNi's trade-query endpoint with a signed request for a throwaway
// MerTradeNo.  Any response that doesn't indicate credential/signature error is
// treated as "ok" (the order simply won't exist, which is fine).
//
// NOTE: The exact success/fail heuristic below was written from PAYUNi API
// conventions.  It may need tuning against live PAYUNi behavior — for example,
// if PAYUNi returns a different error code structure for auth failures.
async function testPayuniConnection(cfg: {
  merId: string;
  hashKey: string;
  hashIv: string;
  sandbox: boolean;
}): Promise<"ok" | "fail"> {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    // Use a dummy MerTradeNo that is very unlikely to exist in any real account.
    const testTradeNo = "SPTESTCONN00001";

    // Build a signed query payload (same pattern as buildUppRequest)
    const enc = await encryptInfo(
      { MerID: cfg.merId, MerTradeNo: testTradeNo, Timestamp: timestamp },
      cfg.hashKey,
      cfg.hashIv
    );
    const hash = await hashInfo(enc, cfg.hashKey, cfg.hashIv);

    const body = new URLSearchParams({
      MerID: cfg.merId,
      Version: "1.0",
      EncryptInfo: enc,
      HashInfo: hash,
    });

    const res = await fetch(`${apiBase(cfg.sandbox)}trade/query`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    // HTTP-level auth rejection
    if (res.status === 401 || res.status === 403) return "fail";
    // Network / server error
    if (!res.ok) return "fail";

    // Inspect the response body for credential-specific error messages.
    // PAYUNi typically returns JSON with Status and Message fields.
    const text = await res.text();
    let parsed: Record<string, string> | null = null;
    try {
      parsed = JSON.parse(text) as Record<string, string>;
    } catch {
      // Non-JSON 200 response — credential probably ok (unexpected format)
      return "ok";
    }

    const msg = String(parsed?.Message || parsed?.message || "").toLowerCase();

    // Known credential / signature error patterns.
    // If PAYUNi returns one of these, the credentials are wrong.
    // NOTE: These string patterns may need expansion based on actual PAYUNi responses.
    const credentialErrors = [
      "merchantid",
      "merchant id",
      "mer_id",
      "merid",
      "hashinfo",
      "hash info",
      "hash ",
      "簽章",
      "驗章",
      "商店不存在",
      "invalid merchant",
      "merchant not found",
    ];
    for (const keyword of credentialErrors) {
      if (msg.includes(keyword)) return "fail";
    }

    // "Order not found" / "no data" / other application-level codes mean
    // the credentials were accepted (the trade just doesn't exist, which is expected).
    return "ok";
  } catch {
    // Network error, fetch threw
    return "fail";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OWNER-GATED HANDLERS  (require session cookie + pro/proplus plan)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/store-pay/config
export async function handleGetStorePayConfig(
  request: Request,
  env: StorePayEnv
): Promise<Response> {
  if (request.method !== "GET") return json({ ok: false, error: "Method Not Allowed" }, 405);

  const store = await getSessionStore(request, env.DB);
  if (!store) return json({ ok: false, error: "Unauthorized" }, 401);

  const plan = effectivePlan(store.plan, store.plan_expires_at);
  if (!canUseStoreCollection(plan)) return json({ ok: false, error: "Forbidden: pro/proplus plan required" }, 403);

  // Store-scoped callback URLs the merchant may need to register/whitelist in
  // their PAYUNi backend (also sent automatically per transaction at checkout).
  // Not secret — notify security is the per-store HashInfo signature check.
  const appUrl = typeof env.APP_URL === "string" ? env.APP_URL : "";
  const notifyUrl = `${appUrl}/api/store-pay/notify?s=${store.id}`;
  const returnUrl = `${appUrl}/api/store-pay/return?s=${store.id}`;

  const cfg = await env.DB
    .prepare("SELECT * FROM store_payment_configs WHERE store_id = ?")
    .bind(store.id)
    .first<StorePayConfigRow>();

  if (!cfg) {
    // No config row yet — return empty defaults
    return json({
      ok: true,
      config: {
        provider: "payuni",
        merIdLast4: null,
        isSandbox: false,
        isEnabled: false,
        effectiveEnabled: false,
        hashKeySet: false,
        hashIvSet: false,
        lastTestedAt: null,
        lastTestStatus: null,
        notifyUrl,
        returnUrl,
      },
    });
  }

  const planOk = canUseStoreCollection(plan);
  const isValid = configIsValid(cfg);
  const effEnabled = computeEffectiveEnabled({
    isEnabled: cfg.is_enabled === 1,
    planOk,
    configValid: isValid,
  });

  return json({
    ok: true,
    config: {
      provider: cfg.provider,
      merIdLast4: cfg.mer_id_last4,
      isSandbox: cfg.is_sandbox === 1,
      isEnabled: cfg.is_enabled === 1,
      effectiveEnabled: effEnabled,
      // Presence indicators only — never return the ciphertext blobs
      hashKeySet: Boolean(cfg.hash_key_enc),
      hashIvSet: Boolean(cfg.hash_iv_enc),
      lastTestedAt: cfg.last_tested_at,
      lastTestStatus: cfg.last_test_status,
      notifyUrl,
      returnUrl,
    },
  });
}

// PUT /api/store-pay/config
// Body: { merId?, hashKey?, hashIv?, isSandbox? }
// Blank / absent fields → unchanged.
// ANY credential change → auto-disable + clear last_test_status (must retest).
export async function handlePutStorePayConfig(
  request: Request,
  env: StorePayEnv
): Promise<Response> {
  if (request.method !== "PUT") return json({ ok: false, error: "Method Not Allowed" }, 405);

  const store = await getSessionStore(request, env.DB);
  if (!store) return json({ ok: false, error: "Unauthorized" }, 401);

  const plan = effectivePlan(store.plan, store.plan_expires_at);
  if (!canUseStoreCollection(plan)) return json({ ok: false, error: "Forbidden: pro/proplus plan required" }, 403);

  let body: { merId?: string; hashKey?: string; hashIv?: string; isSandbox?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const existing = await env.DB
    .prepare("SELECT * FROM store_payment_configs WHERE store_id = ?")
    .bind(store.id)
    .first<StorePayConfigRow>();

  const storeId = store.id;
  const provider = "payuni";
  const now = new Date().toISOString();

  // Determine whether any credential field is being updated
  const merId = body.merId && body.merId.trim() ? body.merId.trim() : null;
  const hashKey = body.hashKey && body.hashKey.trim() ? body.hashKey.trim() : null;
  const hashIv = body.hashIv && body.hashIv.trim() ? body.hashIv.trim() : null;
  const isSandbox = body.isSandbox !== undefined ? (body.isSandbox ? 1 : 0) : null;

  const anyCredChange = merId !== null || hashKey !== null || hashIv !== null;

  // Encrypt any provided credential fields
  let merIdEnc: string | null = existing?.mer_id_enc ?? null;
  let hashKeyEnc: string | null = existing?.hash_key_enc ?? null;
  let hashIvEnc: string | null = existing?.hash_iv_enc ?? null;
  let merIdLast4: string | null = existing?.mer_id_last4 ?? null;
  let encVersion = existing?.enc_version ?? 1;

  try {
    if (merId !== null) {
      merIdEnc = await seal(merId, { storeId, provider, field: "mer_id" }, env);
      merIdLast4 = merId.length >= 4 ? merId.slice(-4) : merId;
    }
    if (hashKey !== null) {
      hashKeyEnc = await seal(hashKey, { storeId, provider, field: "hash_key" }, env);
    }
    if (hashIv !== null) {
      hashIvEnc = await seal(hashIv, { storeId, provider, field: "hash_iv" }, env);
    }
    // enc_version records the keyring version used; seal() always uses latest.
    // The version is also embedded in each blob but storing it here allows rotation queries.
    if (anyCredChange) {
      encVersion = getLatestVersion(env as Record<string, string>);
    }
  } catch (err) {
    // seal() throws a plain Error when no key is configured
    return json({ ok: false, error: "Encryption key not configured on server" }, 503);
  }

  // Auto-disable + reset test status on any credential change (§15.6)
  const isEnabled = anyCredChange ? 0 : (existing?.is_enabled ?? 0);
  const lastTestStatus = anyCredChange ? null : (existing?.last_test_status ?? null);
  const lastTestedAt = anyCredChange ? null : (existing?.last_tested_at ?? null);
  const newSandbox = isSandbox !== null ? isSandbox : (existing?.is_sandbox ?? 0);

  if (!existing) {
    await env.DB
      .prepare(
        `INSERT INTO store_payment_configs
           (store_id, provider, mer_id_enc, hash_key_enc, hash_iv_enc, enc_version,
            mer_id_last4, is_sandbox, is_enabled, last_tested_at, last_test_status,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        storeId, provider, merIdEnc, hashKeyEnc, hashIvEnc, encVersion,
        merIdLast4, newSandbox, isEnabled, lastTestedAt, lastTestStatus, now, now
      )
      .run();
  } else {
    await env.DB
      .prepare(
        `UPDATE store_payment_configs SET
           mer_id_enc = ?, hash_key_enc = ?, hash_iv_enc = ?, enc_version = ?,
           mer_id_last4 = ?, is_sandbox = ?, is_enabled = ?,
           last_tested_at = ?, last_test_status = ?, updated_at = ?
         WHERE store_id = ?`
      )
      .bind(
        merIdEnc, hashKeyEnc, hashIvEnc, encVersion,
        merIdLast4, newSandbox, isEnabled,
        lastTestedAt, lastTestStatus, now,
        storeId
      )
      .run();
  }

  // Audit log (redacted — no secrets, no ciphertext)
  if (anyCredChange || isSandbox !== null) {
    await writeAuditLog(env.DB, {
      storeId,
      action: "config_update",
      isSandbox: newSandbox,
      merIdLast4,
    }).catch(() => {/* non-fatal: audit logging must not break the response */});
  }

  return json({ ok: true });
}

// POST /api/store-pay/config/test
// Decrypts creds, does a PAYUNi connectivity check, writes last_tested_at + last_test_status.
export async function handleTestStorePayConfig(
  request: Request,
  env: StorePayEnv
): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

  const store = await getSessionStore(request, env.DB);
  if (!store) return json({ ok: false, error: "Unauthorized" }, 401);

  const plan = effectivePlan(store.plan, store.plan_expires_at);
  if (!canUseStoreCollection(plan)) return json({ ok: false, error: "Forbidden" }, 403);

  const cfg = await env.DB
    .prepare("SELECT * FROM store_payment_configs WHERE store_id = ?")
    .bind(store.id)
    .first<StorePayConfigRow>();

  if (!cfg || !cfg.mer_id_enc || !cfg.hash_key_enc || !cfg.hash_iv_enc) {
    return json({ ok: false, error: "Credentials not configured; save credentials first" }, 400);
  }

  // Decrypt — handle DecryptError gracefully (guide store owner to re-enter creds)
  let merId: string, hashKey: string, hashIv: string;
  try {
    const ctx = (field: string) => ({ storeId: store.id, provider: "payuni", field });
    [merId, hashKey, hashIv] = await Promise.all([
      open(cfg.mer_id_enc, ctx("mer_id"), env),
      open(cfg.hash_key_enc, ctx("hash_key"), env),
      open(cfg.hash_iv_enc, ctx("hash_iv"), env),
    ]);
  } catch (err) {
    if (err instanceof DecryptError) {
      // Record fail so the UI can tell the store owner to re-enter credentials
      await env.DB
        .prepare(
          "UPDATE store_payment_configs SET last_test_status = 'fail', last_tested_at = datetime('now'), updated_at = datetime('now') WHERE store_id = ?"
        )
        .bind(store.id)
        .run();
      return json({ ok: true, testStatus: "fail", reason: "credential_decrypt_error" });
    }
    return json({ ok: false, error: "Server error during credential decryption" }, 500);
  }

  const testStatus = await testPayuniConnection({
    merId,
    hashKey,
    hashIv,
    sandbox: cfg.is_sandbox === 1,
  });

  await env.DB
    .prepare(
      "UPDATE store_payment_configs SET last_test_status = ?, last_tested_at = datetime('now'), updated_at = datetime('now') WHERE store_id = ?"
    )
    .bind(testStatus, store.id)
    .run();

  return json({ ok: true, testStatus });
}

// POST /api/store-pay/config/enable
// Sets is_enabled=1 ONLY if last_test_status='ok'.
export async function handleEnableStorePayConfig(
  request: Request,
  env: StorePayEnv
): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

  const store = await getSessionStore(request, env.DB);
  if (!store) return json({ ok: false, error: "Unauthorized" }, 401);

  const plan = effectivePlan(store.plan, store.plan_expires_at);
  if (!canUseStoreCollection(plan)) return json({ ok: false, error: "Forbidden" }, 403);

  const cfg = await env.DB
    .prepare("SELECT last_test_status FROM store_payment_configs WHERE store_id = ?")
    .bind(store.id)
    .first<{ last_test_status: string | null }>();

  if (!cfg) return json({ ok: false, error: "No config found; save and test credentials first" }, 400);
  if (cfg.last_test_status !== "ok") {
    return json({ ok: false, error: "Cannot enable: run a successful test connection first" }, 400);
  }

  await env.DB
    .prepare(
      "UPDATE store_payment_configs SET is_enabled = 1, updated_at = datetime('now') WHERE store_id = ?"
    )
    .bind(store.id)
    .run();

  return json({ ok: true });
}

// POST /api/store-pay/orders
// Body: { title, amount, expiresInHours?, requirementFormId? }
export async function handleCreateStorePayOrder(
  request: Request,
  env: StorePayEnv
): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

  const store = await getSessionStore(request, env.DB);
  if (!store) return json({ ok: false, error: "Unauthorized" }, 401);

  const plan = effectivePlan(store.plan, store.plan_expires_at);
  if (!canUseStoreCollection(plan)) return json({ ok: false, error: "Forbidden: pro/proplus plan required" }, 403);

  // Config must exist AND be enabled (store owner's intent)
  const cfg = await env.DB
    .prepare("SELECT * FROM store_payment_configs WHERE store_id = ?")
    .bind(store.id)
    .first<StorePayConfigRow>();

  // Full effective_enabled gate (§15.6): is_enabled AND plan_ok AND config_valid.
  // Blocks creation when the config row exists+enabled but credentials are missing,
  // or when the plan no longer qualifies.
  const effEnabledCreate = computeEffectiveEnabled({
    isEnabled: cfg?.is_enabled === 1,
    planOk: canUseStoreCollection(plan),
    configValid: configIsValid(cfg),
  });
  if (!effEnabledCreate) {
    return json(
      { ok: false, error: "Payment collection is not enabled; configure and enable it first" },
      409
    );
  }

  let body: { title?: string; amount?: unknown; expiresInHours?: unknown; requirementFormId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const title = String(body.title || "").trim();
  if (!title) return json({ ok: false, error: "title is required" }, 400);

  const amount = parseCanonicalAmount(body.amount);
  if (amount === null) {
    return json({ ok: false, error: "amount must be a positive integer between 1 and 9999999 (TWD)" }, 400);
  }

  // Validate requirementFormId belongs to THIS store (FK only checks existence,
  // not tenancy — without this a store could attach to another store's form).
  let requirementFormId: number | null = null;
  if (body.requirementFormId != null) {
    const rfId = Number(body.requirementFormId);
    if (!Number.isInteger(rfId) || rfId <= 0) {
      return json({ ok: false, error: "invalid requirementFormId" }, 400);
    }
    const rf = await env.DB
      .prepare("SELECT id FROM requirement_forms WHERE id = ? AND store_id = ?")
      .bind(rfId, store.id)
      .first<{ id: number }>();
    if (!rf) return json({ ok: false, error: "requirementFormId not found" }, 404);
    requirementFormId = rfId;
  }

  const publicToken = genPublicToken();
  const merTradeNo = genMerTradeNo();
  const expiresAt = computeExpiresAt(body.expiresInHours as number | undefined);

  const now = new Date().toISOString();

  await env.DB
    .prepare(
      `INSERT INTO store_payment_orders
         (store_id, public_token, mer_trade_no, title, amount, currency,
          status, is_sandbox, requirement_form_id, expires_at,
          created_under_plan, plan_valid_until_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'TWD', 'pending', ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      store.id,
      publicToken,
      merTradeNo,
      title,
      amount,
      cfg.is_sandbox,
      requirementFormId,
      expiresAt,
      plan,
      store.plan_expires_at,
      now,
      now
    )
    .run();

  const appUrl = typeof env.APP_URL === "string" ? env.APP_URL : "";
  return json({
    ok: true,
    publicToken,
    payUrl: `${appUrl}/pay?o=${encodeURIComponent(publicToken)}`,
  });
}

// GET /api/store-pay/orders
// Returns this store's orders (masked), most recent first, max 50.
export async function handleListStorePayOrders(
  request: Request,
  env: StorePayEnv
): Promise<Response> {
  if (request.method !== "GET") return json({ ok: false, error: "Method Not Allowed" }, 405);

  const store = await getSessionStore(request, env.DB);
  if (!store) return json({ ok: false, error: "Unauthorized" }, 401);

  const plan = effectivePlan(store.plan, store.plan_expires_at);
  if (!canUseStoreCollection(plan)) return json({ ok: false, error: "Forbidden" }, 403);

  const rows = await env.DB
    .prepare(
      `SELECT public_token, title, amount, currency, status, is_sandbox,
              expires_at, created_under_plan, pay_type, paid_at, created_at,
              atm_bank_code, atm_account, atm_expire_at
       FROM store_payment_orders
       WHERE store_id = ?
       ORDER BY id DESC LIMIT 50`
    )
    .bind(store.id)
    .all<Record<string, unknown>>();

  return json({ ok: true, orders: rows?.results ?? [] });
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC HANDLERS  (no auth; minimal data; consistent errors to prevent enumeration)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/store-pay/public/order?o=<publicToken>
export async function handlePublicGetOrder(
  request: Request,
  env: StorePayEnv
): Promise<Response> {
  if (request.method !== "GET") return json({ ok: false, error: "Method Not Allowed" }, 405);

  const o = new URL(request.url).searchParams.get("o") || "";
  if (!o) return publicNotFound();

  const order = await env.DB
    .prepare(
      `SELECT o.title, o.amount, o.currency, o.status, o.expires_at, s.name AS store_name
       FROM store_payment_orders o
       JOIN stores s ON s.id = o.store_id
       WHERE o.public_token = ? AND s.is_active = 1`
    )
    .bind(o)
    .first<{
      title: string;
      amount: number;
      currency: string;
      status: string;
      expires_at: string;
      store_name: string;
    }>();

  // Consistent minimal error for not-found / cancelled / expired (§15.3): do not
  // reveal that a token maps to a dead order. Only live pending/paid/failed orders
  // expose their details (the buyer legitimately needs those).
  if (!order) return publicNotFound();
  if (order.status === "cancelled") return publicNotFound();
  if (order.status === "pending" && new Date(order.expires_at) < new Date()) return publicNotFound();

  return json({
    ok: true,
    title: order.title,
    amount: order.amount,
    currency: order.currency,
    status: order.status,
    storeName: order.store_name,
    expired: false,
  });
}

// POST /api/store-pay/public/checkout
// Body: { o: "<publicToken>" }
export async function handlePublicCheckout(
  request: Request,
  env: StorePayEnv
): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

  let body: { o?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const publicToken = String(body.o || "").trim();
  if (!publicToken) return json({ ok: false, error: "order token required" }, 400);

  // Load order with store info in one query
  const row = await env.DB
    .prepare(
      `SELECT o.id, o.store_id, o.mer_trade_no, o.title, o.amount, o.status,
              o.is_sandbox, o.buyer_email, o.expires_at, o.checkout_started_at,
              o.payuni_trade_no,
              s.plan, s.plan_expires_at, s.slug, s.subdomain
       FROM store_payment_orders o
       JOIN stores s ON s.id = o.store_id
       WHERE o.public_token = ? AND s.is_active = 1`
    )
    .bind(publicToken)
    .first<{
      id: number;
      store_id: number;
      mer_trade_no: string;
      title: string;
      amount: number;
      status: string;
      is_sandbox: number;
      buyer_email: string | null;
      expires_at: string;
      checkout_started_at: string | null;
      payuni_trade_no: string | null;
      plan: string;
      plan_expires_at: string | null;
      slug: string;
      subdomain: string | null;
    }>();

  if (!row) return json({ ok: false, error: "Order not found or unavailable" }, 404);

  // Fast-reject checks (§15.3: fast-reject before PAYUNi build)
  if (row.status !== "pending") {
    return json({ ok: false, error: "Order is no longer available for payment" }, 409);
  }
  if (new Date(row.expires_at) < new Date()) {
    return json({ ok: false, error: "Order has expired" }, 409);
  }

  // Check effectiveEnabled for this store (§9.1: must block even before expires_at)
  const plan = effectivePlan(row.plan, row.plan_expires_at);
  const planOk = canUseStoreCollection(plan);

  const cfg = await env.DB
    .prepare("SELECT * FROM store_payment_configs WHERE store_id = ?")
    .bind(row.store_id)
    .first<StorePayConfigRow>();

  const cfgValid = configIsValid(cfg);
  const effEnabled = computeEffectiveEnabled({
    isEnabled: cfg?.is_enabled === 1,
    planOk,
    configValid: cfgValid,
  });

  if (!effEnabled) {
    return json({ ok: false, error: "Store payment collection is currently unavailable" }, 409);
  }

  // Decrypt credentials
  let merId: string, hashKey: string, hashIv: string;
  try {
    const ctx = (field: string) => ({ storeId: row.store_id, provider: "payuni", field });
    [merId, hashKey, hashIv] = await Promise.all([
      open(cfg!.mer_id_enc!, ctx("mer_id"), env),
      open(cfg!.hash_key_enc!, ctx("hash_key"), env),
      open(cfg!.hash_iv_enc!, ctx("hash_iv"), env),
    ]);
  } catch {
    // DecryptError or missing config — do not reveal details
    return json({ ok: false, error: "Store payment configuration error" }, 503);
  }

  // Set checkout_started_at idempotently (once set, we allow PAYUNi notify even if plan expires)
  if (!row.checkout_started_at) {
    await env.DB
      .prepare(
        "UPDATE store_payment_orders SET checkout_started_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
      )
      .bind(row.id)
      .run();
  }

  const storeId = row.store_id;
  const appUrl = typeof env.APP_URL === "string" ? env.APP_URL : "";
  const cfgSandbox = cfg!.is_sandbox === 1;

  // Build PAYUNi UPP request.
  // tradeAmt is ALWAYS taken from DB — client-supplied amount is completely ignored (§15.4).
  const upp = await buildUppRequest(
    { merId, hashKey, hashIv, sandbox: cfgSandbox },
    {
      merTradeNo: row.mer_trade_no,
      tradeAmt: row.amount,
      timestamp: Math.floor(Date.now() / 1000),
      prodDesc: row.title,
      usrMail: row.buyer_email || "",
      notifyUrl: `${appUrl}/api/store-pay/notify?s=${storeId}`,
      returnUrl: `${appUrl}/api/store-pay/return?s=${storeId}`,
    }
  );

  return json({ ok: true, action: upp.action, fields: upp.fields });
}

// GET /api/store-pay/public/order-status?o=<publicToken>
// Minimal status for the result page to poll.
export async function handlePublicOrderStatus(
  request: Request,
  env: StorePayEnv
): Promise<Response> {
  if (request.method !== "GET") return json({ ok: false, error: "Method Not Allowed" }, 405);

  const o = new URL(request.url).searchParams.get("o") || "";
  if (!o) return publicNotFound();

  const order = await env.DB
    .prepare(
      `SELECT status, paid_at, pay_type,
              atm_bank_code, atm_account, atm_expire_at
       FROM store_payment_orders
       WHERE public_token = ?`
    )
    .bind(o)
    .first<{
      status: string;
      paid_at: string | null;
      pay_type: string | null;
      atm_bank_code: string | null;
      atm_account: string | null;
      atm_expire_at: string | null;
    }>();

  if (!order) return publicNotFound();

  const atm =
    order.pay_type === "ATM" && order.atm_account
      ? {
          bankCode: order.atm_bank_code,
          account: order.atm_account,
          expireAt: order.atm_expire_at,
        }
      : null;

  return json({
    ok: true,
    status: order.status,
    paidAt: order.paid_at,
    atm,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYUNI WEBHOOK HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/store-pay/notify?s=<storeId>
// Server-to-server PAYUNi callback.  MUST verify signature BEFORE trusting payload.
export async function handleStorePayNotify(
  request: Request,
  env: StorePayEnv,
  url: URL
): Promise<Response> {
  // Always return a 200 to PAYUNi (so it stops retrying) unless we detect a
  // genuine bad request (e.g. missing form data, signature failure).
  const okStop = () => new Response("OK", { status: 200 });

  const storeIdStr = url.searchParams.get("s");
  const storeId = parseInt(storeIdStr || "", 10);
  // If ?s= is missing/invalid, return 200 (nothing to do, but don't expose details)
  if (!storeIdStr || isNaN(storeId) || storeId <= 0) return okStop();

  // Load config using storeId as key-lookup HINT only (§15.3).
  // Security is provided by per-store signature verification below, not by storeId alone.
  const cfg = await env.DB
    .prepare("SELECT * FROM store_payment_configs WHERE store_id = ?")
    .bind(storeId)
    .first<StorePayConfigRow>();

  if (!cfg || !cfg.mer_id_enc || !cfg.hash_key_enc || !cfg.hash_iv_enc) return okStop();

  // Decrypt credentials (DecryptError = can't verify; return 400 generic)
  let hashKey: string, hashIv: string;
  try {
    const ctx = (field: string) => ({ storeId, provider: "payuni", field });
    [hashKey, hashIv] = await Promise.all([
      open(cfg.hash_key_enc, ctx("hash_key"), env),
      open(cfg.hash_iv_enc, ctx("hash_iv"), env),
    ]);
  } catch {
    return new Response("", { status: 400 });
  }

  // VERIFY SIGNATURE FIRST — do not trust any payload field before this passes
  let form: Record<string, string>;
  let data: Record<string, string>;
  try {
    form = await parseNotifyForm(request);
    data = await verifyAndDecrypt(form, hashKey, hashIv);
  } catch {
    return new Response("", { status: 400 });
  }

  // Look up order by DECRYPTED MerTradeNo AND verify store ownership (§15.3 MUST)
  const merTradeNo = String(data.MerTradeNo || "");
  if (!merTradeNo) return okStop();

  const order = await env.DB
    .prepare(
      "SELECT * FROM store_payment_orders WHERE mer_trade_no = ? AND store_id = ?"
    )
    .bind(merTradeNo, storeId)
    .first<StorePayOrderRow>();

  if (!order) return okStop();

  // Redacted allowlist for raw_notify — NOT EncryptInfo, NOT full payload (§15.7)
  const redacted = JSON.stringify({
    MerTradeNo: data.MerTradeNo,
    TradeAmt: data.TradeAmt,
    TradeStatus: data.TradeStatus ?? data.Status,
    PayType: data.PayType ?? data.PaymentType,
    TradeNo: data.TradeNo,
    AuthCode: data.AuthCode,
    PayTime: data.PayTime,
    ResCode: data.ResCode,
  });

  const action = decideStoreNotifyAction({
    orderStatus: order.status,
    orderAmount: order.amount,
    orderIsSandbox: order.is_sandbox === 1,
    orderTradeNo: order.payuni_trade_no,
    tradeStatus: data.TradeStatus ?? data.Status,
    tradeAmt: data.TradeAmt,
    notifyIsSandbox: cfg.is_sandbox === 1,
    notifyTradeNo: data.TradeNo,
  });

  if (action === "activate") {
    // Idempotent claim: only the first notify that flips status → paid wins (§15.1)
    const claim = await env.DB
      .prepare(
        `UPDATE store_payment_orders
         SET status = 'paid', paid_at = datetime('now'),
             payuni_trade_no = ?, payuni_auth_no = ?, payuni_pay_time = ?,
             pay_type = ?, raw_notify = ?, updated_at = datetime('now')
         WHERE id = ? AND status = 'pending'`
      )
      .bind(
        data.TradeNo ?? null,
        data.AuthCode ?? null,
        data.PayTime ?? null,
        data.PayType ?? data.PaymentType ?? null,
        redacted,
        order.id
      )
      .run();

    // changes !== 1 means another concurrent notify already claimed it — that's fine
    return okStop();
  }

  if (action === "pending") {
    // ATM take-number: store bank details, keep status=pending
    // Guard against a read→write race: only mutate while still pending, and never
    // overwrite a different transaction's TradeNo already recorded (anti-replay in SQL).
    await env.DB
      .prepare(
        `UPDATE store_payment_orders
         SET pay_type = ?, payuni_trade_no = ?,
             atm_bank_code = ?, atm_account = ?, atm_expire_at = ?,
             raw_notify = ?, updated_at = datetime('now')
         WHERE id = ? AND status = 'pending'
           AND (payuni_trade_no IS NULL OR payuni_trade_no = ?)`
      )
      .bind(
        data.PayType ?? data.PaymentType ?? null,
        data.TradeNo ?? null,
        data.BankType ?? data.Bank ?? null,
        data.PayNo ?? data.Account ?? null,
        data.ExpireDate ?? null,
        redacted,
        order.id,
        data.TradeNo ?? null
      )
      .run();
    return okStop();
  }

  if (action === "amount-mismatch") {
    // Only transition pending → failed (not any terminal state)
    await env.DB
      .prepare(
        `UPDATE store_payment_orders
         SET status = 'failed', raw_notify = ?, updated_at = datetime('now')
         WHERE id = ? AND status = 'pending'`
      )
      .bind(redacted, order.id)
      .run();
    return okStop();
  }

  // ignore | replay | sandbox-mismatch: no state change; return 200 so PAYUNi stops retrying
  return okStop();
}

// GET (or POST) /api/store-pay/return?s=<storeId>
// Browser redirect from PAYUNi.  Verify signature, look up order, 302 only (§15.5).
// NEVER sets paid status here — that is handled exclusively by the notify handler.
export async function handleStorePayReturn(
  request: Request,
  env: StorePayEnv,
  url: URL
): Promise<Response> {
  const domain = mainDomain(env);

  const errorRedirect = () =>
    new Response(null, {
      status: 302,
      headers: { location: `https://${domain}/pay-result?status=error` },
    });

  const storeIdStr = url.searchParams.get("s");
  const storeId = parseInt(storeIdStr || "", 10);
  if (!storeIdStr || isNaN(storeId) || storeId <= 0) return errorRedirect();

  const cfg = await env.DB
    .prepare("SELECT * FROM store_payment_configs WHERE store_id = ?")
    .bind(storeId)
    .first<StorePayConfigRow>();

  if (!cfg || !cfg.hash_key_enc || !cfg.hash_iv_enc) return errorRedirect();

  let hashKey: string, hashIv: string;
  try {
    const ctx = (field: string) => ({ storeId, provider: "payuni", field });
    [hashKey, hashIv] = await Promise.all([
      open(cfg.hash_key_enc, ctx("hash_key"), env),
      open(cfg.hash_iv_enc, ctx("hash_iv"), env),
    ]);
  } catch {
    return errorRedirect();
  }

  // Verify signature BEFORE reading the order. PAYUNi may redirect the browser
  // via GET (params in query string) or POST (form body) — read accordingly.
  let data: Record<string, string>;
  try {
    const form =
      request.method === "GET"
        ? (Object.fromEntries(url.searchParams.entries()) as Record<string, string>)
        : await parseNotifyForm(request);
    data = await verifyAndDecrypt(form, hashKey, hashIv);
  } catch {
    return errorRedirect();
  }

  // Look up order: MerTradeNo from decrypted payload + re-verify store_id (§15.3)
  const merTradeNo = String(data.MerTradeNo || "");
  const order = await env.DB
    .prepare(
      "SELECT public_token, store_id FROM store_payment_orders WHERE mer_trade_no = ? AND store_id = ?"
    )
    .bind(merTradeNo, storeId)
    .first<{ public_token: string; store_id: number }>();

  if (!order) return errorRedirect();

  // Determine the correct result-page URL based on the store's current plan (§6.4)
  const store = await env.DB
    .prepare("SELECT plan, plan_expires_at, slug, subdomain FROM stores WHERE id = ? AND is_active = 1")
    .bind(storeId)
    .first<{ plan: string; plan_expires_at: string | null; slug: string; subdomain: string | null }>();

  if (!store) return errorRedirect();

  const plan = effectivePlan(store.plan, store.plan_expires_at);
  const token = encodeURIComponent(order.public_token);

  let resultUrl: string;
  if (plan === "proplus") {
    // Proplus: subdomain-based storefront
    const sub = store.subdomain || store.slug;
    resultUrl = `https://${sub}.${domain}/pay-result?o=${token}`;
  } else {
    // Pro: path-based storefront
    resultUrl = `https://${domain}/s/${store.slug}/pay-result?o=${token}`;
  }

  // 302 ONLY — do NOT set paid status here (§15.5)
  return new Response(null, { status: 302, headers: { location: resultUrl } });
}
