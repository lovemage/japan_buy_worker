import type { NormalizedProduct } from "./types";
import type { D1DatabaseLike } from "../types/d1";
import { buildProductUpsertPayload } from "./product-records";

export async function upsertProducts(
  db: D1DatabaseLike,
  products: NormalizedProduct[]
): Promise<{ upserted: number }> {
  let upserted = 0;

  for (const item of products) {
    const payload = buildProductUpsertPayload(item);
    const upsert = await db
      .prepare(
        `
INSERT INTO products (
  source_site, source_product_code, title_ja, title_zh_tw, brand, category,
  price_jpy_tax_in, color_count, image_url, is_active, last_crawled_at,
  source_payload_json, status_badges_json, updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
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
  source_payload_json = excluded.source_payload_json,
  status_badges_json = excluded.status_badges_json,
  updated_at = datetime('now')
`
      )
      .bind(...payload.values)
      .run();

    if (!upsert.success) {
      throw new Error(`Failed upsert for ${item.sourceProductCode}`);
    }
    upserted += 1;
  }

  return { upserted };
}
