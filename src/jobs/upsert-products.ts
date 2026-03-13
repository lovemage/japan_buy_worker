import type { NormalizedProduct } from "./types";
import type { D1DatabaseLike } from "../types/d1";

export async function upsertProducts(
  db: D1DatabaseLike,
  products: NormalizedProduct[]
): Promise<{ upserted: number }> {
  let upserted = 0;

  for (const item of products) {
    const upsert = await db
      .prepare(
        `
INSERT INTO products (
  source_site, source_product_code, title_ja, title_zh_tw, brand, category,
  price_jpy_tax_in, color_count, image_url, is_active, last_crawled_at, updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
ON CONFLICT(source_site, source_product_code) DO UPDATE SET
  title_ja = excluded.title_ja,
  title_zh_tw = COALESCE(products.title_zh_tw, excluded.title_zh_tw),
  brand = excluded.brand,
  category = excluded.category,
  price_jpy_tax_in = excluded.price_jpy_tax_in,
  color_count = excluded.color_count,
  image_url = excluded.image_url,
  is_active = excluded.is_active,
  last_crawled_at = excluded.last_crawled_at,
  updated_at = datetime('now')
`
      )
      .bind(
        item.sourceSite,
        item.sourceProductCode,
        item.titleJa,
        item.titleZhTw,
        item.brand,
        item.category,
        item.priceJpyTaxIn,
        item.colorCount,
        item.imageUrl,
        item.isActive,
        item.lastCrawledAt
      )
      .run();

    if (!upsert.success) {
      throw new Error(`Failed upsert for ${item.sourceProductCode}`);
    }

    const row = await db
      .prepare(
        "SELECT id FROM products WHERE source_site = ? AND source_product_code = ? LIMIT 1"
      )
      .bind(item.sourceSite, item.sourceProductCode)
      .first<{ id: number }>();

    if (!row?.id) {
      throw new Error(`Failed to load product id for ${item.sourceProductCode}`);
    }

    const snapshot = await db
      .prepare(
        `
INSERT INTO product_snapshots (
  product_id, source_payload_json, price_jpy_tax_in, status_badges_json
) VALUES (?, ?, ?, ?)
`
      )
      .bind(
        row.id,
        item.sourcePayloadJson,
        item.priceJpyTaxIn,
        item.statusBadgesJson
      )
      .run();

    if (!snapshot.success) {
      throw new Error(`Failed snapshot insert for ${item.sourceProductCode}`);
    }
    upserted += 1;
  }

  return { upserted };
}
