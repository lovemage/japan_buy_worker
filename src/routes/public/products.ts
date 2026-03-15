import type { D1DatabaseLike } from "../../types/d1";
import { getPricingConfig } from "../pricing";
import { buildProductWhereClause, parseBrandFilters } from "./product-filters";
import { parseStoredProductPayload } from "../../jobs/product-records";

type Env = {
  DB: D1DatabaseLike;
};

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
  last_crawled_at: string | null;
  source_payload_json: string | null;
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
    displayImageUrl: toDisplayImageUrl(item.image_url),
    lastCrawledAt: item.last_crawled_at,
    gallery: payload.gallery,
  };
}

export async function handlePublicProducts(
  request: Request,
  env: Env
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
  const promoMaxTwd = Number(url.searchParams.get("promoMaxTwd") || "");
  const hasCategory = category.length > 0;
  const hasPromoFilter = Number.isFinite(promoMaxTwd) && promoMaxTwd > 0;
  const pricing = await getPricingConfig(env.DB);
  const markup = Number(pricing.markupJpy);
  const rate = Number(pricing.jpyToTwd);
  const promoThreshold = hasPromoFilter ? promoMaxTwd : Number(pricing.promoTagMaxTwd);
  const maxBaseJpy =
    Number.isFinite(markup) &&
    Number.isFinite(rate) &&
    rate > 0 &&
    Number.isFinite(promoThreshold) &&
    promoThreshold >= 0
      ? Math.max(0, Math.floor(promoThreshold / rate - markup))
      : Number.MAX_SAFE_INTEGER;
  const where = buildProductWhereClause({
    category,
    maxBaseJpy: hasPromoFilter ? maxBaseJpy : null,
    brands,
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
  p.last_crawled_at,
  p.source_payload_json
FROM products p
${where.whereSql}
ORDER BY updated_at DESC
LIMIT ? OFFSET ?
`;
  const rows = await env.DB
    .prepare(listSql)
    .bind(...where.params, limit, offset)
    .all<ProductRow>();

  const products = Array.isArray(rows?.results) ? rows.results : [];
  const totalRow = await env.DB
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
  const totalSkuRow = await env.DB
    .prepare(totalSkuSql)
    .bind(...where.params)
    .first<{ total_sku: number }>();
  const totalSku = Number(totalSkuRow?.total_sku || 0);
  const page = Math.floor(offset / Math.max(limit, 1)) + 1;
  const totalPages = Math.max(1, Math.ceil(total / Math.max(limit, 1)));

  return new Response(
    JSON.stringify({
      ok: true,
      products: products.map(mapProduct),
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
  env: Env
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const rows = await env.DB
    .prepare(
      `
SELECT category, COUNT(1) as total
FROM products
WHERE is_active = 1 AND category IS NOT NULL AND category != ''
GROUP BY category
ORDER BY total DESC, category ASC
`
    )
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
  env: Env
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const category = (url.searchParams.get("category") || "").trim();
  const where = buildProductWhereClause({
    category,
    maxBaseJpy: null,
    brands: [],
  });

  const rows = await env.DB
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
  env: Env
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

  const product = await env.DB
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
  source_payload_json
FROM products
WHERE is_active = 1 AND source_product_code = ?
LIMIT 1
`
    )
    .bind(code)
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
  const galleryRaw = storedPayload.gallery;
  const gallery = galleryRaw.length > 0 ? galleryRaw : main ? [main] : [];
  const description =
    storedPayload.description
      ? storedPayload.description
      : "此商品為日本站同步資料。實際尺寸與顏色以需求單備註為準。";
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
        schema,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
