CREATE TABLE IF NOT EXISTS source_refresh_leases (
  source_id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS source_fetch_backoff (
  source_id TEXT PRIMARY KEY,
  retry_after_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS worker_slots (
  slot_key TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  owner TEXT,
  lease_until INTEGER,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  total_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS worker_slot_sources (
  slot_key TEXT NOT NULL,
  source_id TEXT NOT NULL,
  status TEXT NOT NULL,
  PRIMARY KEY (slot_key, source_id)
);

CREATE TABLE IF NOT EXISTS worker_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  heartbeat_at INTEGER NOT NULL,
  next_slot_key TEXT
);

CREATE TABLE IF NOT EXISTS fetch_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  slot_key TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  status TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT
);

CREATE INDEX IF NOT EXISTS fetch_logs_started_idx ON fetch_logs(started_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS fetch_logs_source_started_idx ON fetch_logs(source_id, started_at DESC, id DESC);
