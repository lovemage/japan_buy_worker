import type { D1DatabaseLike } from "../types/d1";
import { DEFAULT_PLAN_OFFERS, getPlanOfferByMonths } from "../shared/plan-offers.js";
import { getEffectivePlan } from "../context";
import { parseDisplaySettings, sanitizeDisplaySettingsPatch, canManageStoreLogo } from "../shared/display-settings.js";

function json(payload: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

// Platform admin uses a simple signed token (HMAC) instead of DB sessions
// to avoid FK constraint issues (no store_id=0 in stores table)

async function signToken(password: string, expiresAt: number): Promise<string> {
  const payload = `platform-admin:${expiresAt}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const sigHex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
  return `${expiresAt}.${sigHex}`;
}

async function verifyToken(token: string, password: string): Promise<boolean> {
  if (!token || !password) return false;
  const dotIdx = token.indexOf(".");
  if (dotIdx < 0) return false;

  const expiresAt = parseInt(token.slice(0, dotIdx), 10);
  if (isNaN(expiresAt) || expiresAt < Date.now()) return false;

  const expected = await signToken(password, expiresAt);
  return token === expected;
}

// Allowed platform admin emails
const PLATFORM_ADMIN_EMAILS = [
  "lovemage@gmail.com",
  "aistorm0910@gmail.com",
];

async function ensureLogTable(db: D1DatabaseLike): Promise<void> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS plan_change_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      store_name TEXT NOT NULL DEFAULT '',
      store_email TEXT NOT NULL DEFAULT '',
      plan TEXT NOT NULL,
      days INTEGER NOT NULL,
      amount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'normal',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();
}

async function getTestStoreIds(db: D1DatabaseLike): Promise<number[]> {
  const row = await db
    .prepare("SELECT value FROM app_settings WHERE store_id = 0 AND key = 'test_store_ids'")
    .first<{ value: string }>();
  if (!row?.value) return [];
  try { return JSON.parse(row.value); } catch { return []; }
}

async function setTestStoreIds(db: D1DatabaseLike, ids: number[]): Promise<void> {
  await db
    .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (0, 'test_store_ids', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
    .bind(JSON.stringify(ids))
    .run();
}

export async function handlePlatformAdmin(
  request: Request,
  db: D1DatabaseLike,
  platformPassword: string,
  assets?: { fetch: (request: Request) => Promise<Response> },
  r2?: {
    put: (key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }) => Promise<void>;
  }
): Promise<Response> {
  const url = new URL(request.url);

  // Serve the admin page
  if (url.pathname === "/platform-admin" || url.pathname === "/platform-admin.html") {
    if (assets) {
      const assetUrl = new URL("/platform-admin.html", request.url).toString();
      return assets.fetch(new Request(assetUrl, { method: "GET", headers: request.headers }));
    }
    return json({ ok: false, error: "Assets not configured" }, 500);
  }

  // Login (requires email + password, email must be in whitelist)
  if (url.pathname === "/api/platform-admin/login" && request.method === "POST") {
    let body: { email?: string; password?: string };
    try {
      body = (await request.json()) as { email?: string; password?: string };
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }

    const email = (body.email || "").trim().toLowerCase();
    if (!PLATFORM_ADMIN_EMAILS.includes(email)) {
      return json({ ok: false, error: "此 Email 無管理員權限" }, 403);
    }

    if (!platformPassword || body.password !== platformPassword) {
      return json({ ok: false, error: "密碼錯誤" }, 401);
    }

    const expiresAt = Date.now() + 86400_000; // 24 hours
    const token = await signToken(platformPassword, expiresAt);
    return json({ ok: true, token, email, role: email === "lovemage@gmail.com" ? "super-admin" : "admin" });
  }

  // All other endpoints require auth
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  const authorized = await verifyToken(token, platformPassword);
  if (!authorized) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  // List all stores with stats
  if (url.pathname === "/api/platform-admin/stores" && request.method === "GET") {
    const stores = await db
      .prepare(`
        SELECT
          s.id, s.slug, s.name, s.owner_email, s.plan, s.plan_expires_at,
          s.is_active, s.onboarding_step, s.email_verified, s.phone_verified,
          s.phone_number, s.google_id, s.line_login_id, s.line_id, s.template,
          s.created_at, s.updated_at,
          (SELECT COUNT(1) FROM products p WHERE p.store_id = s.id) as product_count,
          (SELECT COUNT(1) FROM requirement_forms rf WHERE rf.store_id = s.id) as order_count
        FROM stores s
        ORDER BY s.created_at DESC
      `)
      .all();

    return json({ ok: true, stores: stores.results });
  }

  // API usage logs for all stores (or a specific store)
  if (url.pathname === "/api/platform-admin/api-usage" && request.method === "GET") {
    const storeId = url.searchParams.get("store_id");
    const month = url.searchParams.get("month"); // optional: YYYY_MM
    let sql = `SELECT store_id, api_type, month_key, call_count, last_called_at FROM api_usage_logs`;
    const conditions: string[] = [];
    const binds: (string | number)[] = [];
    if (storeId) {
      conditions.push("store_id = ?");
      binds.push(parseInt(storeId, 10));
    }
    if (month) {
      conditions.push("month_key = ?");
      binds.push(month);
    }
    if (conditions.length > 0) sql += " WHERE " + conditions.join(" AND ");
    sql += " ORDER BY store_id, month_key DESC, api_type";
    const rows = await db.prepare(sql).bind(...binds).all();
    return json({ ok: true, usage: rows.results });
  }

  // Toggle test member
  const testMatch = url.pathname.match(/^\/api\/platform-admin\/stores\/(\d+)\/test$/);
  if (testMatch && request.method === "POST") {
    const storeId = parseInt(testMatch[1], 10);
    const ids = await getTestStoreIds(db);
    const idx = ids.indexOf(storeId);
    if (idx >= 0) {
      // Remove from test — revert to free plan
      ids.splice(idx, 1);
      await db
        .prepare("UPDATE stores SET plan = 'free', plan_expires_at = NULL, updated_at = datetime('now') WHERE id = ?")
        .bind(storeId)
        .run();
    } else {
      // Add to test — parse days from body (default 7, max 30)
      let days = 7;
      try {
        const body = (await request.json()) as { days?: number };
        if (body.days && body.days >= 1 && body.days <= 30) days = body.days;
      } catch {}
      const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
      ids.push(storeId);
      await db
        .prepare("UPDATE stores SET plan = 'proplus', plan_expires_at = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(expiresAt, storeId)
        .run();
    }
    await setTestStoreIds(db, ids);
    return json({ ok: true, isTest: idx < 0 });
  }

  // Calculate upgrade proration for a store
  const upgradeCalcMatch = url.pathname.match(/^\/api\/platform-admin\/stores\/(\d+)\/upgrade-calc$/);
  if (upgradeCalcMatch && request.method === "POST") {
    const storeId = parseInt(upgradeCalcMatch[1], 10);
    let body: { newPlan: string; newMonths: number };
    try {
      body = (await request.json()) as { newPlan: string; newMonths: number };
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }

    const store = await db
      .prepare("SELECT plan, plan_expires_at, plan_paid_amount, plan_started_at FROM stores WHERE id = ?")
      .bind(storeId)
      .first<{ plan: string; plan_expires_at: string | null; plan_paid_amount: number | null; plan_started_at: string | null }>();
    if (!store) return json({ ok: false, error: "Store not found" }, 404);

    const newOffer = getPlanOfferByMonths(body.newPlan, body.newMonths, DEFAULT_PLAN_OFFERS);
    if (!newOffer) return json({ ok: false, error: "Invalid new plan/months" }, 400);

    // Calculate remaining value from current plan
    let remainingValue = 0;
    if (store.plan_paid_amount && store.plan_paid_amount > 0 && store.plan_started_at && store.plan_expires_at) {
      const started = new Date(store.plan_started_at).getTime();
      const expires = new Date(store.plan_expires_at).getTime();
      const now = Date.now();
      const totalDays = (expires - started) / 86400_000;
      const remainingDays = Math.max(0, (expires - now) / 86400_000);
      if (totalDays > 0 && remainingDays > 0) {
        const dailyRate = store.plan_paid_amount / totalDays;
        remainingValue = Math.round(dailyRate * remainingDays);
      }
    }

    const newAmount = newOffer.amount;
    const difference = Math.max(0, newAmount - remainingValue);

    return json({
      ok: true,
      currentPlan: store.plan,
      currentPaidAmount: store.plan_paid_amount || 0,
      currentExpiresAt: store.plan_expires_at,
      remainingValue,
      newPlan: body.newPlan,
      newMonths: body.newMonths,
      newAmount,
      newDays: newOffer.days,
      difference,
    });
  }

  // Update a store
  const storeMatch = url.pathname.match(/^\/api\/platform-admin\/stores\/(\d+)$/);
  if (storeMatch && request.method === "PATCH") {
    const storeId = parseInt(storeMatch[1], 10);
    let body: { action?: string; plan_expires_at?: string; amount?: number; days?: number; months?: number };
    try {
      body = (await request.json()) as { action?: string; plan_expires_at?: string; amount?: number; days?: number; months?: number };
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }

    const { action } = body;
    if (!action) return json({ ok: false, error: "Missing action" }, 400);

    switch (action) {
      case "free":
      case "plus":
      case "pro":
      case "proplus": {
        let days = typeof body.days === "number" ? body.days : 30;
        let amount = typeof body.amount === "number" ? body.amount : 0;
        if (action !== "free") {
          const offer = getPlanOfferByMonths(action, body.months || 1, DEFAULT_PLAN_OFFERS);
          if (!offer) return json({ ok: false, error: "Invalid plan offer option" }, 400);
          days = offer.days;
          amount = offer.amount;
        }
        const expiresAt = action === "free"
          ? null
          : (body.plan_expires_at || new Date(Date.now() + days * 86400_000).toISOString());
        const startedAt = action === "free" ? null : new Date().toISOString();
        await db
          .prepare("UPDATE stores SET plan = ?, plan_expires_at = ?, plan_paid_amount = ?, plan_started_at = ?, updated_at = datetime('now') WHERE id = ?")
          .bind(action, expiresAt, action === "free" ? null : amount, startedAt, storeId)
          .run();

        // Auto-log revenue (skip test members and free plan)
        if (action !== "free" && amount > 0) {
          const testIds = await getTestStoreIds(db);
          if (!testIds.includes(storeId)) {
            await ensureLogTable(db);
            const store = await db
              .prepare("SELECT name, owner_email FROM stores WHERE id = ?")
              .bind(storeId)
              .first<{ name: string; owner_email: string }>();
            await db
              .prepare("INSERT INTO plan_change_logs (store_id, store_name, store_email, plan, days, amount) VALUES (?, ?, ?, ?, ?, ?)")
              .bind(storeId, store?.name || "", store?.owner_email || "", action, days, amount)
              .run();
          }
        }

        return json({ ok: true, plan: action, plan_expires_at: expiresAt });
      }
      case "template": {
        const tpl = (body as Record<string, unknown>).template as string;
        if (!tpl) return json({ ok: false, error: "Missing template" }, 400);
        await db
          .prepare("UPDATE stores SET template = ?, updated_at = datetime('now') WHERE id = ?")
          .bind(tpl, storeId)
          .run();
        return json({ ok: true, template: tpl });
      }
      case "rename": {
        const newName = (body as Record<string, unknown>).name as string;
        if (!newName) return json({ ok: false, error: "Missing name" }, 400);
        await db
          .prepare("UPDATE stores SET name = ?, updated_at = datetime('now') WHERE id = ?")
          .bind(newName, storeId)
          .run();
        return json({ ok: true, name: newName });
      }
      case "deactivate":
        await db
          .prepare("UPDATE stores SET is_active = 0, updated_at = datetime('now') WHERE id = ?")
          .bind(storeId)
          .run();
        return json({ ok: true });
      case "activate":
        await db
          .prepare("UPDATE stores SET is_active = 1, updated_at = datetime('now') WHERE id = ?")
          .bind(storeId)
          .run();
        return json({ ok: true });
      case "skip_phone_pending": {
        const store = await db
          .prepare("SELECT email_verified, onboarding_step FROM stores WHERE id = ?")
          .bind(storeId)
          .first<{ email_verified: number; onboarding_step: string }>();
        if (!store) return json({ ok: false, error: "Store not found" }, 404);
        if (!store.email_verified) return json({ ok: false, error: "Email 尚未驗證，無法跳過手機驗證" }, 400);
        if (store.onboarding_step !== "phone_pending") {
          return json({ ok: false, error: "目前不是手機驗證待完成狀態" }, 400);
        }

        await db
          .prepare(
            `UPDATE stores
             SET phone_verified = 1,
                 onboarding_step = 'store_setup',
                 updated_at = datetime('now')
             WHERE id = ?`
          )
          .bind(storeId)
          .run();
        return json({ ok: true, onboarding_step: "store_setup", phone_verified: 1 });
      }
      default:
        return json({ ok: false, error: "Unknown action" }, 400);
    }
  }

  const displaySettingsMatch = url.pathname.match(/^\/api\/platform-admin\/stores\/(\d+)\/display-settings$/);
  if (displaySettingsMatch && request.method === "GET") {
    const storeId = parseInt(displaySettingsMatch[1], 10);
    const row = await db
      .prepare("SELECT value FROM app_settings WHERE store_id = ? AND key = 'display_settings'")
      .bind(storeId)
      .first<{ value: string }>();
    return json({ ok: true, ...parseDisplaySettings(row?.value || null) });
  }

  if (displaySettingsMatch && request.method === "POST") {
    const storeId = parseInt(displaySettingsMatch[1], 10);
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }

    const store = await db
      .prepare("SELECT id, plan, plan_expires_at FROM stores WHERE id = ?")
      .bind(storeId)
      .first<{ id: number; plan: string; plan_expires_at: string | null }>();
    if (!store) return json({ ok: false, error: "Store not found" }, 404);

    const existingRow = await db
      .prepare("SELECT value FROM app_settings WHERE store_id = ? AND key = 'display_settings'")
      .bind(storeId)
      .first<{ value: string }>();
    const effectivePlan = getEffectivePlan(store as any);
    const settings = {
      ...parseDisplaySettings(existingRow?.value || null),
      ...sanitizeDisplaySettingsPatch(body, effectivePlan),
    };

    await db
      .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'display_settings', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
      .bind(storeId, JSON.stringify(settings))
      .run();

    return json({ ok: true, ...settings });
  }

  const logoUploadMatch = url.pathname.match(/^\/api\/platform-admin\/stores\/(\d+)\/logo-upload$/);
  if (logoUploadMatch && request.method === "POST") {
    const storeId = parseInt(logoUploadMatch[1], 10);
    if (!r2) return json({ ok: false, error: "R2 not configured" }, 500);

    const store = await db
      .prepare("SELECT id, plan, plan_expires_at FROM stores WHERE id = ?")
      .bind(storeId)
      .first<{ id: number; plan: string; plan_expires_at: string | null }>();
    if (!store) return json({ ok: false, error: "Store not found" }, 404);

    const effectivePlan = getEffectivePlan(store as any);
    if (!canManageStoreLogo(effectivePlan)) {
      return json({ ok: false, error: "此會員方案不可設定 Logo" }, 403);
    }

    let body: { image?: string };
    try {
      body = (await request.json()) as { image?: string };
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }
    if (!body.image) return json({ ok: false, error: "Missing image" }, 400);

    const binaryString = atob(body.image);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const key = `${storeId}/logos/${Date.now()}.webp`;
    await r2.put(key, bytes.buffer, {
      httpMetadata: { contentType: "image/webp" },
    });
    return json({ ok: true, key });
  }

  // Delete a store (requires password)
  if (storeMatch && request.method === "DELETE") {
    const storeId = parseInt(storeMatch[1], 10);
    let body: { password?: string };
    try {
      body = (await request.json()) as { password?: string };
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }
    if (!body.password || body.password !== platformPassword) {
      return json({ ok: false, error: "密碼錯誤" }, 401);
    }
    // Delete related data first, then store
    await db.prepare("DELETE FROM requirement_items WHERE requirement_form_id IN (SELECT id FROM requirement_forms WHERE store_id = ?)").bind(storeId).run();
    await db.prepare("DELETE FROM requirement_forms WHERE store_id = ?").bind(storeId).run();
    await db.prepare("DELETE FROM products WHERE store_id = ?").bind(storeId).run();
    await db.prepare("DELETE FROM app_settings WHERE store_id = ?").bind(storeId).run();
    await db.prepare("DELETE FROM phone_verification_codes WHERE store_id = ?").bind(storeId).run();
    await db.prepare("DELETE FROM email_verifications WHERE store_id = ?").bind(storeId).run();
    await db.prepare("DELETE FROM store_sessions WHERE store_id = ?").bind(storeId).run();
    await db.prepare("DELETE FROM stores WHERE id = ?").bind(storeId).run();
    return json({ ok: true, deletedId: storeId });
  }

  // Revenue logs: list
  if (url.pathname === "/api/platform-admin/revenue-logs" && request.method === "GET") {
    await ensureLogTable(db);
    const month = url.searchParams.get("month"); // format: 2026-04
    let sql = "SELECT * FROM plan_change_logs";
    const binds: string[] = [];
    if (month) {
      sql += " WHERE created_at LIKE ?";
      binds.push(month + "%");
    }
    sql += " ORDER BY created_at DESC LIMIT 500";
    const stmt = binds.length > 0 ? db.prepare(sql).bind(...binds) : db.prepare(sql);
    const result = await stmt.all();
    return json({ ok: true, logs: result.results });
  }

  // Revenue logs: update status
  const logMatch = url.pathname.match(/^\/api\/platform-admin\/revenue-logs\/(\d+)$/);
  if (logMatch && request.method === "PATCH") {
    await ensureLogTable(db);
    const logId = parseInt(logMatch[1], 10);
    let body: { status?: string };
    try {
      body = (await request.json()) as { status?: string };
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }
    const validStatuses = ["normal", "pending", "cancelled"];
    if (!body.status || !validStatuses.includes(body.status)) {
      return json({ ok: false, error: "Invalid status" }, 400);
    }
    await db
      .prepare("UPDATE plan_change_logs SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(body.status, logId)
      .run();
    return json({ ok: true });
  }

  // Get test store IDs
  if (url.pathname === "/api/platform-admin/test-stores" && request.method === "GET") {
    const ids = await getTestStoreIds(db);
    return json({ ok: true, testStoreIds: ids });
  }

  // Get platform API keys (super-admin only)
  if (url.pathname === "/api/platform-admin/api-keys" && request.method === "GET") {
    // Require super-admin email via query param (token already verified above)
    const reqEmail = url.searchParams.get("email") || "";
    if (reqEmail !== "lovemage@gmail.com") {
      return json({ ok: false, error: "權限不足" }, 403);
    }

    const keys = await db
      .prepare("SELECT key, value FROM app_settings WHERE store_id = 0 AND key IN ('gemini_api_key_starter', 'gemini_api_key_pro', 'openrouter_api_key_pro', 'openrouter_model', 'gemini_model', 'image_gen_api_key', 'image_gen_model', 'marketing_provider', 'marketing_api_key', 'marketing_model', 'banner_provider', 'banner_api_key', 'banner_model')")
      .all<{ key: string; value: string }>();

    const result: Record<string, string> = {};
    for (const row of keys.results) {
      result[row.key] = row.value;
    }
    return json({
      ok: true,
      starterKey: result["gemini_api_key_starter"] || "",
      proKey: result["gemini_api_key_pro"] || "",
      openrouterProKey: result["openrouter_api_key_pro"] || "",
      openrouterModel: result["openrouter_model"] || "",
      geminiModel: result["gemini_model"] || "",
      imageGenApiKey: result["image_gen_api_key"] || "",
      imageGenModel: result["image_gen_model"] || "",
      marketingProvider: result["marketing_provider"] || "gemini",
      marketingApiKey: result["marketing_api_key"] || "",
      marketingModel: result["marketing_model"] || "",
      bannerProvider: result["banner_provider"] || "gemini",
      bannerApiKey: result["banner_api_key"] || "",
      bannerModel: result["banner_model"] || "",
    });
  }

  // Set platform API keys (super-admin only)
  if (url.pathname === "/api/platform-admin/api-keys" && request.method === "POST") {
    let body: { starterKey?: string; proKey?: string; openrouterProKey?: string; openrouterModel?: string; geminiModel?: string; imageGenApiKey?: string; imageGenModel?: string; marketingProvider?: string; marketingApiKey?: string; marketingModel?: string; bannerProvider?: string; bannerApiKey?: string; bannerModel?: string; email?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }

    if ((body.email || "") !== "lovemage@gmail.com") {
      return json({ ok: false, error: "權限不足" }, 403);
    }

    if (body.starterKey !== undefined) {
      await db
        .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (0, 'gemini_api_key_starter', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
        .bind(body.starterKey)
        .run();
    }
    if (body.proKey !== undefined) {
      await db
        .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (0, 'gemini_api_key_pro', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
        .bind(body.proKey)
        .run();
    }
    if (body.openrouterProKey !== undefined) {
      await db
        .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (0, 'openrouter_api_key_pro', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
        .bind(body.openrouterProKey)
        .run();
    }
    if (body.openrouterModel) {
      await db
        .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (0, 'openrouter_model', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
        .bind(body.openrouterModel)
        .run();
    }
    if (body.geminiModel) {
      await db
        .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (0, 'gemini_model', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
        .bind(body.geminiModel)
        .run();
    }
    if (body.imageGenApiKey !== undefined) {
      await db
        .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (0, 'image_gen_api_key', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
        .bind(body.imageGenApiKey)
        .run();
    }
    if (body.imageGenModel) {
      await db
        .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (0, 'image_gen_model', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
        .bind(body.imageGenModel)
        .run();
    }
    if (body.marketingProvider) {
      await db
        .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (0, 'marketing_provider', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
        .bind(body.marketingProvider)
        .run();
    }
    if (body.marketingApiKey !== undefined) {
      await db
        .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (0, 'marketing_api_key', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
        .bind(body.marketingApiKey)
        .run();
    }
    if (body.marketingModel) {
      await db
        .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (0, 'marketing_model', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
        .bind(body.marketingModel)
        .run();
    }
    if (body.bannerProvider) {
      await db
        .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (0, 'banner_provider', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
        .bind(body.bannerProvider)
        .run();
    }
    if (body.bannerApiKey !== undefined) {
      await db
        .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (0, 'banner_api_key', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
        .bind(body.bannerApiKey)
        .run();
    }
    if (body.bannerModel) {
      await db
        .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (0, 'banner_model', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
        .bind(body.bannerModel)
        .run();
    }

    return json({ ok: true });
  }

  // Get/Set system prompt for recognize
  if (url.pathname === "/api/platform-admin/system-prompt" && request.method === "GET") {
    const row = await db
      .prepare("SELECT value FROM app_settings WHERE store_id = 0 AND key = 'recognize_prompt'")
      .first<{ value: string }>();
    return json({ ok: true, prompt: row?.value || "" });
  }

  if (url.pathname === "/api/platform-admin/system-prompt" && request.method === "POST") {
    let body: { prompt?: string };
    try {
      body = (await request.json()) as { prompt?: string };
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }
    await db
      .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (0, 'recognize_prompt', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
      .bind(body.prompt || "")
      .run();
    return json({ ok: true });
  }

  // Get/Set image generation prompt
  if (url.pathname === "/api/platform-admin/image-prompt" && request.method === "GET") {
    const row = await db
      .prepare("SELECT value FROM app_settings WHERE store_id = 0 AND key = 'image_gen_prompt'")
      .first<{ value: string }>();
    return json({ ok: true, prompt: row?.value || "" });
  }

  if (url.pathname === "/api/platform-admin/image-prompt" && request.method === "POST") {
    let body: { prompt?: string };
    try {
      body = (await request.json()) as { prompt?: string };
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }
    await db
      .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (0, 'image_gen_prompt', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
      .bind(body.prompt || "")
      .run();
    return json({ ok: true });
  }

  // Get/Set tutorial avatar
  if (url.pathname === "/api/platform-admin/tutorial-avatar" && request.method === "GET") {
    const row = await db
      .prepare("SELECT value FROM app_settings WHERE store_id = 0 AND key = 'tutorial_avatar'")
      .first<{ value: string }>();
    return json({ ok: true, avatar: row?.value || "" });
  }
  if (url.pathname === "/api/platform-admin/tutorial-avatar" && request.method === "POST") {
    let body: { avatar?: string };
    try { body = (await request.json()) as { avatar?: string }; } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }
    await db
      .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (0, 'tutorial_avatar', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
      .bind(body.avatar || "")
      .run();
    return json({ ok: true });
  }

  // Get/Set FAQ items
  if (url.pathname === "/api/platform-admin/faq" && request.method === "GET") {
    const row = await db
      .prepare("SELECT value FROM app_settings WHERE store_id = 0 AND key = 'faq_items'")
      .first<{ value: string }>();
    return json({ ok: true, items: row?.value ? JSON.parse(row.value) : [] });
  }

  if (url.pathname === "/api/platform-admin/faq" && request.method === "POST") {
    let body: { items?: Array<{ q: string; a: string }> };
    try {
      body = (await request.json()) as { items?: Array<{ q: string; a: string }> };
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }
    const items = Array.isArray(body.items) ? body.items.filter(i => i.q && i.a) : [];
    await db
      .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (0, 'faq_items', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
      .bind(JSON.stringify(items))
      .run();
    return json({ ok: true });
  }

  // Get/Set plan product limits
  if (url.pathname === "/api/platform-admin/plan-limits" && request.method === "GET") {
    const row = await db
      .prepare("SELECT value FROM app_settings WHERE store_id = 0 AND key = 'plan_limits'")
      .first<{ value: string }>();
    const defaults = { free: 10, plus: 25, pro: 60, proplus: -1 };
    try {
      return json({ ok: true, limits: row?.value ? JSON.parse(row.value) : defaults });
    } catch {
      return json({ ok: true, limits: defaults });
    }
  }

  if (url.pathname === "/api/platform-admin/plan-limits" && request.method === "POST") {
    let body: { free?: number; plus?: number; pro?: number; proplus?: number };
    try {
      body = (await request.json()) as { free?: number; plus?: number; pro?: number; proplus?: number };
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }
    const limits = {
      free: body.free ?? 10,
      plus: body.plus ?? 25,
      pro: body.pro ?? 60,
      proplus: body.proplus ?? -1,
    };
    await db
      .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (0, 'plan_limits', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
      .bind(JSON.stringify(limits))
      .run();
    return json({ ok: true });
  }

  return json({ ok: false, error: "Not Found" }, 404);
}
