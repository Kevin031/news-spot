export function createMetricsService(db) {
  const getStatement = db.prepare("SELECT * FROM source_metrics WHERE source_id = ?");
  const ensure = db.prepare("INSERT OR IGNORE INTO source_metrics (source_id) VALUES (?)");
  const success = db.prepare(`UPDATE source_metrics SET total_requests=total_requests+1,
    successful_requests=successful_requests+1, consecutive_failures=0,
    total_duration_ms=total_duration_ms+@duration, durations_json=@durations,
    last_success_at=@now, last_error=NULL WHERE source_id=@sourceId`);
  const failure = db.prepare(`UPDATE source_metrics SET total_requests=total_requests+1,
    consecutive_failures=consecutive_failures+1, total_duration_ms=total_duration_ms+@duration,
    durations_json=@durations, last_error_at=@now, last_error=@error WHERE source_id=@sourceId`);

  function row(sourceId) {
    ensure.run(sourceId);
    return getStatement.get(sourceId);
  }
  function appendDuration(sourceId, duration) {
    const current = row(sourceId);
    let durations = [];
    try { durations = JSON.parse(current.durations_json); } catch { durations = []; }
    return JSON.stringify([...durations, duration].slice(-100));
  }

  return {
    success(sourceId, duration, now = Date.now()) { success.run({ sourceId, duration, now, durations: appendDuration(sourceId, duration) }); },
    failure(sourceId, duration, error, now = Date.now()) { failure.run({ sourceId, duration, now, error: String(error).slice(0, 500), durations: appendDuration(sourceId, duration) }); },
    get(sourceId) {
      const current = row(sourceId);
      let durations = [];
      try { durations = JSON.parse(current.durations_json).sort((a, b) => a - b); } catch { durations = []; }
      const p95 = durations.length ? durations[Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1)] : 0;
      return {
        totalRequests: current.total_requests,
        successRate: current.total_requests ? current.successful_requests / current.total_requests : null,
        consecutiveFailures: current.consecutive_failures,
        averageDurationMs: current.total_requests ? Math.round(current.total_duration_ms / current.total_requests) : 0,
        p95DurationMs: p95,
        lastSuccessAt: current.last_success_at,
        lastErrorAt: current.last_error_at,
        lastError: current.last_error,
      };
    },
  };
}
