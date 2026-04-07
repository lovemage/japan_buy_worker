// vovosnap — Multi-tenant SaaS for proxy buyers
// Top-level request dispatcher

import type { D1DatabaseLike } from "./types/d1";
import type { RequestContext } from "./context";
import { resolveStore, resolveStoreBySubdomain, getEffectivePlan } from "./context";
import { routeTenantRequest } from "./router";
import {
  handleGoogleAuthRedirect,
  handleGoogleAuthCallback,
  handleLineAuthRedirect,
  handleLineAuthCallback,
  handleSetEmail,
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
import { DEFAULT_PLAN_OFFERS } from "./shared/plan-offers.js";

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
  LINE_CHANNEL_ID: string;
  LINE_CHANNEL_SECRET: string;
  RESEND_API_KEY: string;
  FIREBASE_PROJECT_ID: string;
  APP_URL: string;
  PLATFORM_ADMIN_PASSWORD?: string;
  // Multi-tenant domain
  MAIN_DOMAIN?: string; // e.g. "vovosnap.com"
};

function normalizeMainDomain(raw: string | undefined): string {
  const value = (raw || "vovosnap.com").trim().toLowerCase();
  return value
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

function resolveRequestHostname(request: Request, fallback: string): string {
  const forwarded = (request.headers.get("x-forwarded-host") || "").split(",")[0].trim().toLowerCase();
  const host = (request.headers.get("host") || "").split(",")[0].trim().toLowerCase();
  const raw = forwarded || host || fallback.toLowerCase();
  return raw.replace(/:\d+$/, "");
}

function json(payload: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toIsoDate(value: string | null | undefined): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function makeSitemapEntry(
  loc: string,
  lastmod: string,
  changefreq: "daily" | "weekly" | "monthly" | "yearly",
  priority: string
): string {
  return [
    "  <url>",
    `    <loc>${xmlEscape(loc)}</loc>`,
    `    <lastmod>${xmlEscape(lastmod)}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    "  </url>",
  ].join("\n");
}

function sitemapXml(entries: string[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    "</urlset>",
  ].join("\n");
}

function getAuthEnv(env: Env) {
  return {
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
    LINE_CHANNEL_ID: env.LINE_CHANNEL_ID,
    LINE_CHANNEL_SECRET: env.LINE_CHANNEL_SECRET,
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
  const mainDomain = normalizeMainDomain(env.MAIN_DOMAIN);
  return {
    storeId: store.id,
    storeSlug: store.slug,
    storePlan: getEffectivePlan(store as any),
    mainDomain,
    db: env.DB,
    r2: env.IMAGES ?? null,
    basePath,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const mainDomain = normalizeMainDomain(env.MAIN_DOMAIN);
    const hostname = resolveRequestHostname(request, url.hostname);

    if (hostname === `www.${mainDomain}`) {
      const redirectUrl = new URL(request.url);
      redirectUrl.hostname = mainDomain;
      return Response.redirect(redirectUrl.toString(), 302);
    }

    // ── Health check ──
    if (request.method === "GET" && url.pathname === "/healthz") {
      return json({ ok: true, service: "vovosnap" });
    }

    // ── Dynamic sitemap: platform + active member public pages ──
    if (request.method === "GET" && url.pathname === "/sitemap.xml") {
      const today = new Date().toISOString().slice(0, 10);
      const entries: string[] = [];
      const seen = new Set<string>();

      const add = (
        loc: string,
        lastmod: string,
        changefreq: "daily" | "weekly" | "monthly" | "yearly",
        priority: string
      ) => {
        if (!loc || seen.has(loc)) return;
        seen.add(loc);
        entries.push(makeSitemapEntry(loc, lastmod, changefreq, priority));
      };

      // Platform pages
      add(`https://${mainDomain}/`, today, "weekly", "1.0");
      add(`https://${mainDomain}/privacy.html`, today, "yearly", "0.3");
      add(`https://${mainDomain}/terms.html`, today, "yearly", "0.3");
      add(`https://${mainDomain}/blog/`, today, "weekly", "0.9");
      add(`https://${mainDomain}/blog/first-time-daigou-guide.html`, today, "monthly", "0.8");
      add(`https://${mainDomain}/blog/daigou-profit-calculation.html`, today, "monthly", "0.8");
      add(`https://${mainDomain}/blog/daigou-preparation-checklist.html`, today, "monthly", "0.8");
      add(`https://${mainDomain}/blog/sell-secondhand-items-fast.html`, today, "monthly", "0.8");

      const storesRows = await env.DB
        .prepare("SELECT id, slug, plan, updated_at FROM stores WHERE is_active = 1")
        .all<{ id: number; slug: string; plan: string; updated_at: string | null }>();
      const stores = Array.isArray(storesRows?.results) ? storesRows.results : [];

      const productsRows = await env.DB
        .prepare("SELECT store_id, source_product_code, updated_at FROM products WHERE is_active = 1 AND source_product_code IS NOT NULL")
        .all<{ store_id: number; source_product_code: string; updated_at: string | null }>();
      const products = Array.isArray(productsRows?.results) ? productsRows.results : [];

      const productsByStore = new Map<number, Array<{ code: string; updatedAt: string | null }>>();
      for (const row of products) {
        const list = productsByStore.get(row.store_id) || [];
        list.push({ code: row.source_product_code, updatedAt: row.updated_at });
        productsByStore.set(row.store_id, list);
      }

      for (const store of stores) {
        const slug = (store.slug || "").trim().toLowerCase();
        if (!slug) continue;

        const baseUrl = store.plan === "pro"
          ? `https://${slug}.${mainDomain}`
          : `https://${mainDomain}/s/${slug}`;
        const storeLastmod = toIsoDate(store.updated_at);

        // Member public storefront page
        add(`${baseUrl}/`, storeLastmod, "daily", "0.7");

        // Member public product pages
        const storeProducts = productsByStore.get(store.id) || [];
        for (const product of storeProducts) {
          const code = (product.code || "").trim();
          if (!code) continue;
          add(`${baseUrl}/product?code=${encodeURIComponent(code)}`, toIsoDate(product.updatedAt), "weekly", "0.6");
        }
      }

      return new Response(sitemapXml(entries), {
        status: 200,
        headers: {
          "content-type": "application/xml; charset=UTF-8",
          "cache-control": "public, max-age=3600",
        },
      });
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
    if (url.pathname === "/api/faq") {
      const row = await env.DB
        .prepare("SELECT value FROM app_settings WHERE store_id = 0 AND key = 'faq_items'")
        .first<{ value: string }>();
      return json({ ok: true, items: row?.value ? JSON.parse(row.value) : [] });
    }
    if (url.pathname === "/api/plan-offers") {
      return json({ ok: true, offers: DEFAULT_PLAN_OFFERS });
    }

    // ── Auth routes (platform-level, not tenant-scoped) ──
    if (url.pathname === "/auth/google") {
      return handleGoogleAuthRedirect(getAuthEnv(env));
    }
    if (url.pathname === "/auth/google/callback") {
      return handleGoogleAuthCallback(request, env.DB, getAuthEnv(env));
    }
    if (url.pathname === "/auth/line") {
      return handleLineAuthRedirect(getAuthEnv(env));
    }
    if (url.pathname === "/auth/line/callback") {
      return handleLineAuthCallback(request, env.DB, getAuthEnv(env));
    }
    if (url.pathname === "/auth/set-email") {
      return handleSetEmail(request, env.DB, getAuthEnv(env));
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
      if (getEffectivePlan(store) !== "pro") {
        const redirectUrl = new URL(request.url);
        redirectUrl.hostname = mainDomain;
        redirectUrl.pathname = url.pathname === "/" ? `/s/${store.slug}/` : `/s/${store.slug}${url.pathname}`;
        return Response.redirect(redirectUrl.toString(), 302);
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
        const resp = await env.ASSETS.fetch(new Request(new URL("/onboarding.html", request.url).toString(), { method: "GET", headers: request.headers }));
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
         url.pathname === "/request" || url.pathname === "/request.html" ||
         url.pathname === "/success" || url.pathname === "/success.html") &&
        url.searchParams.get("returnTo")) {
      const returnTo = url.searchParams.get("returnTo") || "";
      const storeMatch = returnTo.match(/^\/s\/([a-z0-9][a-z0-9-]*)/);
      if (storeMatch) {
        const redirectUrl = `/s/${storeMatch[1]}${url.pathname}${url.search}`;
        return Response.redirect(new URL(redirectUrl, request.url).toString(), 302);
      }
    }

    // ── Legacy routes: serve bootstrap store at root (backward compat) ──
    const LEGACY_PAGES = ["/product", "/product.html",
      "/request", "/request.html", "/success", "/success.html",
      "/admin", "/admin.html", "/admin-login.html"];
    const isLegacyPage = LEGACY_PAGES.includes(url.pathname);
    if (url.pathname.startsWith("/api/") || url.pathname === "/admin/crawl" || isLegacyPage) {
      const store = await resolveStore(env.DB, "default");
      if (store) {
        const ctx = buildCtxFromStore(store, env, "");
        return routeTenantRequest(request, ctx, url.pathname, getCrawlEnv(env), env.ASSETS);
      }
    }

    // ── Static assets ──
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return json({ ok: false, error: "Not Found" }, 404);
  },
};
