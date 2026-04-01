import type { D1DatabaseLike } from "../types/d1";

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

export async function handlePlatformAdmin(
  request: Request,
  db: D1DatabaseLike,
  platformPassword: string,
  assets?: { fetch: (request: Request) => Promise<Response> }
): Promise<Response> {
  const url = new URL(request.url);

  // Serve the admin page
  if (url.pathname === "/platform-admin" || url.pathname === "/platform-admin.html") {
    if (assets) {
      return assets.fetch(new Request(new URL("/platform-admin.html", request.url).toString(), request));
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
    return json({ ok: true, token });
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
          s.phone_number, s.google_id, s.line_id,
          s.created_at, s.updated_at,
          (SELECT COUNT(1) FROM products p WHERE p.store_id = s.id) as product_count,
          (SELECT COUNT(1) FROM requirement_forms rf WHERE rf.store_id = s.id) as order_count
        FROM stores s
        ORDER BY s.created_at DESC
      `)
      .all();

    return json({ ok: true, stores: stores.results });
  }

  // Update a store
  const storeMatch = url.pathname.match(/^\/api\/platform-admin\/stores\/(\d+)$/);
  if (storeMatch && request.method === "PATCH") {
    const storeId = parseInt(storeMatch[1], 10);
    let body: { action?: string; plan_expires_at?: string };
    try {
      body = (await request.json()) as { action?: string; plan_expires_at?: string };
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }

    const { action } = body;
    if (!action) return json({ ok: false, error: "Missing action" }, 400);

    switch (action) {
      case "free":
      case "starter":
      case "pro": {
        const expiresAt = action === "free"
          ? null
          : (body.plan_expires_at || new Date(Date.now() + 30 * 86400_000).toISOString());
        await db
          .prepare("UPDATE stores SET plan = ?, plan_expires_at = ?, updated_at = datetime('now') WHERE id = ?")
          .bind(action, expiresAt, storeId)
          .run();
        return json({ ok: true, plan: action, plan_expires_at: expiresAt });
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
      default:
        return json({ ok: false, error: "Unknown action" }, 400);
    }
  }

  // Get platform API keys
  if (url.pathname === "/api/platform-admin/api-keys" && request.method === "GET") {
    const keys = await db
      .prepare("SELECT key, value FROM app_settings WHERE store_id = 0 AND key IN ('gemini_api_key_starter', 'gemini_api_key_pro')")
      .all<{ key: string; value: string }>();

    const result: Record<string, string> = {};
    for (const row of keys.results) {
      result[row.key] = row.value;
    }
    return json({
      ok: true,
      starterKey: result["gemini_api_key_starter"] || "",
      proKey: result["gemini_api_key_pro"] || "",
    });
  }

  // Set platform API keys
  if (url.pathname === "/api/platform-admin/api-keys" && request.method === "POST") {
    let body: { starterKey?: string; proKey?: string };
    try {
      body = (await request.json()) as { starterKey?: string; proKey?: string };
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }

    // Ensure store_id=0 exists for platform settings (no FK issue since we don't reference stores table)
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

    return json({ ok: true });
  }

  return json({ ok: false, error: "Not Found" }, 404);
}
