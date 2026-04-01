-- Auth providers: Google OAuth, Firebase Phone, Resend Email verification
-- Brand: vovosnap

-- Add auth provider columns to stores (SQLite cannot add UNIQUE via ALTER, use CREATE INDEX instead)
ALTER TABLE stores ADD COLUMN google_id TEXT;
ALTER TABLE stores ADD COLUMN phone_number TEXT;
ALTER TABLE stores ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stores ADD COLUMN phone_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stores ADD COLUMN onboarding_step TEXT NOT NULL DEFAULT 'email_pending';
-- onboarding_step: email_pending | phone_pending | store_setup | complete

CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_google_id ON stores(google_id) WHERE google_id IS NOT NULL;

-- Email verification tokens
CREATE TABLE IF NOT EXISTS email_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_token
  ON email_verifications(token);

-- Update bootstrap store to be fully verified
UPDATE stores SET
  email_verified = 1,
  phone_verified = 1,
  onboarding_step = 'complete'
WHERE id = 1;
