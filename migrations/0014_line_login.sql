-- LINE Login OAuth provider
-- line_login_id stores the LINE user ID (distinct from line_id which is the store's LINE business ID)
ALTER TABLE stores ADD COLUMN line_login_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_line_login_id ON stores(line_login_id) WHERE line_login_id IS NOT NULL;
