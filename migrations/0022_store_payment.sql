-- 0022_store_payment.sql
-- Store-owned PAYUNi collection (BYO merchant). Lets pro/proplus stores collect
-- payments from buyers using the store's OWN PAYUNi merchant account. The platform
-- never holds funds (TW e-payment law compliance).
--
-- Authoritative spec: docs/plans/2026-06-13-store-payuni-collection-plan.md (§5 + §15).
-- Active migrations dir is migrations/ (do NOT touch workers/migrations/).
--
-- Security invariants enforced at the schema level:
--   * Merchant secrets (MER_ID / HASH_KEY / HASH_IV) are stored ENCRYPTED only
--     (ciphertext + enc_version keyring pointer). No plaintext, no naked hash.
--   * Outward-facing order identifier is a high-entropy public_token; mer_trade_no
--     is opaque and does NOT encode store_id, and is never a security boundary.
--   * Order status is a strict state machine; terminal states are guarded by CHECK.
--   * Amount/currency/sandbox/enable flags are constrained by CHECK.

-- ============================================================
-- Table A: store_payment_configs  (per-store PAYUNi credentials, encrypted)
-- ============================================================
CREATE TABLE IF NOT EXISTS store_payment_configs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id        INTEGER NOT NULL UNIQUE,
  provider        TEXT    NOT NULL DEFAULT 'payuni',

  -- Encrypted credential blobs produced by src/shared/secret-box.js (AES-GCM,
  -- AAD-bound to store_id|provider|field|enc_version). Never store plaintext.
  mer_id_enc      TEXT,
  hash_key_enc    TEXT,
  hash_iv_enc     TEXT,
  -- Keyring version used to seal the blobs above. Read path picks the matching
  -- STORE_PAY_ENC_KEY_V<n> secret. enc_version migrates forward on key rotation.
  enc_version     INTEGER NOT NULL DEFAULT 1,

  -- Display-only, non-secret. Last 4 of MER_ID for the admin UI; no decryption needed.
  mer_id_last4    TEXT,

  -- Per-store environment flag (independent of the platform's PAYUNI_SANDBOX env).
  is_sandbox      INTEGER NOT NULL DEFAULT 0,

  -- Store owner's INTENT to collect. effective_enabled is computed at request time
  -- as (is_enabled AND plan_ok AND config_valid) — see plan §15.6. is_enabled alone
  -- does NOT authorize checkout.
  is_enabled      INTEGER NOT NULL DEFAULT 0,

  -- "Test connection" outcome. Re-enable requires a fresh successful test after any
  -- credential change (changing keys auto-disables — enforced in the backend).
  last_tested_at  TEXT,
  last_test_status TEXT,            -- 'ok' | 'fail' | NULL

  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,

  CONSTRAINT ck_paycfg_sandbox  CHECK (is_sandbox IN (0, 1)),
  CONSTRAINT ck_paycfg_enabled  CHECK (is_enabled IN (0, 1)),
  CONSTRAINT ck_paycfg_test     CHECK (last_test_status IN ('ok', 'fail') OR last_test_status IS NULL)
);

-- One config row per store (UNIQUE(store_id) above also creates the lookup index).

-- ============================================================
-- Table B: store_payment_orders  (buyer collection orders / payment links)
-- ============================================================
CREATE TABLE IF NOT EXISTS store_payment_orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id        INTEGER NOT NULL,

  -- Outward-facing, non-enumerable identifier (used in /pay?o= and public APIs).
  -- High entropy; the only id a buyer ever sees.
  public_token    TEXT NOT NULL UNIQUE,

  -- Opaque merchant trade number sent to PAYUNi. Does NOT encode store_id and is
  -- NOT a security boundary; store ownership is re-verified after notify signature
  -- verification (decrypted MerTradeNo lookup AND order.store_id === ?s).
  mer_trade_no    TEXT NOT NULL UNIQUE,

  kind            TEXT NOT NULL DEFAULT 'single',   -- reserved: single | deposit | balance

  title           TEXT NOT NULL,                    -- item description shown to buyer
  amount          INTEGER NOT NULL,                 -- canonical positive integer TWD; server-set only
  currency        TEXT NOT NULL DEFAULT 'TWD',

  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | paid | failed | expired | cancelled

  -- Environment snapshot taken at creation. checkout AND notify both compare
  -- order.is_sandbox === config.is_sandbox so switching env can't mix old pendings.
  is_sandbox      INTEGER NOT NULL DEFAULT 0,

  buyer_email     TEXT,                             -- optional UsrMail
  requirement_form_id INTEGER,                      -- optional link to an existing requirement form

  -- Plan / expiry audit (plan §9.1). expires_at is mandatory at creation (enforced
  -- in backend; column stays NOT NULL). No "forever" links.
  expires_at      TEXT NOT NULL,
  created_under_plan TEXT,                          -- effective plan when the link was created
  plan_valid_until_at TEXT,                         -- store plan_expires_at snapshot at creation
  checkout_started_at TEXT,                         -- set when buyer POSTs checkout; gates expiry policy

  -- PAYUNi result + anti-replay fields (compared on notify; see plan §15.1).
  pay_type        TEXT,
  payuni_trade_no TEXT,                             -- PAYUNi TradeNo
  payuni_auth_no  TEXT,                             -- auth code / approval no
  payuni_pay_time TEXT,                             -- PAYUNi reported transaction time

  -- ATM take-number details (PAYUNi may return these on a pending notify).
  atm_bank_code   TEXT,
  atm_account     TEXT,
  atm_expire_at   TEXT,

  -- Redacted allowlist of notify fields only (NOT the full payload, NOT EncryptInfo).
  raw_notify      TEXT,

  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at         TEXT,

  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  FOREIGN KEY (requirement_form_id) REFERENCES requirement_forms(id) ON DELETE SET NULL,

  -- Canonical TWD range per plan §15.4 (1..9999999); shared by create/checkout/notify parsers.
  CONSTRAINT ck_payord_amount   CHECK (amount BETWEEN 1 AND 9999999),
  CONSTRAINT ck_payord_currency CHECK (currency = 'TWD'),
  CONSTRAINT ck_payord_status   CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'cancelled')),
  CONSTRAINT ck_payord_sandbox  CHECK (is_sandbox IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_store_payorders_store  ON store_payment_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_store_payorders_status ON store_payment_orders(status);
CREATE INDEX IF NOT EXISTS idx_store_payorders_expires ON store_payment_orders(expires_at);
-- UNIQUE(public_token) and UNIQUE(mer_trade_no) above create their own lookup indexes.

-- Anti-replay integrity (plan §15.1): a single PAYUNi transaction must never be
-- attached to more than one order. Partial index so multiple NULLs (unpaid orders)
-- remain allowed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_payorders_payuni_trade_no
  ON store_payment_orders(payuni_trade_no)
  WHERE payuni_trade_no IS NOT NULL;
