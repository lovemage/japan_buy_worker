import type { NormalizedProduct } from "./types";
import type { D1DatabaseLike } from "../types/d1";
import { buildProductUpsertPayload } from "./product-records";

export async function upsertProducts(
  db: D1DatabaseLike,
  products: NormalizedProduct[],
  storeId: number,
  maxProducts: number | null = null
): Promise<{ upserted: number; skippedByLimit: number }> {
  let upserted = 0;
  let skippedByLimit = 0;
  let currentCount = 0;
  const existingProductKeys = new Set<string>();

  const toProductKey = (sourceSite: string, code: string) => `${sourceSite}::${code}`;

  if (maxProducts && maxProducts > 0) {
    const countRow = await db
      .prepare("SELECT COUNT(1) as c FROM products WHERE store_id = ? AND is_active = 1")
      .bind(storeId)
      .first<{ c: number }>();
    currentCount = Number(countRow?.c || 0);

    const rows = await db
      .prepare("SELECT source_site, source_product_code FROM products WHERE store_id = ?")
      .bind(storeId)
      .all<{ source_site: string; source_product_code: string }>();
    for (const row of rows.results || []) {
      if (row?.source_site && row?.source_product_code) {
        existingProductKeys.add(toProductKey(row.source_site, row.source_product_code));
      }
    }
  }

  for (const item of products) {
    if (maxProducts && maxProducts > 0) {
      const key = toProductKey(item.sourceSite, item.sourceProductCode);
      const exists = existingProductKeys.has(key);
      if (!exists && currentCount >= maxProducts) {
        skippedByLimit += 1;
        continue;
      }
      if (!exists) {
        existingProductKeys.add(key);
        currentCount += 1;
      }
    }

    const payload = buildProductUpsertPayload(item);
    const upsert = await db
      .prepare(
        `
INSERT INTO products (
  store_id, source_site, source_product_code, title_ja, title_zh_tw, brand, category,
  price_jpy_tax_in, color_count, image_url, is_active, last_crawled_at,
  source_payload_json, status_badges_json, updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
ON CONFLICT(store_id, source_site, source_product_code) DO UPDATE SET
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
      .bind(storeId, ...payload.values)
      .run();

    if (!upsert.success) {
      throw new Error(`Failed upsert for ${item.sourceProductCode}`);
    }
    upserted += 1;
  }

  return { upserted, skippedByLimit };
}
