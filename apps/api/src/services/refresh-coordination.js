export function createRefreshCoordination(db, now = () => Date.now()) {
  const claim = db.prepare(`
    INSERT INTO source_refresh_leases (source_id, owner, expires_at)
    VALUES (@sourceId, @owner, @expiresAt)
    ON CONFLICT(source_id) DO UPDATE SET owner=excluded.owner, expires_at=excluded.expires_at
    WHERE source_refresh_leases.expires_at <= @now
  `);
  const release = db.prepare("DELETE FROM source_refresh_leases WHERE source_id = ? AND owner = ?");
  const getBackoff = db.prepare("SELECT retry_after_at FROM source_fetch_backoff WHERE source_id = ?");
  const setBackoff = db.prepare("INSERT INTO source_fetch_backoff (source_id, retry_after_at) VALUES (?, ?) ON CONFLICT(source_id) DO UPDATE SET retry_after_at=excluded.retry_after_at");
  const clearBackoff = db.prepare("DELETE FROM source_fetch_backoff WHERE source_id = ?");
  return {
    claim(sourceId, owner, leaseMs = 60_000) {
      const current = now();
      return claim.run({ sourceId, owner, expiresAt: current + leaseMs, now: current }).changes === 1;
    },
    release(sourceId, owner) { release.run(sourceId, owner); },
    backoffUntil(sourceId) { return getBackoff.get(sourceId)?.retry_after_at ?? 0; },
    setBackoff(sourceId, retryAfterMs) { setBackoff.run(sourceId, now() + Math.max(retryAfterMs, 60_000)); },
    clearBackoff(sourceId) { clearBackoff.run(sourceId); },
  };
}
