import type { RequestContext } from "../../context";
import { getPricingConfig } from "../pricing";
import { buildProductWhereClause, parseBrandFilters } from "./product-filters";
import { parseStoredProductPayload } from "../../jobs/product-records";

type ProductRow = {
  id: number;
  source_product_code: string;
  title_ja: string;
  title_zh_tw: string | null;
  brand: string | null;
  category: string | null;
  price_jpy_tax_in: number | null;
  color_count: number | null;
  image_url: string | null;
  is_active: number;
  last_crawled_at: string | null;
  source_payload_json: string | null;
  tags: string | null;
};

type CategoryRow = {
  category: string | null;
  total: number;
};

type BrandRow = {
  brand: string | null;
  total: number;
};

function toDisplayImageUrl(imageUrl: string | null): string | null {
  if (!imageUrl) {
    return null;
  }
  return imageUrl.replace(/_ss(\.\w+)$/i, "_pm$1");
}

function mapProduct(item: ProductRow) {
  const payload = parseStoredProductPayload(item.source_payload_json);

  return {
    id: item.id,
    code: item.source_product_code,
    nameJa: item.title_ja,
    nameZhTw: item.title_zh_tw,
    brand: item.brand,
    category: item.category,
    priceJpyTaxIn: item.price_jpy_tax_in,
    colorCount: item.color_count,
    imageUrl: item.image_url,
    isActive: item.is_active ?? 1,
    displayImageUrl: toDisplayImageUrl(item.image_url),
    lastCrawledAt: item.last_crawled_at,
    gallery: payload.gallery,
    tags: (() => { try { return JSON.parse(item.tags || "[]"); } catch { return []; } })(),
  };
}

export async function handlePublicProducts(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 20), 100);
  const offset = Math.max(Number(url.searchParams.get("offset") || 0), 0);
  const category = (url.searchParams.get("category") || "").trim();
  const brands = parseBrandFilters(url.searchParams.get("brands"));
  const search = (url.searchParams.get("search") || "").trim();
  const includeInactive = url.searchParams.get("includeInactive") === "1";
  const promoMaxTwd = Number(url.searchParams.get("promoMaxTwd") || "");
  const hasCategory = category.length > 0;
  const hasPromoFilter = Number.isFinite(promoMaxTwd) && promoMaxTwd > 0;
  const pricing = await getPricingConfig(ctx.db, ctx.storeId);
  const markup = Number(pricing.markupJpy);
  const markupMode = pricing.markupMode || "flat";
  const markupPercent = Number(pricing.markupPercent);
  const rate = Number(pricing.jpyToTwd);
  const promoThreshold = hasPromoFilter ? promoMaxTwd : Number(pricing.promoTagMaxTwd);
  const maxBaseJpy = (() => {
    if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(promoThreshold) || promoThreshold < 0) {
      return Number.MAX_SAFE_INTEGER;
    }
    if (markupMode === "percent" && Number.isFinite(markupPercent)) {
      // percent mode: twd = base * rate * (1 + pct/100), so base = twd / rate / (1 + pct/100)
      return Math.max(0, Math.floor(promoThreshold / rate / (1 + markupPercent / 100)));
    }
    // flat mode: twd = (base + markup) * rate, so base = twd / rate - markup
    return Number.isFinite(markup)
      ? Math.max(0, Math.floor(promoThreshold / rate - markup))
      : Number.MAX_SAFE_INTEGER;
  })();
  const where = buildProductWhereClause({
    storeId: ctx.storeId,
    category,
    maxBaseJpy: hasPromoFilter ? maxBaseJpy : null,
    brands,
    search,
    includeInactive,
  });

  const listSql = `
SELECT
  p.id,
  p.source_product_code,
  p.title_ja,
  p.title_zh_tw,
  p.brand,
  p.category,
  p.price_jpy_tax_in,
  p.color_count,
  p.image_url,
  p.is_active,
  p.last_crawled_at,
  p.source_payload_json,
  p.tags
FROM products p
${where.whereSql}
ORDER BY updated_at DESC
LIMIT ? OFFSET ?
`;
  const rows = await ctx.db
    .prepare(listSql)
    .bind(...where.params, limit, offset)
    .all<ProductRow>();

  const products = Array.isArray(rows?.results) ? rows.results : [];
  const totalRow = await ctx.db
    .prepare(`SELECT COUNT(1) as total FROM products p ${where.whereSql}`)
    .bind(...where.params)
    .first<{ total: number }>();
  const total = Number(totalRow?.total || 0);
  const totalSkuSql = `
SELECT
  COALESCE(
    SUM(
      CASE
        WHEN json_array_length(json_extract(p.source_payload_json, '$.schema.hasVariant')) > 0
          THEN json_array_length(json_extract(p.source_payload_json, '$.schema.hasVariant'))
        ELSE 1
      END
    ),
    0
  ) as total_sku
FROM products p
${where.whereSql}
`;
  const totalSkuRow = await ctx.db
    .prepare(totalSkuSql)
    .bind(...where.params)
    .first<{ total_sku: number }>();
  const totalSku = Number(totalSkuRow?.total_sku || 0);
  const page = Math.floor(offset / Math.max(limit, 1)) + 1;
  const totalPages = Math.max(1, Math.ceil(total / Math.max(limit, 1)));

  return new Response(
    JSON.stringify({
      ok: true,
      products: products.map((p) => {
        const mapped = mapProduct(p);
        const galLimits: Record<string, number> = { free: 4, starter: 6, pro: 8 };
        const galMax = galLimits[ctx.storePlan] || 3;
        if (mapped.gallery.length > galMax) mapped.gallery = mapped.gallery.slice(0, galMax);
        return mapped;
      }),
      filters: {
        category: hasCategory ? category : "",
        brands,
        promoMaxTwd: hasPromoFilter ? promoMaxTwd : null,
      },
      paging: { limit, offset, page, total, totalPages, totalSku },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

export async function handlePublicProductCategories(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const rows = await ctx.db
    .prepare(
      `
SELECT category, COUNT(1) as total
FROM products
WHERE store_id = ? AND is_active = 1 AND category IS NOT NULL AND category != ''
GROUP BY category
ORDER BY total DESC, category ASC
`
    )
    .bind(ctx.storeId)
    .all<CategoryRow>();
  const categories = Array.isArray(rows?.results)
    ? rows.results
        .filter((row) => typeof row.category === "string" && row.category.trim().length > 0)
        .map((row) => ({ name: String(row.category), total: Number(row.total || 0) }))
    : [];

  return new Response(JSON.stringify({ ok: true, categories }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export async function handlePublicProductBrands(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const category = (url.searchParams.get("category") || "").trim();
  const promoMaxTwd = Number(url.searchParams.get("promoMaxTwd") || "");
  const hasPromoFilter = Number.isFinite(promoMaxTwd) && promoMaxTwd > 0;
  const pricing = await getPricingConfig(ctx.db, ctx.storeId);
  const markup = Number(pricing.markupJpy);
  const markupMode2 = pricing.markupMode || "flat";
  const markupPercent2 = Number(pricing.markupPercent);
  const rate = Number(pricing.jpyToTwd);
  const promoThreshold = hasPromoFilter ? promoMaxTwd : Number(pricing.promoTagMaxTwd);
  const maxBaseJpy = (() => {
    if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(promoThreshold) || promoThreshold < 0) {
      return Number.MAX_SAFE_INTEGER;
    }
    if (markupMode2 === "percent" && Number.isFinite(markupPercent2)) {
      return Math.max(0, Math.floor(promoThreshold / rate / (1 + markupPercent2 / 100)));
    }
    return Number.isFinite(markup)
      ? Math.max(0, Math.floor(promoThreshold / rate - markup))
      : Number.MAX_SAFE_INTEGER;
  })();
  const where = buildProductWhereClause({
    storeId: ctx.storeId,
    category,
    maxBaseJpy: hasPromoFilter ? maxBaseJpy : null,
    brands: [],
  });

  const rows = await ctx.db
    .prepare(
      `
SELECT p.brand, COUNT(1) as total
FROM products p
${where.whereSql} AND p.brand IS NOT NULL AND TRIM(p.brand) != ''
GROUP BY p.brand
ORDER BY total DESC, p.brand ASC
`
    )
    .bind(...where.params)
    .all<BrandRow>();
  const brands = Array.isArray(rows?.results)
    ? rows.results
        .filter((row) => typeof row.brand === "string" && row.brand.trim().length > 0)
        .map((row) => ({ name: String(row.brand), total: Number(row.total || 0) }))
    : [];

  return new Response(JSON.stringify({ ok: true, brands }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export async function handlePublicProductDetail(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const code = (url.searchParams.get("code") || "").trim();
  if (!code) {
    return new Response(JSON.stringify({ ok: false, error: "code is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const product = await ctx.db
    .prepare(
      `
SELECT
  id,
  source_product_code,
  title_ja,
  title_zh_tw,
  brand,
  category,
  price_jpy_tax_in,
  color_count,
  image_url,
  last_crawled_at,
  source_payload_json,
  tags
FROM products
WHERE store_id = ? AND is_active = 1 AND source_product_code = ?
LIMIT 1
`
    )
    .bind(ctx.storeId, code)
    .first<ProductRow>();

  if (!product) {
    return new Response(JSON.stringify({ ok: false, error: "product not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const mapped = mapProduct(product);
  const main = mapped.displayImageUrl || mapped.imageUrl;
  const storedPayload = parseStoredProductPayload(product.source_payload_json);
  const galleryLimits: Record<string, number> = { free: 8, starter: 8, pro: 8 };
  const maxGallery = galleryLimits[ctx.storePlan] || 8;
  const galleryRaw = storedPayload.gallery;
  const galleryFull = galleryRaw.length > 0 ? galleryRaw : main ? [main] : [];
  const gallery = galleryFull.slice(0, maxGallery);
  const description =
    storedPayload.description
      ? storedPayload.description
      : "此商品為日本站同步資料。實際尺寸與顏色以訂單備註為準。";
  const schema = storedPayload.schema;

  return new Response(
    JSON.stringify({
      ok: true,
      product: {
        ...mapped,
        mainImageUrl: main,
        gallery,
        description,
        sizeOptions: storedPayload.sizeOptions,
        colorOptions: storedPayload.colorOptions,
        specifications: {
          code: mapped.code,
          category: mapped.category || "",
          brand: mapped.brand || "",
          colorCount: mapped.colorCount ?? null,
        },
        specs: storedPayload.specs,
        schema,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
