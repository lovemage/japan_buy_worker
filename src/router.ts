// Tenant-scoped route dispatcher
// All routes under /s/{slug}/ or subdomain are handled here

import { isStoreOwnerAuthorized, handleStoreLogout, handleAdminLogin } from "./routes/admin/auth";
import { handleAdminCrawl } from "./routes/admin/crawl";
import { handleAdminRequirements } from "./routes/admin/requirements";
import {
  handlePublicProductBrands,
  handlePublicProductCategories,
  handlePublicProductDetail,
  handlePublicProductRecommendations,
  handlePublicProducts,
} from "./routes/public/products";
import {
  handlePublicRequirementDetail,
  handlePublicRequirementHistory,
  handlePublicRequirements,
} from "./routes/public/requirements";
import { handleAdminPricing, handlePublicPricing, getPricingConfig } from "./routes/pricing";
import {
  handleAdminProducts,
  handleAdminProductToggle,
  handleAdminProductUpdate,
  handleAdminProductDelete,
  handleAdminProductImageDelete,
} from "./routes/admin/products";
import { handleAdminChangePassword } from "./routes/admin/password";
import { handleAdminCategories } from "./routes/admin/categories";
import { handleAdminRecognize } from "./routes/admin/recognize";
import { handleAdminImageEdit } from "./routes/admin/image-edit";
import { handleMarketing, handleMarketingUsage } from "./routes/admin/marketing";
import { handleAdminGeminiSettings, handleAdminAiModel } from "./routes/admin/settings";
import {
  handleAdminClearSyncProducts,
  handleAdminClearManualProducts,
} from "./routes/admin/clear-products";
import {
  handleStoreInfo,
  handleStoreNameUpdate,
  handleStoreSlugUpdate,
  handleDisplaySettings,
  handlePopupAds,
  handlePopupAdUpload,
  handlePopupAdDelete,
  handleTemplate,
  handleBannerSettings,
  handleBannerUpload,
  handleBannerDelete,
  handleBannerGenerate,
  COUNTRY_CONFIG,
} from "./routes/admin/store-info";
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

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Serialise an object to JSON safe for embedding inside <script> tags.
 * Replaces "<" with < so "</script>" can never appear in the output.
 */
function buildJsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

/**
 * Serialise an arbitrary value to a complete JS string literal that is safe to
 * embed inside an inline <script>: JSON.stringify quotes/escapes it, and "<" is
 * neutralised so a "</script>" inside the value can't terminate the tag.
 */
function jsStringLiteral(value: string): string {
  return JSON.stringify(String(value)).replace(/</g, "\\u003c");
}

/**
 * Neutralise "</script>" breakouts in an already-serialised JSON string before
 * it is embedded as a raw JS value inside an inline <script>. In valid JSON "<"
 * only appears inside string values, where < is an equivalent escape.
 */
function safeInlineJson(json: string): string {
  return json.replace(/</g, "\\u003c");
}

/**
 * Server-side mirror of calcAdjustedPrices() in public/assets/app-product.js,
 * returning the retail TWD price shoppers actually see, so structured-data
 * prices never contradict the page (Google penalises price mismatches).
 */
function calcRetailTwd(
  baseJpy: number,
  pricing: { pricingMode: string; markupMode: string; markupPercent: number; markupJpy: number; jpyToTwd: number }
): number | null {
  const base = Number(baseJpy);
  if (!Number.isFinite(base)) return null;
  // Manual mode: the stored base price is already the TWD selling price.
  if (pricing.pricingMode === "manual") return Math.round(base);
  const rate = pricing.jpyToTwd;
  if (pricing.markupMode === "percent") {
    return Math.round(base * rate * (1 + pricing.markupPercent / 100));
  }
  const src = Math.round(base + pricing.markupJpy);
  return Math.round(src * rate);
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
    .prepare("SELECT destination_country, name, description, template FROM stores WHERE id = ?")
    .bind(ctx.storeId)
    .first<{ destination_country: string; name: string; description: string; template: string }>();
  const country = storeRow?.destination_country || "tw";
  const storeName = storeRow?.name || "vovosnap";
  const storeDesc = storeRow?.description || "";
  const template = storeRow?.template || "default";
  const countryConf = COUNTRY_CONFIG[country] || COUNTRY_CONFIG["tw"];
  const canonicalUrl = new URL(request.url);
  canonicalUrl.search = "";
  canonicalUrl.hash = "";
  // Normalise the canonical to match the URLs published in the sitemap so each
  // tenant page declares a single, self-consistent canonical instead of many
  // variants collapsing onto a shared one.
  if (filename === "store.html") {
    // Store root is listed as `${baseUrl}/`; both `/` and `/index.html` land here.
    canonicalUrl.pathname = `${ctx.basePath}/`;
  } else if (filename === "product.html") {
    // Products are listed as `${baseUrl}/product?code=…`. Without the code every
    // product would share one canonical and fail to index; also drop the optional
    // `.html` so `/product` and `/product.html` don't compete as duplicates.
    const code = new URL(request.url).searchParams.get("code") || "";
    canonicalUrl.pathname = `${ctx.basePath}/product`;
    if (code) canonicalUrl.searchParams.set("code", code);
  }
  const canonicalTag = `<link rel="canonical" href="${escapeHtmlAttr(canonicalUrl.toString())}" />`;
  const noIndexPages = new Set(["request.html", "success.html", "order-history.html", "admin.html", "admin-login.html", "pay.html", "pay-result.html"]);
  const robotsTag = noIndexPages.has(filename)
    ? '<meta name="robots" content="noindex, nofollow" />'
    : '<meta name="robots" content="index, follow" />';

  // Replace page title: "原標題" → "商店名稱" or "原標題 — 商店名稱"
  html = html.replace(/<title>([^<]*)<\/title>/, (_, orig) => {
    const trimmed = orig.trim();
    const nameEsc = escapeHtmlAttr(storeName);
    // If original title is generic/default, just use store name
    if (!trimmed || trimmed === "vovosnap 商品列表") return `<title>${nameEsc}</title>`;
    return `<title>${nameEsc} — ${trimmed}</title>`;
  });

  // Fetch display settings for view mode injection
  const displayRow = await ctx.db
    .prepare("SELECT value FROM app_settings WHERE store_id = ? AND key = 'display_settings'")
    .bind(ctx.storeId)
    .first<{ value: string }>();
  const displaySettings = displayRow?.value || '{"viewMode":"2card","promoEnabled":true}';

  // Tutorial state + avatar
  const tutorialRow = await ctx.db
    .prepare("SELECT value FROM app_settings WHERE store_id = ? AND key = 'tutorial_state'")
    .bind(ctx.storeId)
    .first<{ value: string }>();
  const tutorialState = tutorialRow?.value || "null";
  const tutorialAvatarRow = await ctx.db
    .prepare("SELECT value FROM app_settings WHERE store_id = 0 AND key = 'tutorial_avatar'")
    .first<{ value: string }>();
  const tutorialAvatar = tutorialAvatarRow?.value || "";

  // Banner settings
  const bannerRow = await ctx.db
    .prepare("SELECT value FROM app_settings WHERE store_id = ? AND key = 'banner_settings'")
    .bind(ctx.storeId)
    .first<{ value: string }>();
  const bannerSettings = bannerRow?.value || '{"enabled":false,"images":[]}';

  // Inject store context before </head>
  const inject = `<script>
window.__API_BASE=${jsStringLiteral(ctx.basePath)};
window.__STORE_SLUG=${jsStringLiteral(ctx.storeSlug)};
window.__STORE_PLAN=${jsStringLiteral(ctx.storePlan)};
window.__MAX_IMAGES=${{ free: 4, plus: 6, pro: 8, proplus: 8 }[ctx.storePlan] || 3};
window.__STORE_NAME=${jsStringLiteral(storeName)};
window.__STORE_DESC=${jsStringLiteral(storeDesc)};
window.__STORE_COUNTRY=${jsStringLiteral(country)};
window.__MAIN_DOMAIN=${jsStringLiteral(ctx.mainDomain)};
window.__COUNTRY_CONFIG=${safeInlineJson(JSON.stringify(countryConf))};
window.__DISPLAY_SETTINGS=${safeInlineJson(displaySettings)};
window.__TUTORIAL_STATE=${safeInlineJson(tutorialState)};
window.__TUTORIAL_AVATAR=${jsStringLiteral(tutorialAvatar)};
window.__BANNER_SETTINGS=${safeInlineJson(bannerSettings)};
window.apiFetch=function(p,o){return fetch((window.__API_BASE||"")+p,o)};
</script>`;
  html = html.replace("</head>", () => inject + "\n</head>");

  // Inject template data attribute on <body>
  if (template && template !== "default") {
    html = html.replace("<body>", `<body data-template="${escapeHtmlAttr(template)}">`);
  }

  // Inject OG meta tags for storefront pages
  if (filename === "store.html") {
    // Parse banner and display settings for OG tags
    let bannerData: { enabled?: boolean; images?: string[] } = {};
    try { bannerData = JSON.parse(bannerSettings); } catch {}
    let displayData: { storeRules?: string; storeLogo?: string } = {};
    try { displayData = JSON.parse(displaySettings); } catch {}

    // OG description: store description > store rules > sensible zh-Hant default
    const ogDesc = escapeHtmlAttr(storeDesc || displayData.storeRules || `歡迎光臨 ${storeName}，精選日本商品代購服務`);

    // OG image: first hero/banner image if enabled, else member logo, else default logo
    const requestUrl = new URL(request.url);
    const origin = requestUrl.origin;
    let ogImage = `${origin}/assets/images/logo-3.png`;
    if (bannerData.enabled && bannerData.images && bannerData.images.length > 0) {
      ogImage = `${origin}${ctx.basePath}/api/images/${bannerData.images[0]}`;
    } else if (displayData.storeLogo) {
      ogImage = `${origin}${ctx.basePath}/api/images/${displayData.storeLogo}`;
    }

    const ogTags = `<meta name="description" content="${ogDesc}" />
<meta property="og:title" content="${escapeHtmlAttr(storeName)}" />
<meta property="og:description" content="${ogDesc}" />
<meta property="og:image" content="${escapeHtmlAttr(ogImage)}" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtmlAttr(storeName)}" />
<meta name="twitter:description" content="${ogDesc}" />
<meta name="twitter:image" content="${escapeHtmlAttr(ogImage)}" />`;
    html = html.replace("</head>", () => ogTags + "\n</head>");

    // JSON-LD: BreadcrumbList for the store root
    const storeRootUrl = `${origin}${ctx.basePath}/`;
    const storeBreadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: storeName, item: storeRootUrl },
      ],
    };
    const jsonLdStoreBreadcrumb = buildJsonLd(storeBreadcrumb);
    html = html.replace("</head>", () => `<script type="application/ld+json">${jsonLdStoreBreadcrumb}</script>\n</head>`);
  }

  // Inject product-specific OG meta tags so social shares show product image
  if (filename === "product.html") {
    const requestUrl = new URL(request.url);
    const origin = requestUrl.origin;
    const code = requestUrl.searchParams.get("code") || "";
    let ogImage = `${origin}/assets/images/logo-3.png`;
    let ogTitle = storeName;
    let ogDesc = storeDesc || `${storeName} 代購商店 — 商品詳情`;

    // track resolved product data for JSON-LD reuse below
    let jsonLdProductName = "";
    let jsonLdProductImage = "";
    let jsonLdProductDesc = "";
    let jsonLdPriceJpy: number | null = null;

    if (code) {
      const productRow = await ctx.db
        .prepare(
          "SELECT title_zh_tw, title_ja, brand, image_url, source_payload_json, price_jpy_tax_in FROM products WHERE store_id = ? AND is_active = 1 AND source_product_code = ? LIMIT 1"
        )
        .bind(ctx.storeId, code)
        .first<{
          title_zh_tw: string | null;
          title_ja: string | null;
          brand: string | null;
          image_url: string | null;
          source_payload_json: string | null;
          price_jpy_tax_in: number | null;
        }>();

      if (productRow) {
        // Pick first image: gallery[0] from payload, else image_url column
        let firstImage = productRow.image_url || "";
        try {
          const payload = JSON.parse(productRow.source_payload_json || "{}");
          if (Array.isArray(payload.gallery) && payload.gallery.length > 0 && typeof payload.gallery[0] === "string" && payload.gallery[0].trim()) {
            firstImage = payload.gallery[0];
          }
        } catch {}

        if (firstImage) {
          if (firstImage.startsWith("/api/images/")) {
            ogImage = `${origin}${ctx.basePath}${firstImage}`;
          } else if (/^https?:\/\//i.test(firstImage)) {
            ogImage = firstImage;
          }
        }

        const productName = productRow.title_zh_tw || productRow.title_ja || "";
        if (productName) {
          ogTitle = `${productName} — ${storeName}`;
          ogDesc = [productRow.brand, productName].filter(Boolean).join("｜");
        }

        // Capture values for JSON-LD (raw, not HTML-escaped)
        jsonLdProductName = productName || storeName;
        jsonLdProductImage = ogImage;
        jsonLdProductDesc = [productRow.brand, productName].filter(Boolean).join("｜");
        jsonLdPriceJpy = productRow.price_jpy_tax_in != null ? Number(productRow.price_jpy_tax_in) : null;
      }
    }

    const ogTitleEsc = escapeHtmlAttr(ogTitle);
    const ogDescEsc = escapeHtmlAttr(ogDesc);
    const ogImageEsc = escapeHtmlAttr(ogImage);
    const ogTags = `<meta name="description" content="${ogDescEsc}" />
<meta property="og:title" content="${ogTitleEsc}" />
<meta property="og:description" content="${ogDescEsc}" />
<meta property="og:image" content="${ogImageEsc}" />
<meta property="og:type" content="product" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${ogTitleEsc}" />
<meta name="twitter:description" content="${ogDescEsc}" />
<meta name="twitter:image" content="${ogImageEsc}" />`;
    html = html.replace("</head>", () => ogTags + "\n</head>");

    // JSON-LD: Product schema + BreadcrumbList
    const storeRootUrl = `${origin}${ctx.basePath}/`;
    const productPageUrl = canonicalUrl.toString();

    // Product schema — only inject when we have an actual product
    if (jsonLdProductName) {
      const productSchema: Record<string, unknown> = {
        "@context": "https://schema.org",
        "@type": "Product",
        name: jsonLdProductName,
        image: jsonLdProductImage,
      };
      if (jsonLdProductDesc) productSchema.description = jsonLdProductDesc;
      // Offer with the retail TWD price shoppers actually see (server-side mirror
      // of the client price calc), never the wholesale/source cost. Product is
      // queried with is_active = 1, so it is in stock / for sale.
      if (jsonLdPriceJpy != null) {
        const pricing = await getPricingConfig(ctx.db, ctx.storeId);
        const retailTwd = calcRetailTwd(jsonLdPriceJpy, pricing);
        if (retailTwd != null && retailTwd > 0) {
          productSchema.offers = {
            "@type": "Offer",
            price: String(retailTwd),
            priceCurrency: "TWD",
            availability: "https://schema.org/InStock",
            url: productPageUrl,
          };
        }
      }
      const jsonLdProduct = buildJsonLd(productSchema);
      html = html.replace("</head>", () => `<script type="application/ld+json">${jsonLdProduct}</script>\n</head>`);
    }

    // BreadcrumbList: Home → Store → Product
    const breadcrumbItems: Array<Record<string, unknown>> = [
      { "@type": "ListItem", position: 1, name: storeName, item: storeRootUrl },
    ];
    if (jsonLdProductName) {
      // productPageUrl is the normalised canonical, which already carries ?code=.
      breadcrumbItems.push({ "@type": "ListItem", position: 2, name: jsonLdProductName, item: productPageUrl });
    }
    const productBreadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbItems,
    };
    const jsonLdBreadcrumb = buildJsonLd(productBreadcrumb);
    html = html.replace("</head>", () => `<script type="application/ld+json">${jsonLdBreadcrumb}</script>\n</head>`);
  }

  if (!/<link\s+rel=["']canonical["']/i.test(html)) {
    html = html.replace("</head>", () => `${canonicalTag}\n${robotsTag}\n</head>`);
  } else if (!/<meta\s+name=["']robots["']/i.test(html)) {
    html = html.replace("</head>", () => `${robotsTag}\n</head>`);
  }

  // Rewrite internal navigation links to be store-scoped
  if (ctx.basePath) {
    html = html.replace(/href="\/index\.html"/g, `href="${ctx.basePath}/"`);
    html = html.replace(/href="\/store\.html"/g, `href="${ctx.basePath}/"`);
    html = html.replace(/href="\/request\.html"/g, `href="${ctx.basePath}/request.html"`);
    html = html.replace(/href="\/order-history\.html"/g, `href="${ctx.basePath}/order-history.html"`);
    html = html.replace(/href="\/product\.html/g, `href="${ctx.basePath}/product.html`);
    html = html.replace(/href="\/admin-login\.html"/g, `href="${ctx.basePath}/admin-login.html"`);
    html = html.replace(/href="\/admin\.html"/g, `href="${ctx.basePath}/admin"`);
    html = html.replace(/href="\/admin"/g, `href="${ctx.basePath}/admin"`);
    html = html.replace(/href="\/success\.html/g, `href="${ctx.basePath}/success.html`);
  }

  // Public storefront pages are identical for every visitor of a given URL
  // (tenant content is keyed by host/path/query), so let the edge cache them.
  // Auth/transaction pages (admin, login, request, success, order-history)
  // must never be cached.
  const publicCacheable = filename === "store.html" || filename === "product.html";
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "cache-control": publicCacheable
        ? "public, max-age=3600, stale-while-revalidate=86400"
        : "no-cache",
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
    // Bootstrap store (id=1) supports password login for backward compat
    if (ctx.storeId === 1) {
      return handleAdminLogin(request, { DB: ctx.db });
    }
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
  if (subPath === "/api/product-recommendations") return handlePublicProductRecommendations(request, ctx);
  if (subPath === "/api/requirements") return handlePublicRequirements(request, ctx);
  if (subPath === "/api/requirement") return handlePublicRequirementDetail(request, ctx);
  if (subPath === "/api/requirement-history") return handlePublicRequirementHistory(request, ctx);
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
  if (subPath === "/api/admin/ai-model") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleAdminAiModel(request, ctx);
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
  if (subPath === "/api/admin/ai-image-edit") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleAdminImageEdit(request, ctx);
  }
  if (subPath === "/api/admin/ai-marketing") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleMarketing(request, ctx);
  }
  if (subPath === "/api/admin/ai-marketing/usage") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleMarketingUsage(request, ctx);
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
  if (subPath === "/api/admin/products/delete") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleAdminProductDelete(request, ctx);
  }
  if (subPath === "/api/admin/products/image-delete") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleAdminProductImageDelete(request, ctx);
  }
  if (subPath === "/api/admin/store-info") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleStoreInfo(request, ctx);
  }
  if (subPath === "/api/admin/display-settings") {
    // GET is public (store front reads it), POST requires auth
    if (request.method === "POST" && !isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleDisplaySettings(request, ctx);
  }
  if (subPath === "/api/admin/tutorial") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    if (request.method === "GET") {
      const row = await ctx.db.prepare("SELECT value FROM app_settings WHERE store_id = ? AND key = 'tutorial_state'").bind(ctx.storeId).first<{ value: string }>();
      return json({ ok: true, state: row?.value ? JSON.parse(row.value) : null });
    }
    if (request.method === "POST") {
      const body = (await request.json()) as { completed?: boolean; dismissed?: boolean };
      const existing = await ctx.db.prepare("SELECT value FROM app_settings WHERE store_id = ? AND key = 'tutorial_state'").bind(ctx.storeId).first<{ value: string }>();
      const state = existing?.value ? JSON.parse(existing.value) : {};
      if (body.completed !== undefined) state.completed = body.completed;
      if (body.dismissed !== undefined) state.dismissed = body.dismissed;
      state.updatedAt = new Date().toISOString();
      await ctx.db.prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'tutorial_state', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')").bind(ctx.storeId, JSON.stringify(state)).run();
      return json({ ok: true, state });
    }
    return json({ ok: false, error: "Method Not Allowed" }, 405);
  }
  if (subPath === "/api/admin/store-name") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleStoreNameUpdate(request, ctx);
  }
  if (subPath === "/api/admin/store-slug") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleStoreSlugUpdate(request, ctx);
  }
  if (subPath === "/api/admin/template") {
    if (request.method === "POST" && !isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleTemplate(request, ctx);
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
  // Banner routes
  if (subPath === "/api/admin/banner") {
    // GET is public (store front reads it), POST requires auth
    if (request.method === "POST" && !isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleBannerSettings(request, ctx);
  }
  if (subPath === "/api/admin/banner/upload") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleBannerUpload(request, ctx);
  }
  if (subPath === "/api/admin/banner/delete") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleBannerDelete(request, ctx);
  }
  if (subPath === "/api/admin/banner/generate") {
    if (!isOwner) return json({ ok: false, error: "Unauthorized" }, 401);
    return handleBannerGenerate(request, ctx);
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
    return serveTenantHtml(request, ctx, "login.html", assets);
  }
  if (subPath === "/" || subPath === "/index.html") {
    return serveTenantHtml(request, ctx, "store.html", assets);
  }
  if (subPath === "/request.html" || subPath === "/request") {
    return serveTenantHtml(request, ctx, "request.html", assets);
  }
  if (subPath === "/product.html" || subPath === "/product") {
    return serveTenantHtml(request, ctx, "product.html", assets);
  }
  if (subPath === "/success.html" || subPath === "/success") {
    return serveTenantHtml(request, ctx, "success.html", assets);
  }
  if (subPath === "/order-history.html" || subPath === "/order-history") {
    return serveTenantHtml(request, ctx, "order-history.html", assets);
  }
  if (subPath === "/pay-result.html" || subPath === "/pay-result") {
    return serveTenantHtml(request, ctx, "pay-result.html", assets);
  }
  if (subPath === "/pay.html" || subPath === "/pay") {
    return serveTenantHtml(request, ctx, "pay.html", assets);
  }

  // ── Static assets (CSS, JS, images) ──
  if (subPath.startsWith("/assets/")) {
    const assetReq = new Request(new URL(subPath, request.url).toString(), request);
    return assets.fetch(assetReq);
  }

  return json({ ok: false, error: "Not Found" }, 404);
}
