// vovosnap — Multi-tenant SaaS for proxy buyers
// Top-level request dispatcher

import type { D1DatabaseLike } from "./types/d1";
import type { RequestContext } from "./context";
import { resolveStore, resolveStoreBySubdomain, getEffectivePlan } from "./context";
import { routeTenantRequest } from "./router";
import {
  handleGoogleAuthRedirect,
  handleGoogleAuthCallback,
  handleVerifyEmail,
  handleResendVerificationEmail,
  handleVerifyPhone,
  handleCompleteOnboarding,
  handleGetCurrentStore,
  handleAdminLogin,
  handleAdminLogout,
  isAdminAuthorized,
} from "./routes/admin/auth";
import { handlePlatformAdmin } from "./routes/platform-admin";

type Env = {
  DB: D1DatabaseLike;
  IMAGES?: any;
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_API_TOKEN: string;
  CRAWL_LIST_PAGES?: string;
  CRAWL_MAX_PAGES?: string;
  CRAWL_TIMEOUT_MS?: string;
  // Auth providers
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  RESEND_API_KEY: string;
  FIREBASE_PROJECT_ID: string;
  APP_URL: string;
  PLATFORM_ADMIN_PASSWORD?: string;
  // Multi-tenant domain
  MAIN_DOMAIN?: string; // e.g. "vovosnap.com"
};

function json(payload: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function getAuthEnv(env: Env) {
  return {
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
    RESEND_API_KEY: env.RESEND_API_KEY,
    FIREBASE_PROJECT_ID: env.FIREBASE_PROJECT_ID,
    APP_URL: env.APP_URL,
  };
}

function getCrawlEnv(env: Env) {
  return {
    CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN,
    CRAWL_LIST_PAGES: env.CRAWL_LIST_PAGES,
    CRAWL_MAX_PAGES: env.CRAWL_MAX_PAGES,
    CRAWL_TIMEOUT_MS: env.CRAWL_TIMEOUT_MS,
  };
}

function buildCtxFromStore(
  store: { id: number; slug: string; plan: string; plan_expires_at: string | null },
  env: Env,
  basePath: string
): RequestContext {
  return {
    storeId: store.id,
    storeSlug: store.slug,
    storePlan: getEffectivePlan(store as any),
    db: env.DB,
    r2: env.IMAGES ?? null,
    basePath,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const mainDomain = env.MAIN_DOMAIN || "vovosnap.com";
    const hostname = url.hostname;

    // ── Health check ──
    if (request.method === "GET" && url.pathname === "/healthz") {
      return json({ ok: true, service: "vovosnap" });
    }

    // ── Platform admin ──
    if (url.pathname.startsWith("/platform-admin") || url.pathname.startsWith("/api/platform-admin")) {
      return handlePlatformAdmin(request, env.DB, env.PLATFORM_ADMIN_PASSWORD || "", env.ASSETS);
    }

    // ── Public API: plan limits (for landing page) ──
    if (url.pathname === "/api/plan-limits") {
      const row = await env.DB
        .prepare("SELECT value FROM app_settings WHERE store_id = 0 AND key = 'plan_limits'")
        .first<{ value: string }>();
      const limits = row?.value ? JSON.parse(row.value) : { free: 10, starter: 50, pro: -1 };
      return json({ ok: true, limits });
    }

    // ── Auth routes (platform-level, not tenant-scoped) ──
    if (url.pathname === "/auth/google") {
      return handleGoogleAuthRedirect(getAuthEnv(env));
    }
    if (url.pathname === "/auth/google/callback") {
      return handleGoogleAuthCallback(request, env.DB, getAuthEnv(env));
    }
    if (url.pathname === "/auth/verify-email") {
      return handleVerifyEmail(request, env.DB, getAuthEnv(env));
    }
    if (url.pathname === "/auth/resend-verification") {
      return handleResendVerificationEmail(request, env.DB, getAuthEnv(env));
    }
    if (url.pathname === "/auth/verify-phone") {
      return handleVerifyPhone(request, env.DB, getAuthEnv(env));
    }
    if (url.pathname === "/auth/complete-onboarding") {
      return handleCompleteOnboarding(request, env.DB);
    }
    if (url.pathname === "/auth/me") {
      return handleGetCurrentStore(request, env.DB);
    }

    // ── Legacy login/logout (bootstrap store compat) ──
    if (url.pathname === "/api/admin/login") {
      return handleAdminLogin(request, env);
    }
    if (url.pathname === "/api/admin/logout") {
      return handleAdminLogout(request, env);
    }

    // ── Subdomain tenant routing: {slug}.vovosnap.com ──
    if (hostname !== mainDomain && hostname.endsWith(`.${mainDomain}`)) {
      const slug = hostname.replace(`.${mainDomain}`, "");
      const store = await resolveStoreBySubdomain(env.DB, slug);
      if (!store || !store.is_active) {
        return json({ ok: false, error: "Store not found" }, 404);
      }
      const ctx = buildCtxFromStore(store, env, ""); // empty basePath for subdomain
      return routeTenantRequest(request, ctx, url.pathname, getCrawlEnv(env), env.ASSETS);
    }

    // ── Path-based tenant routing: /s/{slug}/* ──
    const tenantMatch = url.pathname.match(/^\/s\/([a-z0-9][a-z0-9-]*[a-z0-9]|[a-z0-9]{1,2})(\/.*)?$/);
    if (tenantMatch) {
      const slug = tenantMatch[1];
      const subPath = tenantMatch[2] || "/";
      const store = await resolveStore(env.DB, slug);
      if (!store || !store.is_active) {
        return json({ ok: false, error: "Store not found" }, 404);
      }
      const ctx = buildCtxFromStore(store, env, `/s/${slug}`);
      return routeTenantRequest(request, ctx, subPath, getCrawlEnv(env), env.ASSETS);
    }

    // ── Onboarding page ──
    if (url.pathname === "/onboarding" || url.pathname === "/onboarding.html") {
      if (env.ASSETS) {
        // Serve onboarding.html (will be created in Phase 6)
        const resp = await env.ASSETS.fetch(new Request(new URL("/onboarding.html", request.url).toString(), request));
        if (resp.ok) return resp;
      }
      return json({ ok: false, error: "Onboarding page not found" }, 404);
    }

    // ── Landing page (platform root) ──
    if (url.pathname === "/" || url.pathname === "/index.html") {
      // index.html IS the landing page now (renamed from landing.html)
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }
      return json({ ok: false, error: "Not configured" }, 500);
    }

    // ── Redirect root-level store pages to tenant path when returnTo hints the store ──
    if ((url.pathname === "/product" || url.pathname === "/product.html" ||
         url.pathname === "/request.html" || url.pathname === "/success.html") &&
        url.searchParams.get("returnTo")) {
      const returnTo = url.searchParams.get("returnTo") || "";
      const storeMatch = returnTo.match(/^\/s\/([a-z0-9][a-z0-9-]*)/);
      if (storeMatch) {
        const redirectUrl = `/s/${storeMatch[1]}${url.pathname}${url.search}`;
        return Response.redirect(new URL(redirectUrl, request.url).toString(), 302);
      }
    }

    // ── Legacy routes: serve bootstrap store at root (backward compat) ──
    // During transition, root-level /api/* routes still work for store_id=1
    if (url.pathname.startsWith("/api/") || url.pathname === "/admin/crawl") {
      const store = await resolveStore(env.DB, "default");
      if (store) {
        const ctx = buildCtxFromStore(store, env, "");
        return routeTenantRequest(request, ctx, url.pathname, getCrawlEnv(env), env.ASSETS);
      }
    }

    // ── Legacy HTML pages at root (backward compat for bootstrap store) ──
    if (url.pathname === "/admin" || url.pathname === "/admin.html") {
      const isAdmin = await isAdminAuthorized(request, env.DB);
      if (!isAdmin) {
        return Response.redirect(new URL("/admin-login.html", request.url).toString(), 302);
      }
      // Fall through to ASSETS
    }

    // ── Static assets ──
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return json({ ok: false, error: "Not Found" }, 404);
  },
};
