import { randomUUID } from "node:crypto";
import { hotItemSchema } from "@news-spot/contracts";
import { isSnapshotCurrent } from "./worker-schedule.js";

const WAIT_FOR_OTHER_MS = 25_000;

function errorResult(source, message, code = "SOURCE_UNAVAILABLE") {
  return { sourceId: source.id, sourceName: source.name, success: false, status: "error", stale: false, staleReason: null, lastSuccessAt: null, fetchedAt: null, items: [], error: { code, message, retryable: true } };
}

function errorCode(error) {
  if (Number.isInteger(error?.statusCode)) return `HTTP_${error.statusCode}`;
  return typeof error?.code === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(error.code) ? error.code : "SOURCE_UNAVAILABLE";
}

export function createHotService({ registry, http, env, cache, metrics, circuit, coordination, fetchLogs, logger, now = () => Date.now(), scheduleTimes = ["05:00", "15:00"], timeZone = "Asia/Shanghai" }) {
  const inFlight = new Map();

  function fromSnapshot(source, snapshot, limit = 20, failedReason = null) {
    const stale = Boolean(failedReason) || !isSnapshotCurrent(snapshot.fetchedAt, now(), scheduleTimes, timeZone);
    return {
      sourceId: source.id, sourceName: source.name, success: true, status: stale ? "stale" : "fresh", stale,
      staleReason: failedReason || (stale ? "最近计划时段尚未更新" : null),
      lastSuccessAt: new Date(snapshot.fetchedAt).toISOString(), fetchedAt: new Date(snapshot.fetchedAt).toISOString(),
      items: snapshot.items.slice(0, limit), error: null,
    };
  }

  async function waitForOther(source, previousFetchedAt, limit) {
    const until = Date.now() + WAIT_FOR_OTHER_MS;
    while (Date.now() < until) {
      const snapshot = cache.get(source.id);
      if (snapshot && (previousFetchedAt == null || snapshot.fetchedAt > previousFetchedAt)) return fromSnapshot(source, snapshot, limit);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const snapshot = cache.get(source.id);
    return snapshot ? fromSnapshot(source, snapshot, limit, "抓取仍在进行中") : errorResult(source, "来源正在初始化，请稍后重试", "INITIALIZING");
  }

  async function refresh(source, { trigger, slotKey = null }) {
    if (inFlight.has(source.id)) return inFlight.get(source.id);
    const task = (async () => {
      const owner = randomUUID();
      const previous = cache.get(source.id);
      if (!coordination.claim(source.id, owner)) return waitForOther(source, previous?.fetchedAt, 50);
      const startedAt = now();
      let logId = null;
      let notModified = false;
      try {
        logId = fetchLogs.start(source.id, trigger, slotKey);
        if (now() < coordination.backoffUntil(source.id)) throw Object.assign(new Error("来源退避生效中"), { code: "UPSTREAM_BACKOFF" });
        if (!circuit.canRequest(source.id, now())) throw Object.assign(new Error("来源熔断中"), { code: "CIRCUIT_OPEN" });
        const adapter = registry.adapter(source.id);
        if (!adapter) throw Object.assign(new Error("来源适配器不存在"), { code: "ADAPTER_MISSING" });
        const rawItems = await adapter({ http, source, env, logger, now, limit: 50, onNotModified: () => { notModified = true; } });
        const items = rawItems.map((item) => hotItemSchema.parse(item));
        if (items.length === 0) throw new Error("上游返回空数据");
        cache.set(source.id, items, source.refreshIntervalMs, now());
        const snapshot = cache.get(source.id);
        if (!snapshot) throw new Error("数据入库后读取失败");
        metrics.success(source.id, now() - startedAt, now());
        circuit.success(source.id);
        coordination.clearBackoff(source.id);
        fetchLogs.finish(logId, notModified ? "not_modified" : "success", items.length);
        return fromSnapshot(source, snapshot, 50);
      } catch (error) {
        const code = errorCode(error);
        if (error?.statusCode === 429) coordination.setBackoff(source.id, error.retryAfterMs ?? 60_000);
        const message = error instanceof Error ? error.message : "未知上游错误";
        cache.recordError(source.id, message);
        metrics.failure(source.id, now() - startedAt, message, now());
        circuit.failure(source.id, now());
        if (logId != null) fetchLogs.finish(logId, ["UPSTREAM_BACKOFF", "CIRCUIT_OPEN"].includes(code) ? "skipped" : "failure", 0, code);
        const snapshot = cache.get(source.id);
        return snapshot ? fromSnapshot(source, snapshot, 50, message) : errorResult(source, message, code);
      } finally {
        coordination.release(source.id, owner);
      }
    })();
    inFlight.set(source.id, task);
    try { return await task; }
    finally { if (inFlight.get(source.id) === task) inFlight.delete(source.id); }
  }

  return {
    async get(sourceId, { limit = 20 } = {}) {
      const source = registry.get(sourceId);
      if (!source || !source.enabled) return null;
      const snapshot = cache.get(sourceId);
      if (snapshot) return fromSnapshot(source, snapshot, limit);
      const result = await refresh(source, { trigger: "cold" });
      return { ...result, items: result.items.slice(0, limit) };
    },
    async refreshSource(sourceId, { trigger = "scheduled", slotKey = null, limit = 20 } = {}) {
      const source = registry.get(sourceId);
      if (!source?.enabled) return null;
      const result = await refresh(source, { trigger, slotKey });
      return { ...result, items: result.items.slice(0, limit) };
    },
    async batch(sourceIds, options = {}) { return Promise.all(sourceIds.map((id) => this.get(id, options))); },
    describeSource(source) {
      const snapshot = cache.get(source.id);
      const sourceMetrics = metrics.get(source.id);
      const stale = snapshot ? !isSnapshotCurrent(snapshot.fetchedAt, now(), scheduleTimes, timeZone) : false;
      const status = !snapshot && sourceMetrics.lastError ? "error" : snapshot ? (stale ? "stale" : "fresh") : "unknown";
      return { ...source, status, stale, lastSuccessAt: snapshot ? new Date(snapshot.fetchedAt).toISOString() : null, lastError: sourceMetrics.lastError };
    },
    metrics: (sourceId) => metrics.get(sourceId),
  };
}
