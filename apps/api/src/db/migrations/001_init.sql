CREATE TABLE IF NOT EXISTS source_snapshots (
  source_id TEXT PRIMARY KEY,
  items_json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS source_metrics (
  source_id TEXT PRIMARY KEY,
  total_requests INTEGER NOT NULL DEFAULT 0,
  successful_requests INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  total_duration_ms INTEGER NOT NULL DEFAULT 0,
  durations_json TEXT NOT NULL DEFAULT '[]',
  last_success_at INTEGER,
  last_error_at INTEGER,
  last_error TEXT
);
