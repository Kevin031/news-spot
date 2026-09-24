const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function publicRow(row) {
  return {
    id: row.id,
    sourceId: row.source_id,
    trigger: row.trigger_type,
    slotKey: row.slot_key,
    startedAt: new Date(row.started_at).toISOString(),
    finishedAt: row.finished_at == null ? null : new Date(row.finished_at).toISOString(),
    status: row.status,
    itemCount: row.item_count,
    errorCode: row.error_code,
  };
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (Number.isSafeInteger(parsed.startedAt) && Number.isSafeInteger(parsed.id) && parsed.id > 0) return parsed;
  } catch { /* 非法游标由路由返回 400。 */ }
  throw Object.assign(new Error("抓取日志游标不合法"), { code: "INVALID_CURSOR" });
}

export function createFetchLogService(db, now = () => Date.now()) {
  const start = db.prepare("INSERT INTO fetch_logs (source_id, trigger_type, slot_key, started_at, status) VALUES (?, ?, ?, ?, 'running')");
  const finish = db.prepare("UPDATE fetch_logs SET finished_at=?, status=?, item_count=?, error_code=? WHERE id=?");
  const clean = db.prepare("DELETE FROM fetch_logs WHERE started_at < ?");
  const interrupt = db.prepare("UPDATE fetch_logs SET finished_at=?, status='failure', error_code='INTERRUPTED' WHERE status='running' AND started_at < ?");
  const latestSlot = db.prepare("SELECT slot_key, status, started_at, finished_at, total_count, success_count, failure_count FROM worker_slots ORDER BY slot_key DESC LIMIT 1");

  return {
    start(sourceId, trigger, slotKey = null) { return Number(start.run(sourceId, trigger, slotKey, now()).lastInsertRowid); },
    finish(id, status, itemCount = 0, errorCode = null) { finish.run(now(), status, itemCount, errorCode, id); },
    cleanup() {
      const current = now();
      interrupt.run(current, current - 10 * 60_000);
      clean.run(current - RETENTION_MS);
    },
    latestSlot() {
      const slot = latestSlot.get();
      return slot ? { key: slot.slot_key, status: slot.status, startedAt: new Date(slot.started_at).toISOString(), finishedAt: slot.finished_at == null ? null : new Date(slot.finished_at).toISOString(), total: slot.total_count, success: slot.success_count, failed: slot.failure_count } : null;
    },
    list({ limit = 20, cursor, sourceId, status } = {}) {
      const anchor = decodeCursor(cursor);
      const rows = db.prepare(`
        SELECT * FROM fetch_logs
        WHERE (? IS NULL OR source_id = ?)
          AND (? IS NULL OR status = ?)
          AND (? IS NULL OR started_at < ? OR (started_at = ? AND id < ?))
        ORDER BY started_at DESC, id DESC LIMIT ?
      `).all(sourceId ?? null, sourceId ?? null, status ?? null, status ?? null,
        anchor?.startedAt ?? null, anchor?.startedAt ?? null, anchor?.startedAt ?? null, anchor?.id ?? null, limit + 1);
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map(publicRow),
        nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ startedAt: last.started_at, id: last.id })).toString("base64url") : null,
        latestSlot: this.latestSlot(),
      };
    },
  };
}
