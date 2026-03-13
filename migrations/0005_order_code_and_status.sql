-- Add human-readable order code (DDMM + 4 random digits) and expand status options
ALTER TABLE requirement_forms ADD COLUMN order_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_requirement_forms_order_code
  ON requirement_forms(order_code) WHERE order_code IS NOT NULL;
