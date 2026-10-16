// vovosnap — Multi-tenant SaaS for proxy buyers
// Top-level request dispatcher

import type { D1DatabaseLike } from "./types/d1";
import type { RequestContext, StoreRow } from "./context";
import { resolveStore, resolveStoreBySubdomain, getEffectivePlan } from "./context";
import { routeTenantRequest } from "./router";
import { storefrontSitemap } from "./services/storefront-sitemap";
import { canonicalRedirect, withSecurityHeaders, serveWithEdgeCache } from "./shared/site-policy.js";
import {
  handleGoogleAuthRedirect,
  handleGoogleAuthCallback,
  handleLineAuthRedirect,
  handleLineAuthCallback,
  handleSetEmail,
  handleVerifyEmail,
  handleResendVerificationEmail,
  handleCompleteOnboarding,
  handleGetCurrentStore,
  handleAdminLogin,
  handleAdminLogout,
  isAdminAuthorized,
} from "./routes/admin/auth";
import { handlePlatformAdmin } from "./routes/platform-admin";
import { handlePlatformModeration } from "./routes/platform-moderation";
import { runModerationScan } from "./services/product-moderation";
import { DEFAULT_PLAN_OFFERS } from "./shared/plan-offers.js";
import {
  handleBillingCheckout,
  handleBillingUpgradeQuotes,
  handleBillingNotify,
  handleBillingReturn,
  handleBillingOrderStatus,
  handleBillingOrders,
} from "./routes/billing";
import {
  handleGetStorePayConfig,
  handlePutStorePayConfig,
  handleTestStorePayConfig,
  handleEnableStorePayConfig,
  handleCreateStorePayOrder,
  handleListStorePayOrders,
  handlePublicGetOrder,
  handlePublicCheckout,
  handlePublicOrderStatus,
  handleStorePayNotify,
  handleStorePayReturn,
} from "./routes/store-payment";
import { runPlanExpiryNotifications } from "./services/email-notifications";
import { parsePlanProductLimits } from "./shared/product-limits.js";

type Env = {
  DB: D1DatabaseLike;
  EMAIL?: {
    send: (message: {
      to: string | string[];
      from: { email: string; name?: string };
      subject: string;
      html: string;
      text: string;
    }) => Promise<unknown>;
  };
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
  APP_URL: string;
  PLATFORM_ADMIN_PASSWORD?: string;
  // Multi-tenant domain
  MAIN_DOMAIN?: string; // e.g. "vovosnap.com"
  // PAYUNi billing
  PAYUNI_MER_ID?: string;
  PAYUNI_HASH_KEY?: string;
  PAYUNI_HASH_IV?: string;
  PAYUNI_SANDBOX?: string;
};

function normalizeMainDomain(raw: string | undefined): string {
  const value = (raw || "vovosnap.com").trim().toLowerCase();
  return value
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

function resolveRequestHostname(_request: Request, fallback: string): string {
  return fallback.toLowerCase();
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

// Published blog articles and their modification dates. Article membership
// mirrors public/assets/blog-data.js; freshness tests compare lastmod against
// each article's JSON-LD dateModified (falling back to datePublished).
//
// Paths are extensionless on purpose: Workers Assets 307-redirects `/x.html` to
// `/x`, so a sitemap full of `.html` URLs would cost one redirect per entry.
const BLOG_ARTICLE_LASTMOD: ReadonlyArray<readonly [string, string]> = [
  ["/blog/facebook-threads-store-link-sharing", "2026-10-16"],
  ["/blog/online-shop-returns-seven-day-rule", "2026-10-16"],
  ["/blog/product-photo-tips-ai-recognition", "2026-10-16"],
  ["/blog/thailand-daigou-guide", "2026-10-16"],
  ["/blog/overseas-seller-sell-to-taiwan", "2026-10-16"],
  ["/blog/daigou-food-cosmetics-medicine-rules", "2026-10-16"],
  ["/blog/taiwan-customs-duty-free-daigou", "2026-10-16"],
  ["/blog/daigou-tax-registration-threshold", "2026-10-16"],
  ["/blog/daigou-order-management-status", "2026-10-16"],
  ["/blog/new-store-first-week-checklist", "2026-10-16"],
  ["/blog/line-group-order-link-guide", "2026-10-16"],
  ["/blog/instagram-story-product-link-guide", "2026-10-16"],
  ["/blog/korea-daigou-beginner-guide", "2026-10-16"],
  ["/blog/daigou-exchange-rate-auto-pricing", "2026-08-07"],
  ["/blog/secondhand-bag-photo-recognition", "2026-08-07"],
  ["/blog/japan-drugstore-batch-recognition", "2026-10-16"],
  ["/blog/taobao-auto-listing-duplicate-risk", "2026-08-07"],
  ["/blog/edit-ai-recognition-before-publish", "2026-10-16"],
  ["/blog/free-or-pay-per-listing-software", "2026-08-07"],
  ["/blog/photo-listing-software-pricing", "2026-08-07"],
  ["/blog/secondhand-fast-listing-alternatives", "2026-08-07"],
  ["/blog/japan-cosmetics-photo-listing-software", "2026-10-16"],
  ["/blog/ai-vs-barcode-product-listing", "2026-08-06"],
  ["/blog/solo-seller-fast-product-listing", "2026-08-06"],
  ["/blog/japan-cosmetics-daigou-guide", "2026-10-16"],
  ["/blog/sell-secondhand-items-fast", "2026-10-16"],
  ["/blog/daigou-profit-calculation", "2026-04-04"],
  ["/blog/daigou-preparation-checklist", "2026-10-16"],
  ["/blog/first-time-daigou-guide", "2026-10-16"],
];

function sitemapXml(entries: string[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    "</urlset>",
  ].join("\n");
}

// Public, indexable HTML pages on the main domain — safe to cache at the edge
// with stale-while-revalidate. Auth/transaction pages and fingerprinted assets
// are deliberately excluded so their default headers are preserved.
function withPublicHtmlCache(resp: Response, pathname: string): Response {
  // Workers Assets 307-redirects `/x.html` to `/x`, so the extensionless form is
  // the one visitors and crawlers actually land on — both spellings are listed
  // here so a direct `.html` hit is not the only cacheable variant.
  const isPublicHtml =
    pathname === "/" ||
    pathname === "/index.html" ||
    pathname === "/about" ||
    pathname === "/about.html" ||
    pathname === "/privacy" ||
    pathname === "/privacy.html" ||
    pathname === "/terms" ||
    pathname === "/terms.html" ||
    pathname === "/blog" ||
    pathname === "/blog/" ||
    pathname.startsWith("/blog/") ||
    pathname.startsWith("/guide/");
  if (!isPublicHtml) return resp;
  if (!resp.ok) return resp;
  if (!(resp.headers.get("content-type") || "").includes("text/html")) return resp;
  const headers = new Headers(resp.headers);
  headers.set("cache-control", "public, max-age=3600, stale-while-revalidate=86400");
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
}

function getAuthEnv(env: Env) {
  return {
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
    LINE_CHANNEL_ID: env.LINE_CHANNEL_ID,
    LINE_CHANNEL_SECRET: env.LINE_CHANNEL_SECRET,
    RESEND_API_KEY: env.RESEND_API_KEY,
    APP_URL: env.APP_URL,
  };
}

function redirectAuthStartToAppUrl(request: Request, appUrl: string): Response | null {
  const currentUrl = new URL(request.url);
  const appBaseUrl = new URL(appUrl);
  if (currentUrl.origin === appBaseUrl.origin) return null;

  const redirectUrl = new URL(currentUrl.pathname + currentUrl.search, appBaseUrl);
  return Response.redirect(redirectUrl.toString(), 302);
}

function isTenantOwnerPath(pathname: string): boolean {
  return pathname === "/admin" ||
    pathname === "/admin.html" ||
    pathname === "/admin-login.html" ||
    pathname === "/admin/crawl" ||
    pathname.startsWith("/api/admin/") ||
    pathname.startsWith("/api/store-pay/");
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
  store: { id: number; slug: string; subdomain?: string | null; plan: string; plan_expires_at: string | null },
  env: Env,
  basePath: string
): RequestContext {
  const mainDomain = normalizeMainDomain(env.MAIN_DOMAIN);
  return {
    storeId: store.id,
    storeSlug: store.slug,
    storeSubdomain: store.subdomain || store.slug,
    storePlan: getEffectivePlan(store as any),
    mainDomain,
    db: env.DB,
    r2: env.IMAGES ?? null,
    basePath,
  };
}

// Dispatch the store-owned PAYUNi collection routes. Returns a Response promise
// when `pathname` matches a store-pay route, or null when it doesn't.
//
// The handlers resolve the store from the session cookie (getSessionStore), so
// they are path-independent and must be reachable from BOTH the main domain
// (e.g. /api/store-pay/config) and path-based tenant routing, where the admin
// page's apiFetch prefixes the basePath (e.g. /s/{slug}/api/store-pay/config).
function dispatchStorePayRoute(
  pathname: string,
  request: Request,
  env: Env
): Promise<Response> | null {
  if (pathname === "/api/store-pay/config") {
    if (request.method === "GET") return handleGetStorePayConfig(request, env);
    if (request.method === "PUT") return handlePutStorePayConfig(request, env);
    return Promise.resolve(json({ ok: false, error: "Method Not Allowed" }, 405));
  }
  if (pathname === "/api/store-pay/config/test") return handleTestStorePayConfig(request, env);
  if (pathname === "/api/store-pay/config/enable") return handleEnableStorePayConfig(request, env);
  if (pathname === "/api/store-pay/orders") {
    if (request.method === "POST") return handleCreateStorePayOrder(request, env);
    if (request.method === "GET") return handleListStorePayOrders(request, env);
    return Promise.resolve(json({ ok: false, error: "Method Not Allowed" }, 405));
  }
  if (pathname === "/api/store-pay/public/order") return handlePublicGetOrder(request, env);
  if (pathname === "/api/store-pay/public/checkout") return handlePublicCheckout(request, env);
  if (pathname === "/api/store-pay/public/order-status") return handlePublicOrderStatus(request, env);
  if (pathname === "/api/store-pay/notify") return handleStorePayNotify(request, env, new URL(request.url));
  if (pathname === "/api/store-pay/return") return handleStorePayReturn(request, env, new URL(request.url));
  return null;
}

// Weekly product compliance scan: Monday 02:00 Asia/Taipei. Must match wrangler.toml.
const MODERATION_SCAN_CRON = "0 18 * * SUN";

const worker = {
  async scheduled(controller: { cron?: string } | undefined, env: Env): Promise<void> {
    if (controller?.cron === MODERATION_SCAN_CRON) {
      try {
        const result = await runModerationScan(env, { trigger: "cron" });
        console.log("Product moderation scan completed:", result);
      } catch (error) {
        console.error("Product moderation scan failed:", error);
      }
      return;
    }
    try {
      const result = await runPlanExpiryNotifications(env);
      console.log("Plan expiry notification job completed:", result);
    } catch (error) {
      console.error("Plan expiry notification job failed:", error);
    }
  },

  async fetch(request: Request, env: Env): Promise<Response> {
   try {
    const url = new URL(request.url);
    const mainDomain = normalizeMainDomain(env.MAIN_DOMAIN);
    const hostname = resolveRequestHostname(request, url.hostname);

    const redirect = canonicalRedirect(request, mainDomain);
    if (redirect) return redirect;

    // Sitemaps contain only URLs belonging to the requested host.
    if (request.method === "GET" && (url.pathname === "/sitemap-stores.xml"
      || (hostname !== mainDomain && url.pathname === "/sitemap.xml"))) {
      const rows = await storefrontSitemap(env.DB, hostname, mainDomain);
      return new Response(sitemapXml(rows.map(row => makeSitemapEntry(row.loc, toIsoDate(row.updated), "weekly", "0.6"))), {
        headers: { "content-type": "application/xml; charset=UTF-8", "cache-control": "public, max-age=0, s-maxage=300" },
      });
    }
    if (request.method === "GET" && hostname !== mainDomain && url.pathname === "/robots.txt") {
      return new Response(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\nSitemap: https://${hostname}/sitemap.xml\n`, {
        headers: { "content-type": "text/plain; charset=UTF-8" },
      });
    }

    // ── Health check ──
    if (request.method === "GET" && url.pathname === "/healthz") {
      return json({ ok: true, service: "vovosnap" });
    }

    // ── Platform sitemap: editorial pages only ──
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
      add(`https://${mainDomain}/about`, today, "monthly", "0.7");
      add(`https://${mainDomain}/privacy`, today, "yearly", "0.3");
      add(`https://${mainDomain}/terms`, today, "yearly", "0.3");
      add(`https://${mainDomain}/blog/`, today, "weekly", "0.9");
      // Article lastmod must be the article's own date, not "today" — a sitemap
      // that claims every page changed today teaches crawlers to ignore lastmod.
      // Kept in step with public/assets/blog-data.js by blog-article-freshness.test.js.
      for (const [path, lastmod] of BLOG_ARTICLE_LASTMOD) {
        add(`https://${mainDomain}${path}`, lastmod, "monthly", "0.8");
      }
      add(`https://${mainDomain}/guide/japan-cosmetics/`, today, "monthly", "0.8");
      add(`https://${mainDomain}/guide/payuni-setup/`, today, "monthly", "0.7");

      return new Response(sitemapXml(entries), {
        status: 200,
        headers: {
          "content-type": "application/xml; charset=UTF-8",
          "cache-control": "public, max-age=3600",
        },
      });
    }

    // ── Platform admin ──
    if (url.pathname.startsWith("/api/platform-admin/moderation")) {
      const moderation = await handlePlatformModeration(request, env, env.PLATFORM_ADMIN_PASSWORD || "");
      if (moderation) return moderation;
    }
    if (url.pathname.startsWith("/platform-admin") || url.pathname.startsWith("/api/platform-admin")) {
      return handlePlatformAdmin(request, env.DB, env.PLATFORM_ADMIN_PASSWORD || "", env.ASSETS, env.IMAGES);
    }

    // ── Public API: plan limits (for landing page) ──
    if (url.pathname === "/api/plan-limits") {
      const row = await env.DB
        .prepare("SELECT value FROM app_settings WHERE store_id = 0 AND key = 'plan_limits'")
        .first<{ value: string }>();
      return json({ ok: true, limits: parsePlanProductLimits(row?.value) });
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
    // ── PAYUNi billing（主網域） ──
    if (url.pathname === "/api/billing/checkout") {
      return handleBillingCheckout(request, env);
    }
    if (url.pathname === "/api/billing/upgrade-quotes") {
      return handleBillingUpgradeQuotes(request, env);
    }
    if (url.pathname === "/api/billing/notify") {
      return handleBillingNotify(request, env);
    }
    if (url.pathname === "/api/billing/return") {
      return handleBillingReturn(request, env);
    }
    if (url.pathname === "/api/billing/order-status") {
      return handleBillingOrderStatus(request, env);
    }
    if (url.pathname === "/api/billing/orders") {
      return handleBillingOrders(request, env);
    }

    // ── Store-owned PAYUNi collection（主網域 + 路徑型租戶） ──
    {
      const storePayResp = dispatchStorePayRoute(url.pathname, request, env);
      if (storePayResp) return storePayResp;
    }

    // ── Auth routes (platform-level, not tenant-scoped) ──
    if (url.pathname === "/auth/google") {
      const authEnv = getAuthEnv(env);
      const canonicalRedirect = redirectAuthStartToAppUrl(request, authEnv.APP_URL);
      if (canonicalRedirect) return canonicalRedirect;
      return handleGoogleAuthRedirect(request, authEnv);
    }
    if (url.pathname === "/auth/google/callback") {
      return handleGoogleAuthCallback(request, env.DB, getAuthEnv(env));
    }
    if (url.pathname === "/auth/line") {
      const authEnv = getAuthEnv(env);
      const canonicalRedirect = redirectAuthStartToAppUrl(request, authEnv.APP_URL);
      if (canonicalRedirect) return canonicalRedirect;
      return handleLineAuthRedirect(request, authEnv);
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
      if (isTenantOwnerPath(url.pathname)) {
        const redirectUrl = new URL(request.url);
        redirectUrl.hostname = mainDomain;
        redirectUrl.pathname = `/s/${store.slug}${url.pathname}`;
        return Response.redirect(redirectUrl.toString(), 302);
      }
      if (getEffectivePlan(store) !== "proplus") {
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
      // Store-pay routes are store-scoped via the session cookie (not path), but
      // the tenant admin page calls them with the /s/{slug} basePath prefix.
      // Dispatch them here so /s/{slug}/api/store-pay/* reaches the same handlers.
      const storePayResp = dispatchStorePayRoute(subPath, request, env);
      if (storePayResp) return storePayResp;
      const ctx = buildCtxFromStore(store, env, `/s/${slug}`);
      return routeTenantRequest(request, ctx, subPath, getCrawlEnv(env), env.ASSETS);
    }

    // ── Public store-pay pages (main domain only; no cache — transaction pages) ──
    if (url.pathname === "/pay" || url.pathname === "/pay.html") {
      if (env.ASSETS) {
        const resp = await env.ASSETS.fetch(new Request(new URL("/pay.html", request.url).toString(), { method: "GET", headers: request.headers }));
        if (resp.ok) {
          const out = new Response(resp.body, resp);
          out.headers.set("Cache-Control", "no-store, max-age=0");
          out.headers.set("X-Robots-Tag", "noindex, nofollow");
          return out;
        }
        return resp;
      }
      return json({ ok: false, error: "Not found" }, 404);
    }
    if (url.pathname === "/pay-result" || url.pathname === "/pay-result.html") {
      if (env.ASSETS) {
        const resp = await env.ASSETS.fetch(new Request(new URL("/pay-result.html", request.url).toString(), { method: "GET", headers: request.headers }));
        if (resp.ok) {
          const out = new Response(resp.body, resp);
          out.headers.set("Cache-Control", "no-store, max-age=0");
          out.headers.set("X-Robots-Tag", "noindex, nofollow");
          return out;
        }
        return resp;
      }
      return json({ ok: false, error: "Not found" }, 404);
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
        return withPublicHtmlCache(await env.ASSETS.fetch(request), url.pathname);
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
      // The bootstrap store may be closed, but root-relative /api/images/* URLs
      // are stored for every store and must keep resolving.
      if (url.pathname.startsWith("/api/images/")) {
        const bootstrap = await env.DB
          .prepare("SELECT * FROM stores WHERE slug = 'default' LIMIT 1")
          .first<StoreRow>();
        if (bootstrap) {
          const ctx = buildCtxFromStore(bootstrap, env, "");
          return routeTenantRequest(request, ctx, url.pathname, getCrawlEnv(env), env.ASSETS);
        }
      }
    }

    // ── Static assets ──
    if (env.ASSETS) {
      return withPublicHtmlCache(await env.ASSETS.fetch(request), url.pathname);
    }

    return json({ ok: false, error: "Not Found" }, 404);
   } catch (err) {
    console.error("Unhandled worker error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Internal server error" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
   }
  },
};

// Central response policy also covers redirects, errors, assets and APIs.
export default {
  ...worker,
  async fetch(request: Request, env: Env, execution: ExecutionContext): Promise<Response> {
    const mainDomain = normalizeMainDomain(env.MAIN_DOMAIN);
    const cache = typeof caches !== "undefined" ? caches.default : undefined;
    let response: Response;
    try {
      response = await serveWithEdgeCache(request, mainDomain, cache, execution,
        () => worker.fetch(request, env));
    } catch (error) {
      console.error("Request failed", error);
      response = json({ ok: false, error: "Internal server error" }, 500);
    }
    return withSecurityHeaders(response, request);
  },
};
