-- Multi-tenant SaaS migration
-- IMPORTANT: Back up DB before running: wrangler d1 export DB --output=backup-pre-multi-tenant.sql
PRAGMA foreign_keys = OFF;

-- ============================================================
-- 1. Create stores table
-- ============================================================
CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  owner_email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  destination_country TEXT NOT NULL DEFAULT 'jp',
  display_currency TEXT NOT NULL DEFAULT 'TWD',
  line_id TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  plan_expires_at TEXT,
  subdomain TEXT UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 2. Create store_sessions table
-- ============================================================
CREATE TABLE IF NOT EXISTS store_sessions (
  token TEXT PRIMARY KEY,
  store_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_store_sessions_expires
  ON store_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_store_sessions_store_id
  ON store_sessions(store_id);

-- ============================================================
-- 3. Bootstrap store from existing admin password
-- ============================================================
INSERT INTO stores (id, slug, name, owner_email, password_hash, password_salt, plan, is_active)
SELECT
  1,
  'default',
  'Default Store',
  'admin@localhost',
  CASE
    WHEN INSTR(value, ':') > 0 THEN SUBSTR(value, 1, INSTR(value, ':') - 1)
    ELSE value
  END,
  CASE
    WHEN INSTR(value, ':') > 0 THEN SUBSTR(value, INSTR(value, ':') + 1)
    ELSE ''
  END,
  'pro',
  1
FROM app_settings
WHERE key = 'admin_password'
LIMIT 1;

-- If no admin_password exists, insert a placeholder store
INSERT OR IGNORE INTO stores (id, slug, name, owner_email, password_hash, password_salt, plan, is_active)
VALUES (1, 'default', 'Default Store', 'admin@localhost', '', '', 'pro', 1);

-- ============================================================
-- 4. Recreate products with store_id
-- ============================================================
CREATE TABLE products_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL DEFAULT 1,
  source_site TEXT NOT NULL,
  source_product_code TEXT NOT NULL,
  title_ja TEXT NOT NULL,
  title_zh_tw TEXT,
  brand TEXT,
  category TEXT,
  price_jpy_tax_in INTEGER,
  color_count INTEGER,
  image_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_crawled_at TEXT,
  source_payload_json TEXT,
  status_badges_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store_id, source_site, source_product_code),
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

INSERT INTO products_new (id, store_id, source_site, source_product_code, title_ja, title_zh_tw,
  brand, category, price_jpy_tax_in, color_count, image_url, is_active, last_crawled_at,
  source_payload_json, status_badges_json, created_at, updated_at)
SELECT id, 1, source_site, source_product_code, title_ja, title_zh_tw,
  brand, category, price_jpy_tax_in, color_count, image_url, is_active, last_crawled_at,
  source_payload_json, status_badges_json, created_at, updated_at
FROM products;

DROP TABLE products;
ALTER TABLE products_new RENAME TO products;

CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);

-- ============================================================
-- 5. Recreate requirement_forms with store_id
-- ============================================================
CREATE TABLE requirement_forms_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL DEFAULT 1,
  customer_name TEXT NOT NULL,
  contact TEXT NOT NULL,
  member_phone TEXT,
  recipient_city TEXT,
  recipient_address TEXT,
  line_id TEXT,
  shipping_method TEXT,
  shipping_international_jpy INTEGER,
  shipping_domestic_twd INTEGER,
  shipping_total_twd INTEGER,
  requires_ezway INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  order_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  status_updated_by TEXT,
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

INSERT INTO requirement_forms_new (id, store_id, customer_name, contact, member_phone,
  recipient_city, recipient_address, line_id, shipping_method, shipping_international_jpy,
  shipping_domestic_twd, shipping_total_twd, requires_ezway, notes, status, order_code,
  created_at, updated_at, status_updated_by)
SELECT id, 1, customer_name, contact, member_phone,
  recipient_city, recipient_address, line_id, shipping_method, shipping_international_jpy,
  shipping_domestic_twd, shipping_total_twd, requires_ezway, notes, status, order_code,
  created_at, updated_at, status_updated_by
FROM requirement_forms;

DROP TABLE requirement_forms;
ALTER TABLE requirement_forms_new RENAME TO requirement_forms;

CREATE INDEX IF NOT EXISTS idx_requirement_forms_status ON requirement_forms(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_requirement_forms_order_code
  ON requirement_forms(order_code) WHERE order_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_requirement_forms_store_id ON requirement_forms(store_id);

-- ============================================================
-- 6. Recreate requirement_items (FK refresh after requirement_forms recreate)
-- ============================================================
CREATE TABLE requirement_items_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requirement_form_id INTEGER NOT NULL,
  product_id INTEGER,
  product_name_snapshot TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_jpy INTEGER,
  unit_price_twd REAL,
  subtotal_jpy INTEGER,
  subtotal_twd REAL,
  selected_image_url TEXT,
  desired_size TEXT,
  desired_color TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (requirement_form_id) REFERENCES requirement_forms(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

INSERT INTO requirement_items_new (id, requirement_form_id, product_id, product_name_snapshot,
  quantity, unit_price_jpy, unit_price_twd, subtotal_jpy, subtotal_twd, selected_image_url,
  desired_size, desired_color, note, created_at)
SELECT id, requirement_form_id, product_id, product_name_snapshot,
  quantity, unit_price_jpy, unit_price_twd, subtotal_jpy, subtotal_twd, selected_image_url,
  desired_size, desired_color, note, created_at
FROM requirement_items;

DROP TABLE requirement_items;
ALTER TABLE requirement_items_new RENAME TO requirement_items;

CREATE INDEX IF NOT EXISTS idx_requirement_items_form_id
  ON requirement_items(requirement_form_id);

-- ============================================================
-- 7. Recreate admin_orders (FK refresh after requirement_forms recreate)
-- ============================================================
CREATE TABLE admin_orders_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requirement_form_id INTEGER NOT NULL,
  handled_by TEXT NOT NULL,
  external_order_ref TEXT,
  order_note TEXT,
  ordered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (requirement_form_id) REFERENCES requirement_forms(id) ON DELETE CASCADE
);

INSERT INTO admin_orders_new (id, requirement_form_id, handled_by, external_order_ref,
  order_note, ordered_at, created_at, updated_at)
SELECT id, requirement_form_id, handled_by, external_order_ref,
  order_note, ordered_at, created_at, updated_at
FROM admin_orders;

DROP TABLE admin_orders;
ALTER TABLE admin_orders_new RENAME TO admin_orders;

CREATE INDEX IF NOT EXISTS idx_admin_orders_form_id
  ON admin_orders(requirement_form_id);

-- ============================================================
-- 8. Recreate app_settings with composite PK (store_id, key)
-- ============================================================
CREATE TABLE app_settings_new (
  store_id INTEGER NOT NULL DEFAULT 1,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (store_id, key),
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

INSERT INTO app_settings_new (store_id, key, value, updated_at)
SELECT 1, key, value, updated_at FROM app_settings
WHERE key != 'admin_password';

DROP TABLE app_settings;
ALTER TABLE app_settings_new RENAME TO app_settings;

-- ============================================================
-- 9. Migrate sessions and drop old table
-- ============================================================
INSERT OR IGNORE INTO store_sessions (token, store_id, created_at, expires_at)
SELECT token, 1, created_at, expires_at FROM admin_sessions
WHERE expires_at > datetime('now');

DROP TABLE IF EXISTS admin_sessions;

-- Re-enable foreign keys
PRAGMA foreign_keys = ON;
