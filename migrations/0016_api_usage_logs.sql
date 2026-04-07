-- API usage tracking: one row per store per api_type per month
-- Tracks call count and last call time without polluting app_settings
CREATE TABLE IF NOT EXISTS api_usage_logs (
  store_id   INTEGER NOT NULL,
  api_type   TEXT    NOT NULL,  -- 'recognize' | 'marketing' | 'image_edit'
  month_key  TEXT    NOT NULL,  -- 'YYYY_MM' e.g. '2026_04'
  call_count INTEGER NOT NULL DEFAULT 0,
  last_called_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (store_id, api_type, month_key)
);
