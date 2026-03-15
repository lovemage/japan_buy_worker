ALTER TABLE products ADD COLUMN source_payload_json TEXT;
ALTER TABLE products ADD COLUMN status_badges_json TEXT;

UPDATE products
SET source_payload_json = (
  SELECT ps.source_payload_json
  FROM product_snapshots ps
  WHERE ps.product_id = products.id
  ORDER BY ps.captured_at DESC, ps.id DESC
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1
  FROM product_snapshots ps
  WHERE ps.product_id = products.id
);

UPDATE products
SET status_badges_json = (
  SELECT ps.status_badges_json
  FROM product_snapshots ps
  WHERE ps.product_id = products.id
  ORDER BY ps.captured_at DESC, ps.id DESC
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1
  FROM product_snapshots ps
  WHERE ps.product_id = products.id
);

DROP INDEX IF EXISTS idx_product_snapshots_product_id;
DROP TABLE IF EXISTS product_snapshots;
