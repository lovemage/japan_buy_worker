-- Ensure one phone number can only be used by one store
CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_phone_number ON stores(phone_number) WHERE phone_number IS NOT NULL;
