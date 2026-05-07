-- Japan Buy core schema (Cloudflare D1 / SQLite)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  UNIQUE(source_site, source_product_code)
);

CREATE TABLE IF NOT EXISTS requirement_forms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  status_updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_requirement_forms_status
  ON requirement_forms(status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_requirement_forms_order_code
  ON requirement_forms(order_code) WHERE order_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS requirement_items (
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
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (requirement_form_id) REFERENCES requirement_forms(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_requirement_items_form_id
  ON requirement_items(requirement_form_id);

CREATE TABLE IF NOT EXISTS admin_orders (
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

CREATE INDEX IF NOT EXISTS idx_admin_orders_form_id
  ON admin_orders(requirement_form_id);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
