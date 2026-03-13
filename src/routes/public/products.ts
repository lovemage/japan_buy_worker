import type { D1DatabaseLike } from "../../types/d1";

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
};

function toDisplayImageUrl(imageUrl: string | null): string | null {
  if (!imageUrl) {
    return null;
  }
  return imageUrl.replace(/_ss(\.\w+)$/i, "_pm$1");
}

function mapProduct(item: ProductRow) {
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

  const rows = await env.DB
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
  last_crawled_at
FROM products
WHERE is_active = 1
ORDER BY updated_at DESC
LIMIT ? OFFSET ?
`
    )
    .bind(limit, offset)
    .all<ProductRow>();

  const products = Array.isArray(rows?.results) ? rows.results : [];
  const totalRow = await env.DB
    .prepare("SELECT COUNT(1) as total FROM products WHERE is_active = 1")
    .first<{ total: number }>();
  const total = Number(totalRow?.total || 0);
  const page = Math.floor(offset / Math.max(limit, 1)) + 1;
  const totalPages = Math.max(1, Math.ceil(total / Math.max(limit, 1)));

  return new Response(
    JSON.stringify({
      ok: true,
      products: products.map(mapProduct),
      paging: { limit, offset, page, total, totalPages },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
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
  last_crawled_at
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
  const latestSnapshot = await env.DB
    .prepare(
      `
SELECT source_payload_json
FROM product_snapshots
WHERE product_id = ?
ORDER BY captured_at DESC, id DESC
LIMIT 1
`
    )
    .bind(product.id)
    .first<{ source_payload_json: string }>();

  let snapshotPayload: Record<string, unknown> = {};
  try {
    snapshotPayload = latestSnapshot?.source_payload_json
      ? (JSON.parse(latestSnapshot.source_payload_json) as Record<string, unknown>)
      : {};
  } catch {
    snapshotPayload = {};
  }

  const sizeOptions = Array.isArray(snapshotPayload.sizeOptions)
    ? snapshotPayload.sizeOptions.filter((x): x is string => typeof x === "string")
    : [];
  const colorOptions = Array.isArray(snapshotPayload.colorOptions)
    ? snapshotPayload.colorOptions.filter((x): x is string => typeof x === "string")
    : [];
  const galleryRaw = Array.isArray(snapshotPayload.gallery)
    ? snapshotPayload.gallery.filter((x): x is string => typeof x === "string")
    : [];
  const gallery = galleryRaw.length > 0 ? galleryRaw : main ? [main] : [];
  const description =
    typeof snapshotPayload.description === "string"
      ? snapshotPayload.description
      : "此商品為日本站同步資料。實際尺寸與顏色以需求單備註為準。";
  const schema =
    snapshotPayload.schema && typeof snapshotPayload.schema === "object"
      ? (snapshotPayload.schema as Record<string, unknown>)
      : null;

  return new Response(
    JSON.stringify({
      ok: true,
      product: {
        ...mapped,
        mainImageUrl: main,
        gallery,
        description,
        sizeOptions,
        colorOptions,
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
