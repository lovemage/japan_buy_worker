// Tenant-scoped route dispatcher
// All routes under /s/{slug}/ or subdomain are handled here

import { isStoreOwnerAuthorized, handleStoreLogout } from "./routes/admin/auth";
import { handleAdminCrawl } from "./routes/admin/crawl";
import { handleAdminRequirements } from "./routes/admin/requirements";
import {
  handlePublicProductBrands,
  handlePublicProductCategories,
  handlePublicProductDetail,
  handlePublicProducts,
} from "./routes/public/products";
import {
  handlePublicRequirementDetail,
  handlePublicRequirements,
} from "./routes/public/requirements";
import { handleAdminPricing, handlePublicPricing } from "./routes/pricing";
import {
  handleAdminProducts,
  handleAdminProductToggle,
  handleAdminProductUpdate,
  handleAdminProductImageDelete,
} from "./routes/admin/products";
import { handleAdminChangePassword } from "./routes/admin/password";
import { handleAdminCategories } from "./routes/admin/categories";
import { handleAdminRecognize } from "./routes/admin/recognize";
import { handleAdminGeminiSettings } from "./routes/admin/settings";
import {
  handleAdminClearSyncProducts,
  handleAdminClearManualProducts,
} from "./routes/admin/clear-products";
import { handleStoreInfo, handleStoreNameUpdate, handlePopupAds, handlePopupAdUpload, handlePopupAdDelete, COUNTRY_CONFIG } from "./routes/admin/store-info";
import type { RequestContext } from "./context";

type CrawlEnv = {
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_API_TOKEN: string;
  CRAWL_LIST_PAGES?: string;
  CRAWL_MAX_PAGES?: string;
  CRAWL_TIMEOUT_MS?: string;
};

type AssetsBinding = {
  fetch: (request: Request) => Promise<Response>;
};

function json(payload: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

// Serve tenant HTML pages with __API_BASE and __STORE_SLUG injection
async function serveTenantHtml(
  request: Request,
  ctx: RequestContext,
  filename: string,
  assets: AssetsBinding
): Promise<Response> {
  const assetUrl = new URL(`/${filename}`, request.url);
  const assetReq = new Request(assetUrl.toString(), {
    method: "GET",
    headers: request.headers,
  });

  const resp = await assets.fetch(assetReq);
  if (!resp.ok) return resp;

  let html = await resp.text();

  // Fetch store info for context injection
  const storeRow = await ctx.db
    .prepare("SELECT destination_country, name FROM stores WHERE id = ?")
    .bind(ctx.storeId)
    .first<{ destination_country: string; name: string }>();
  const country = storeRow?.destination_country || "jp";
  const storeName = storeRow?.name || "vovosnap";
  const countryConf = COUNTRY_CONFIG[country] || COUNTRY_CONFIG["jp"];

  // Replace page title: "原標題" → "商店名稱" or "原標題 — 商店名稱"
  html = html.replace(/<title>([^<]*)<\/title>/, (_, orig) => {
    const trimmed = orig.trim();
    // If original title is generic/default, just use store name
    if (!trimmed || trimmed === "vovosnap 商品列表") return `<title>${storeName}</title>`;
    return `<title>${storeName} — ${trimmed}</title>`;
  });

  // Inject store context before </head>
  const inject = `<script>
window.__API_BASE="${ctx.basePath}";
window.__STORE_SLUG="${ctx.storeSlug}";
window.__STORE_PLAN="${ctx.storePlan}";
window.__STORE_NAME="${storeName.replace(/"/g, '\\"')}";
window.__STORE_COUNTRY="${country}";
window.__COUNTRY_CONFIG=${JSON.stringify(countryConf)};
window.apiFetch=function(p,o){return fetch((window.__API_BASE||"")+p,o)};
</script>`;
  html = html.replace("</head>", inject + "\n</head>");

  // Rewrite internal navigation links to be store-scoped
  if (ctx.basePath) {
    html = html.replace(/href="\/index\.html"/g, `href="${ctx.basePath}/"`);
    html = html.replace(/href="\/store\.html"/g, `href="${ctx.basePath}/"`);
    html = html.replace(/href="\/request\.html"/g, `href="${ctx.basePath}/request.html"`);
    html = html.replace(/href="\/product\.html/g, `href="${ctx.basePath}/product.html`);
    html = html.replace(/href="\/admin-login\.html"/g, `href="${ctx.basePath}/admin-login.html"`);
    html = html.replace(/href="\/admin\.html"/g, `href="${ctx.basePath}/admin"`);
    html = html.replace(/href="\/admin"/g, `href="${ctx.basePath}/admin"`);
    html = html.replace(/href="\/success\.html/g, `href="${ctx.basePath}/success.html`);
  }

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "no-cache",
    },
  });
}

export async function routeTenantRequest(
  request: Request,
  ctx: RequestContext,
  subPath: string,
  crawlEnv: CrawlEnv,
  assets?: AssetsBinding
): Promise<Response> {
  // ── Auth routes ──
  if (subPath === "/api/admin/login") {
    // For Google OAuth stores, login goes through /auth/google
    // This endpoint is kept for bootstrap store backward compat
    return json({ ok: false, error: "Use Google login at /auth/google" }, 400);
  }
  if (subPath === "/api/admin/logout") {
    return handleStoreLogout(request, ctx);
  }

  // ── Public API routes (no auth) ──
  if (subPath === "/api/products") return handlePublicProducts(request, ctx);
  if (subPath === "/api/product-categories") return handlePublicProductCategories(request, ctx);
  if (subPath === "/api/product-brands") return handlePublicProductBrands(request, ctx);
  if (subPath === "/api/product") return handlePublicProductDetail(request, ctx);
  if (subPath === "/api/requirements") return handlePublicRequirements(request, ctx);
  if (subPath === "/api/requirement") return handlePublicRequirementDetail(request, ctx);
  if (subPath === "/api/pricing") return handlePublicPricing(request, ctx);

  // ── R2 image proxy ──
  if (subPath.startsWith("/api/images/")) {
    const key = subPath.slice("/api/images/".length);
    if (!ctx.r2) return json({ ok: false, error: "R2 not configured" }, 500);
    const object = await ctx.r2.get(key);
    if (!object) return new Response("Not Found", { status: 404 });
    return new Response(object.body, {
      headers: {
        "content-type": object.httpMetadata?.contentType || "image/webp",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  }

  // ── Admin routes (auth required) ──
  const isOwner = await isStoreOwnerAuthorized(request, ctx);

  if (subPath === "/admin/crawl") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleAdminCrawl(request, ctx, crawlEnv);
  }
  if (subPath === "/api/admin/requirements") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleAdminRequirements(request, ctx);
  }
  if (subPath === "/api/admin/pricing") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleAdminPricing(request, ctx);
  }
  if (subPath === "/api/admin/settings/gemini") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleAdminGeminiSettings(request, ctx);
  }
  if (subPath === "/api/admin/change-password") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleAdminChangePassword(request, ctx);
  }
  if (subPath === "/api/admin/categories") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleAdminCategories(request, ctx);
  }
  if (subPath === "/api/admin/recognize") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleAdminRecognize(request, ctx);
  }
  if (subPath === "/api/admin/products") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleAdminProducts(request, ctx);
  }
  if (subPath === "/api/admin/products/toggle") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleAdminProductToggle(request, ctx);
  }
  if (subPath === "/api/admin/products/update") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleAdminProductUpdate(request, ctx);
  }
  if (subPath === "/api/admin/products/image-delete") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleAdminProductImageDelete(request, ctx);
  }
  if (subPath === "/api/admin/store-info") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleStoreInfo(request, ctx);
  }
  if (subPath === "/api/admin/store-name") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleStoreNameUpdate(request, ctx);
  }
  if (subPath === "/api/admin/popup-ads") {
    // GET is public (store front needs to read ads), POST requires auth
    if (request.method === "POST" && !isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handlePopupAds(request, ctx);
  }
  if (subPath === "/api/admin/popup-ads/upload") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handlePopupAdUpload(request, ctx);
  }
  if (subPath === "/api/admin/popup-ads/delete") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handlePopupAdDelete(request, ctx);
  }
  if (subPath === "/api/admin/clear-sync-products") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleAdminClearSyncProducts(request, ctx);
  }
  if (subPath === "/api/admin/clear-manual-products") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleAdminClearManualProducts(request, ctx);
  }

  // ── HTML pages (serve with store context injection) ──
  if (!assets) return json({ ok: false, error: "No assets configured" }, 500);

  if (subPath === "/admin" || subPath === "/admin.html") {
    if (!isOwner) {
      // Redirect to Google login
      const loginUrl = new URL("/auth/google", request.url);
      return Response.redirect(loginUrl.toString(), 302);
    }
    return serveTenantHtml(request, ctx, "admin.html", assets);
  }
  if (subPath === "/admin-login.html") {
    return serveTenantHtml(request, ctx, "admin-login.html", assets);
  }
  if (subPath === "/" || subPath === "/index.html" || subPath === "/store.html") {
    return serveTenantHtml(request, ctx, "store.html", assets);
  }
  if (subPath === "/request.html") {
    return serveTenantHtml(request, ctx, "request.html", assets);
  }
  if (subPath === "/product.html") {
    return serveTenantHtml(request, ctx, "product.html", assets);
  }
  if (subPath === "/success.html") {
    return serveTenantHtml(request, ctx, "success.html", assets);
  }

  // ── Static assets (CSS, JS, images) ──
  if (subPath.startsWith("/assets/")) {
    const assetReq = new Request(new URL(subPath, request.url).toString(), request);
    return assets.fetch(assetReq);
  }

  return json({ ok: false, error: "Not Found" }, 404);
}
