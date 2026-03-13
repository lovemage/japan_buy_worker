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

  return new Response(
    JSON.stringify({
      ok: true,
      products: products.map((item) => ({
        id: item.id,
        code: item.source_product_code,
        nameJa: item.title_ja,
        nameZhTw: item.title_zh_tw,
        brand: item.brand,
        category: item.category,
        priceJpyTaxIn: item.price_jpy_tax_in,
        colorCount: item.color_count,
        imageUrl: item.image_url,
        lastCrawledAt: item.last_crawled_at,
      })),
      paging: { limit, offset },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
