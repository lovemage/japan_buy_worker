-- 0026_remittance_report.sql
-- Buyer-reported offline bank remittance (ATM / 網銀轉帳) for requirement_forms.
-- Runs ALONGSIDE the PAYUNi online collection in store_payment_orders; the two are
-- independent settlement paths and a single order should only use one of them.
--
-- Flow: buyer transfers money -> reports the last 5 digits of the source account
-- -> store owner reconciles in the admin order list -> verified flips status to 'paid'.
--
-- remittance_status lifecycle:
--   NULL       never reported
--   reported   buyer submitted, waiting for the store owner to reconcile
--   verified   store owner matched it against the bank statement (order.status -> 'paid')
--   rejected   store owner could not match it; the buyer may report again

ALTER TABLE requirement_forms ADD COLUMN remittance_status TEXT
  CHECK (remittance_status IN ('reported', 'verified', 'rejected') OR remittance_status IS NULL);

-- Last 5 digits of the account the buyer paid FROM. Display/matching aid only, never
-- a full account number, so it is not treated as a secret.
ALTER TABLE requirement_forms ADD COLUMN remittance_last5 TEXT;

-- Buyer-declared amount (TWD) and transfer date. Both are self-reported and are shown
-- to the owner for comparison against the order total; neither is authoritative.
ALTER TABLE requirement_forms ADD COLUMN remittance_amount INTEGER;
ALTER TABLE requirement_forms ADD COLUMN remittance_paid_date TEXT;   -- YYYY-MM-DD
ALTER TABLE requirement_forms ADD COLUMN remittance_note TEXT;

ALTER TABLE requirement_forms ADD COLUMN remittance_reported_at TEXT;
ALTER TABLE requirement_forms ADD COLUMN remittance_verified_at TEXT;

-- Partial index: the admin "待核帳" tab only ever queries rows that have a report.
CREATE INDEX IF NOT EXISTS idx_requirement_forms_remittance
  ON requirement_forms(store_id, remittance_status)
  WHERE remittance_status IS NOT NULL;
