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
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  status_updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_requirement_forms_status
  ON requirement_forms(status);

CREATE TABLE IF NOT EXISTS requirement_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requirement_form_id INTEGER NOT NULL,
  product_id INTEGER,
  product_name_snapshot TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  desired_size TEXT,
  desired_color TEXT,
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
