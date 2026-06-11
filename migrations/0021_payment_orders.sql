-- Payment orders for PAYUNi subscription billing
CREATE TABLE payment_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  mer_trade_no TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL,
  months INTEGER NOT NULL,
  days INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  pay_type TEXT,
  payuni_trade_no TEXT,
  atm_bank_code TEXT,
  atm_account TEXT,
  atm_expire_at TEXT,
  raw_notify TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT
);
CREATE INDEX idx_payment_orders_store ON payment_orders(store_id);
