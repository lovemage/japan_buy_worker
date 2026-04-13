-- Add plan_paid_amount and plan_started_at for upgrade proration calculation
ALTER TABLE stores ADD COLUMN plan_paid_amount INTEGER;
ALTER TABLE stores ADD COLUMN plan_started_at TEXT;
