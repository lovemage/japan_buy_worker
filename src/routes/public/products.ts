import type { RequestContext } from "../../context";
import { buildProductWhereClause, parseBrandFilters } from "./product-filters";
import { parseStoredProductPayload } from "../../jobs/product-records";
import { buildVisibleProductLimitClause, getPlanProductLimit } from "../../shared/product-limits.js";
import { parseCookieHeader, STORE_COOKIE_NAME } from "../admin/auth";

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

type ProductSort = "latest" | "price_desc" | "price_asc";

function normalizeProductSort(raw: string | null): ProductSort {
  return raw === "price_desc" || raw === "price_asc" ? raw : "latest";
}

function getProductOrderBy(sort: ProductSort): string {
  if (sort === "price_desc") {
    return "ORDER BY p.is_active DESC, p.price_jpy_tax_in IS NULL ASC, p.price_jpy_tax_in DESC, p.created_at DESC, p.id DESC";
  }
  if (sort === "price_asc") {
    return "ORDER BY p.is_active DESC, p.price_jpy_tax_in IS NULL ASC, p.price_jpy_tax_in ASC, p.created_at DESC, p.id DESC";
  }
  return "ORDER BY p.is_active DESC, p.created_at DESC, p.id DESC";
}

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
    variants: payload.variants,
    tags: (() => { try { return JSON.parse(item.tags || "[]"); } catch { return []; } })(),
  };
}

async function isStoreOwnerRequest(request: Request, ctx: RequestContext): Promise<boolean> {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const token = cookies[STORE_COOKIE_NAME];
  if (!token) return false;
  const session = await ctx.db
    .prepare("SELECT store_id FROM store_sessions WHERE token = ? AND expires_at > datetime('now')")
    .bind(token)
    .first<{ store_id: number }>();
  return Number(session?.store_id) === ctx.storeId;
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
  const ownerRequest = await isStoreOwnerRequest(request, ctx);
  const includeInactive = ownerRequest && url.searchParams.get("includeInactive") === "1";
  const onlyInactive = ownerRequest && url.searchParams.get("onlyInactive") === "1";
  const sort = normalizeProductSort(url.searchParams.get("sort"));
  const hasCategory = category.length > 0;
  const where = buildProductWhereClause({
    storeId: ctx.storeId,
    category,
    maxBaseJpy: null,
    brands,
    search,
    includeInactive,
    onlyInactive,
  });
  const publicVisibilityLimit = ownerRequest || includeInactive || onlyInactive
    ? null
    : await getPlanProductLimit(ctx.db, ctx.storePlan);
  const visible = buildVisibleProductLimitClause({
    storeId: ctx.storeId,
    limit: publicVisibilityLimit,
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
${where.whereSql}${visible.sql}
${getProductOrderBy(sort)}
LIMIT ? OFFSET ?
`;
  const rows = await ctx.db
    .prepare(listSql)
    .bind(...where.params, ...visible.params, limit, offset)
    .all<ProductRow>();

  const products = Array.isArray(rows?.results) ? rows.results : [];
  const totalRow = await ctx.db
    .prepare(`SELECT COUNT(1) as total FROM products p ${where.whereSql}${visible.sql}`)
    .bind(...where.params, ...visible.params)
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
${where.whereSql}${visible.sql}
`;
  const totalSkuRow = await ctx.db
    .prepare(totalSkuSql)
    .bind(...where.params, ...visible.params)
    .first<{ total_sku: number }>();
  const totalSku = Number(totalSkuRow?.total_sku || 0);
  const page = Math.floor(offset / Math.max(limit, 1)) + 1;
  const totalPages = Math.max(1, Math.ceil(total / Math.max(limit, 1)));

  return new Response(
    JSON.stringify({
      ok: true,
      products: products.map((p) => {
        const mapped = mapProduct(p);
        const galLimits: Record<string, number> = { free: 4, plus: 6, pro: 8, proplus: 8 };
        const galMax = galLimits[ctx.storePlan] || 3;
        if (mapped.gallery.length > galMax) mapped.gallery = mapped.gallery.slice(0, galMax);
        return mapped;
      }),
      filters: {
        category: hasCategory ? category : "",
        brands,
        sort,
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

  const ownerRequest = await isStoreOwnerRequest(request, ctx);
  const limit = ownerRequest ? null : await getPlanProductLimit(ctx.db, ctx.storePlan);
  const visible = buildVisibleProductLimitClause({ storeId: ctx.storeId, limit });
  const rows = await ctx.db
    .prepare(
      `
SELECT category, COUNT(1) as total
FROM products p
WHERE p.store_id = ? AND p.is_active = 1 AND p.category IS NOT NULL AND p.category != ''${visible.sql}
GROUP BY category
ORDER BY total DESC, category ASC
`
    )
    .bind(ctx.storeId, ...visible.params)
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
  const where = buildProductWhereClause({
    storeId: ctx.storeId,
    category,
    maxBaseJpy: null,
    brands: [],
  });
  const ownerRequest = await isStoreOwnerRequest(request, ctx);
  const limit = ownerRequest ? null : await getPlanProductLimit(ctx.db, ctx.storePlan);
  const visible = buildVisibleProductLimitClause({ storeId: ctx.storeId, limit });

  const rows = await ctx.db
    .prepare(
      `
SELECT p.brand, COUNT(1) as total
FROM products p
${where.whereSql}${visible.sql} AND p.brand IS NOT NULL AND TRIM(p.brand) != ''
GROUP BY p.brand
ORDER BY total DESC, p.brand ASC
`
    )
    .bind(...where.params, ...visible.params)
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

export async function handlePublicProductRecommendations(
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
  const excludeCode = (url.searchParams.get("excludeCode") || "").trim();
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || 6), 12));

  const SELECT = `SELECT id, source_product_code, title_ja, title_zh_tw, brand, category, price_jpy_tax_in, color_count, image_url, is_active, last_crawled_at, source_payload_json, tags FROM products`;
  const ownerRequest = await isStoreOwnerRequest(request, ctx);
  const visibleLimit = ownerRequest ? null : await getPlanProductLimit(ctx.db, ctx.storePlan);
  const visible = buildVisibleProductLimitClause({ storeId: ctx.storeId, limit: visibleLimit });

  const collected: ProductRow[] = [];
  const seenIds = new Set<number>();

  // 1) Same category first
  if (category) {
    const result = await ctx.db
      .prepare(
        `${SELECT} p WHERE store_id = ? AND is_active = 1 AND category = ? AND source_product_code != ?${visible.sql} ORDER BY RANDOM() LIMIT ?`
      )
      .bind(ctx.storeId, category, excludeCode, ...visible.params, limit)
      .all<ProductRow>();
    for (const row of result.results || []) {
      if (!seenIds.has(row.id)) {
        seenIds.add(row.id);
        collected.push(row);
      }
    }
  }

  // 2) Fall back to random across the whole store
  if (collected.length < limit) {
    const remaining = limit - collected.length;
    const excludeIds = Array.from(seenIds).filter((id) => Number.isInteger(id));
    const idClause = excludeIds.length > 0 ? `AND id NOT IN (${excludeIds.join(",")})` : "";
    const result = await ctx.db
      .prepare(
        `${SELECT} p WHERE store_id = ? AND is_active = 1 AND source_product_code != ? ${idClause}${visible.sql} ORDER BY RANDOM() LIMIT ?`
      )
      .bind(ctx.storeId, excludeCode, ...visible.params, remaining)
      .all<ProductRow>();
    for (const row of result.results || []) {
      if (!seenIds.has(row.id)) {
        seenIds.add(row.id);
        collected.push(row);
      }
    }
  }

  const products = collected.map(mapProduct);

  return new Response(JSON.stringify({ ok: true, products }), {
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

  const ownerRequest = await isStoreOwnerRequest(request, ctx);
  const publicVisibilityLimit = ownerRequest ? null : await getPlanProductLimit(ctx.db, ctx.storePlan);
  const visible = buildVisibleProductLimitClause({
    storeId: ctx.storeId,
    limit: publicVisibilityLimit,
  });
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
FROM products p
WHERE store_id = ? AND is_active = 1 AND source_product_code = ?${visible.sql}
LIMIT 1
`
    )
    .bind(ctx.storeId, code, ...visible.params)
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
  const galleryLimits: Record<string, number> = { free: 8, plus: 8, pro: 8, proplus: 8 };
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
        variants: storedPayload.variants,
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
