-- requirement form extra fields + pricing settings
PRAGMA foreign_keys = ON;

ALTER TABLE requirement_forms ADD COLUMN member_phone TEXT;
ALTER TABLE requirement_forms ADD COLUMN recipient_city TEXT;
ALTER TABLE requirement_forms ADD COLUMN recipient_address TEXT;
ALTER TABLE requirement_forms ADD COLUMN line_id TEXT;

ALTER TABLE requirement_items ADD COLUMN unit_price_jpy INTEGER;
ALTER TABLE requirement_items ADD COLUMN unit_price_twd REAL;
ALTER TABLE requirement_items ADD COLUMN subtotal_jpy INTEGER;
ALTER TABLE requirement_items ADD COLUMN subtotal_twd REAL;

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO app_settings (key, value, updated_at)
VALUES ('markup_jpy', '1000', datetime('now'))
ON CONFLICT(key) DO NOTHING;

INSERT INTO app_settings (key, value, updated_at)
VALUES ('jpy_to_twd', '0.21', datetime('now'))
ON CONFLICT(key) DO NOTHING;

INSERT INTO app_settings (key, value, updated_at)
VALUES ('international_shipping_jpy', '350', datetime('now'))
ON CONFLICT(key) DO NOTHING;

INSERT INTO app_settings (key, value, updated_at)
VALUES ('international_shipping_twd', '350', datetime('now'))
ON CONFLICT(key) DO NOTHING;

INSERT INTO app_settings (key, value, updated_at)
VALUES ('domestic_shipping_twd', '60', datetime('now'))
ON CONFLICT(key) DO NOTHING;
