-- Direct checkout opt-in for store-owned PAYUNi collection.
-- Default OFF so existing stores keep the current manual review flow.
ALTER TABLE store_payment_configs
ADD COLUMN direct_checkout_enabled INTEGER NOT NULL DEFAULT 0 CHECK (direct_checkout_enabled IN (0, 1));
