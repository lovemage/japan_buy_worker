-- Product compliance moderation: weekly AI scan, seller notice with a 7-day
-- window, platform takedown, appeal and a permanent action log.
--
-- products.moderation_status:
--   'none'    — no open concern
--   'flagged' — seller has been notified, product stays on sale during the window
--   'removed' — taken down by the platform; the seller cannot relist it
ALTER TABLE products ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'none';
-- Content fingerprint of the last scan, so unchanged products are not re-sent to the AI.
ALTER TABLE products ADD COLUMN moderation_scanned_hash TEXT;
ALTER TABLE products ADD COLUMN moderation_scanned_at TEXT;
-- Fingerprint the platform cleared (dismiss/restore); identical content is not flagged again.
ALTER TABLE products ADD COLUMN moderation_cleared_hash TEXT;

CREATE TABLE IF NOT EXISTS moderation_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'ai_scan',          -- ai_scan | keyword_scan
  risk_level TEXT NOT NULL,                        -- suspected | violation | high_risk
  rule_code TEXT NOT NULL,
  reason TEXT,
  -- open | responded | removed | appealed | dismissed | seller_removed | restored
  status TEXT NOT NULL DEFAULT 'open',
  seller_deadline_at TEXT,
  seller_response TEXT,
  seller_responded_at TEXT,
  admin_note TEXT,
  -- Product title/category/description/images as they were when flagged (evidence).
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_moderation_cases_status ON moderation_cases(status, created_at);
CREATE INDEX IF NOT EXISTS idx_moderation_cases_store ON moderation_cases(store_id, status);
-- At most one unresolved case per product.
CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_cases_product_active
  ON moderation_cases(product_id)
  WHERE status IN ('open', 'responded', 'removed', 'appealed');

CREATE TABLE IF NOT EXISTS moderation_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL,
  store_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  actor TEXT NOT NULL,       -- system | platform_admin | seller
  action TEXT NOT NULL,      -- flagged | notified | seller_response | seller_removed | appeal | dismissed | removed | restored | note | notify_failed
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_moderation_actions_case ON moderation_actions(case_id, created_at);
