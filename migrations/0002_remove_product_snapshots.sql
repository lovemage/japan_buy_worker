-- Originally migrated data from product_snapshots into products columns.
-- Columns (source_payload_json, status_badges_json) now exist in 0001_init.sql.
-- On fresh DBs product_snapshots never exists, so these statements are safe no-ops.

DROP INDEX IF EXISTS idx_product_snapshots_product_id;
DROP TABLE IF EXISTS product_snapshots;
