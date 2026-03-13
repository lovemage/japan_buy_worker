PRAGMA foreign_keys = ON;

ALTER TABLE requirement_forms ADD COLUMN shipping_method TEXT;
ALTER TABLE requirement_forms ADD COLUMN shipping_international_jpy INTEGER;
ALTER TABLE requirement_forms ADD COLUMN shipping_domestic_twd INTEGER;
ALTER TABLE requirement_forms ADD COLUMN shipping_total_twd INTEGER;
ALTER TABLE requirement_forms ADD COLUMN requires_ezway INTEGER NOT NULL DEFAULT 0;
