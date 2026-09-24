import { createHash } from "node:crypto";

export function createCacheService(db) {
  const select = db.prepare("SELECT * FROM source_snapshots WHERE source_id = ?");
  const upsert = db.prepare(`
    INSERT INTO source_snapshots (source_id, items_json, fetched_at, expires_at, content_hash, last_error)
    VALUES (@sourceId, @itemsJson, @fetchedAt, @expiresAt, @contentHash, NULL)
    ON CONFLICT(source_id) DO UPDATE SET items_json=excluded.items_json, fetched_at=excluded.fetched_at,
      expires_at=excluded.expires_at, content_hash=excluded.content_hash, last_error=NULL
  `);
  const setError = db.prepare("UPDATE source_snapshots SET last_error = ? WHERE source_id = ?");

  function deserialize(row) {
    if (!row) return null;
    try {
      return { sourceId: row.source_id, items: JSON.parse(row.items_json), fetchedAt: row.fetched_at, expiresAt: row.expires_at, contentHash: row.content_hash, lastError: row.last_error };
    } catch {
      return null;
    }
  }

  return {
    get(sourceId) {
      return deserialize(select.get(sourceId));
    },
    set(sourceId, items, ttlMs, now = Date.now()) {
      const itemsJson = JSON.stringify(items);
      const snapshot = { sourceId, items, fetchedAt: now, expiresAt: now + ttlMs, contentHash: createHash("sha256").update(itemsJson).digest("hex"), lastError: null };
      upsert.run({ sourceId, itemsJson, fetchedAt: snapshot.fetchedAt, expiresAt: snapshot.expiresAt, contentHash: snapshot.contentHash });
      return snapshot;
    },
    recordError(sourceId, message) {
      setError.run(String(message).slice(0, 500), sourceId);
    },
    isHealthy() {
      try { db.prepare("SELECT 1").get(); return true; } catch { return false; }
    },
  };
}
