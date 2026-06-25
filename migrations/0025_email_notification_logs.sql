CREATE TABLE IF NOT EXISTS email_notification_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  recipient_email TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(event_type, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_email_notification_logs_store
  ON email_notification_logs(store_id, event_type, created_at DESC);
