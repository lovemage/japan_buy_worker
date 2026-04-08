-- Phone verification codes for Every8D SMS
-- Replaces Firebase Phone Auth

CREATE TABLE IF NOT EXISTS phone_verification_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  phone_number TEXT NOT NULL,
  code TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_phone_verification_codes_store_id
  ON phone_verification_codes(store_id);

CREATE INDEX IF NOT EXISTS idx_phone_verification_codes_phone
  ON phone_verification_codes(phone_number);
