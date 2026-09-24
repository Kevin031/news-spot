import { randomUUID } from "node:crypto";
import { setInterval, clearInterval } from "node:timers";

function parts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return Object.fromEntries(formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function shiftDay(day, amount) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function parseRunTimes(value) {
  const times = String(value).split(",").map((time) => time.trim()).sort();
  if (times.length === 0 || times.some((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) || new Set(times).size !== times.length) throw new Error("WORKER_RUN_TIMES 必须是不重复的 HH:MM 列表");
  return times;
}

export function schedulePosition(now, times, timeZone) {
  const part = parts(new Date(now), timeZone);
  const day = `${part.year}-${part.month}-${part.day}`;
  const clock = `${part.hour}:${part.minute}`;
  const dueToday = times.filter((time) => time <= clock);
  const latest = dueToday.length ? `${day}T${dueToday.at(-1)}` : `${shiftDay(day, -1)}T${times.at(-1)}`;
  const nextToday = times.find((time) => time > clock);
  const next = nextToday ? `${day}T${nextToday}` : `${shiftDay(day, 1)}T${times[0]}`;
  return { latest, next };
}

export function isSnapshotCurrent(fetchedAt, now, times, timeZone) {
  if (fetchedAt == null) return false;
  const part = parts(new Date(fetchedAt), timeZone);
  const snapshotSlot = `${part.year}-${part.month}-${part.day}T${part.hour}:${part.minute}`;
  return snapshotSlot >= schedulePosition(now, times, timeZone).latest;
}

export function createWorkerSchedule({ db, registry, hotService, fetchLogs, now = () => Date.now(), times = ["09:00", "15:00"], timeZone = "Asia/Shanghai", logger = { warn() {} }, maxConcurrency = 3 }) {
  const owner = randomUUID();
  const heartbeat = db.prepare("INSERT INTO worker_state (id, heartbeat_at, next_slot_key) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET heartbeat_at=excluded.heartbeat_at, next_slot_key=excluded.next_slot_key");
  const createSlot = db.prepare("INSERT OR IGNORE INTO worker_slots (slot_key, status, started_at) VALUES (?, 'pending', ?)");
  const claimSlot = db.prepare("UPDATE worker_slots SET status='running', owner=?, lease_until=?, started_at=? WHERE slot_key=? AND status!='completed' AND (lease_until IS NULL OR lease_until <= ?)");
  const renewSlot = db.prepare("UPDATE worker_slots SET lease_until=? WHERE slot_key=? AND owner=? AND status='running'");
  const completedSource = db.prepare("SELECT status FROM worker_slot_sources WHERE slot_key=? AND source_id=?");
  const saveSource = db.prepare("INSERT INTO worker_slot_sources (slot_key, source_id, status) VALUES (?, ?, ?) ON CONFLICT(slot_key, source_id) DO UPDATE SET status=excluded.status");
  const finishSlot = db.prepare("UPDATE worker_slots SET status='completed', owner=NULL, lease_until=NULL, finished_at=?, total_count=?, success_count=?, failure_count=? WHERE slot_key=? AND owner=?");
  let running = false;

  async function runSources(slotKey, trigger) {
    const sources = registry.list();
    let index = 0;
    let success = 0;
    let failed = 0;
    async function worker() {
      while (index < sources.length) {
        const source = sources[index++];
        if (slotKey && completedSource.get(slotKey, source.id)?.status === "success") { success += 1; continue; }
        let ok = false;
        try {
          const result = await hotService.refreshSource(source.id, { trigger, slotKey });
          ok = Boolean(result?.success && !result.stale);
        } catch (error) {
          logger.warn({ sourceId: source.id, error: error instanceof Error ? error.message : String(error) }, "Worker 来源抓取异常");
        }
        if (ok) success += 1;
        else failed += 1;
        if (slotKey) saveSource.run(slotKey, source.id, ok ? "success" : "failure");
      }
    }
    await Promise.all(Array.from({ length: Math.min(maxConcurrency, sources.length) }, worker));
    return { total: sources.length, success, failed };
  }

  return {
    heartbeat() {
      const position = schedulePosition(now(), times, timeZone);
      heartbeat.run(now(), position.next);
      fetchLogs.cleanup();
      return position;
    },
    async tick() {
      const position = this.heartbeat();
      if (running) return null;
      const slotKey = position.latest;
      createSlot.run(slotKey, now());
      if (claimSlot.run(owner, now() + 600_000, now(), slotKey, now()).changes !== 1) return null;
      running = true;
      const renew = setInterval(() => renewSlot.run(now() + 600_000, slotKey, owner), 30_000);
      renew.unref?.();
      try {
        const summary = await runSources(slotKey, "scheduled");
        finishSlot.run(now(), summary.total, summary.success, summary.failed, slotKey, owner);
        return { slotKey, ...summary };
      } catch (error) {
        logger.warn({ slotKey, error: error instanceof Error ? error.message : String(error) }, "Worker 时段执行异常");
        throw error;
      } finally {
        clearInterval(renew);
        running = false;
      }
    },
    async runOnce() { return runSources(null, "manual"); },
  };
}
