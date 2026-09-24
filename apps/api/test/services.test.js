import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase } from "../src/db/index.js";
import { createCacheService } from "../src/services/cache-service.js";
import { createCircuitBreaker } from "../src/services/circuit-breaker.js";
import { createHotService } from "../src/services/hot-service.js";
import { createMetricsService } from "../src/services/metrics-service.js";
import { createHttpClient } from "../src/lib/http-client.js";
import { createFetchLogService } from "../src/services/fetch-log-service.js";
import { createRefreshCoordination } from "../src/services/refresh-coordination.js";
import { createWorkerSchedule, schedulePosition } from "../src/services/worker-schedule.js";

const source = { id: "hackernews", name: "Hacker News", enabled: true, refreshIntervalMs: 1000 };
const item = (fetchedAt) => ({ id: "1", sourceId: "hackernews", title: "真实标题", url: "https://example.com/1", rank: 1, score: null, summary: null, publishedAt: null, fetchedAt });

function setup(adapter, nowRef = { value: 1_800_000_000_000 }) {
  const db = createDatabase(":memory:");
  const cache = createCacheService(db);
  const metrics = createMetricsService(db);
  const registry = { get: (id) => id === source.id ? source : null, adapter: () => adapter, list: () => [source] };
  const coordination = createRefreshCoordination(db, () => nowRef.value);
  const fetchLogs = createFetchLogService(db, () => nowRef.value);
  const service = createHotService({ registry, http: vi.fn(), env: {}, cache, metrics, coordination, fetchLogs, circuit: createCircuitBreaker({ cooldownMs: 1000 }), now: () => nowRef.value });
  return { db, cache, metrics, coordination, fetchLogs, service };
}

describe("缓存与可靠性服务", () => {
  it("跨 SQLite 连接立即读取新快照，写入失败保留旧数据", () => {
    const dir = mkdtempSync(join(tmpdir(), "news-spot-db-"));
    const path = join(dir, "news.db");
    const apiDb = createDatabase(path);
    const workerDb = createDatabase(path);
    try {
      const apiCache = createCacheService(apiDb);
      const workerCache = createCacheService(workerDb);
      workerCache.set("hackernews", [item(new Date(1000).toISOString())], 1000, 1000);
      expect(apiCache.get("hackernews")?.fetchedAt).toBe(1000);
      workerCache.set("hackernews", [item(new Date(2000).toISOString())], 1000, 2000);
      expect(apiCache.get("hackernews")?.fetchedAt).toBe(2000);
      const circular = {}; circular.self = circular;
      expect(() => workerCache.set("hackernews", circular, 1000, 3000)).toThrow();
      expect(apiCache.get("hackernews")?.fetchedAt).toBe(2000);
    } finally {
      apiDb.close(); workerDb.close(); rmSync(dir, { recursive: true, force: true });
    }
  });
  it("命中缓存且并发刷新只调用一次适配器", async () => {
    const nowRef = { value: 1_800_000_000_000 };
    const adapter = vi.fn(async () => [item(new Date(nowRef.value).toISOString())]);
    const { db, service } = setup(adapter, nowRef);
    const [first, second] = await Promise.all([service.get("hackernews"), service.get("hackernews")]);
    expect(first.status).toBe("fresh");
    expect(second.items).toHaveLength(1);
    expect(adapter).toHaveBeenCalledTimes(1);
    await service.get("hackernews");
    expect(adapter).toHaveBeenCalledTimes(1);
    db.close();
  });

  it("并发调用共享刷新但各自按 limit 裁剪", async () => {
    const nowRef = { value: 1_800_000_000_000 };
    const adapter = vi.fn(async () => [1, 2, 3].map((id) => ({ ...item(new Date(nowRef.value).toISOString()), id: String(id), rank: id })));
    const { db, service } = setup(adapter, nowRef);
    const [one, two] = await Promise.all([service.get("hackernews", { limit: 1 }), service.get("hackernews", { limit: 2 })]);
    expect(one.items).toHaveLength(1);
    expect(two.items).toHaveLength(2);
    expect(adapter).toHaveBeenCalledTimes(1);
    db.close();
  });

  it("计划抓取失败时保留最近成功快照和抓取日志", async () => {
    const nowRef = { value: 1_800_000_000_000 };
    const { db, cache, fetchLogs, service } = setup(async () => { throw new Error("上游超时"); }, nowRef);
    cache.set("hackernews", [item(new Date(nowRef.value - 2000).toISOString())], 1000, nowRef.value - 2000);
    const result = await service.refreshSource("hackernews");
    expect(result).toMatchObject({ success: true, stale: true, status: "stale", staleReason: "上游超时" });
    expect(fetchLogs.list().items[0]).toMatchObject({ sourceId: "hackernews", trigger: "scheduled", status: "failure", errorCode: "SOURCE_UNAVAILABLE" });
    db.close();
  });

  it("超过 24 小时的快照仍从数据库返回并标记旧数据", async () => {
    const nowRef = { value: 1_800_000_000_000 };
    const { db, cache, service } = setup(async () => { throw new Error("上游超时"); }, nowRef);
    cache.set("hackernews", [item(new Date(nowRef.value - 86_500_000).toISOString())], 1000, nowRef.value - 86_500_000);
    const result = await service.get("hackernews");
    expect(result).toMatchObject({ success: true, stale: true, status: "stale" });
    db.close();
  });

  it("跨进程抓取租约到期后可被重新领取", () => {
    const nowRef = { value: 1000 };
    const db = createDatabase(":memory:");
    const first = createRefreshCoordination(db, () => nowRef.value);
    const second = createRefreshCoordination(db, () => nowRef.value);
    expect(first.claim("hackernews", "one", 1000)).toBe(true);
    expect(second.claim("hackernews", "two", 1000)).toBe(false);
    nowRef.value = 2000;
    expect(second.claim("hackernews", "two", 1000)).toBe(true);
    first.release("hackernews", "one");
    expect(first.claim("hackernews", "one", 1000)).toBe(false);
    db.close();
  });

  it("三次失败后开启熔断", () => {
    const circuit = createCircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });
    circuit.failure("x", 0); circuit.failure("x", 1); circuit.failure("x", 2);
    expect(circuit.canRequest("x", 100)).toBe(false);
    expect(circuit.canRequest("x", 2000)).toBe(true);
    expect(circuit.canRequest("x", 2001)).toBe(false);
    circuit.success("x");
    expect(circuit.canRequest("x", 2002)).toBe(true);
  });

  it("允许单次请求覆盖默认重试次数", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("网络失败"); });
    const http = createHttpClient({ fetchImpl, retries: 2 });
    await expect(http("https://example.com", { retryCount: 0 })).rejects.toThrow("上游网络请求失败");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1]).not.toHaveProperty("retryCount");
    expect(fetchImpl.mock.calls[0][1]).not.toHaveProperty("timeoutMs");
  });

  it("HTTP 客户端仅按选项接受 304，429 不重试且保留 Retry-After", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 304 }));
    const http = createHttpClient({ fetchImpl, retries: 2 });
    await expect(http("https://example.com", { allowNotModified: true })).resolves.toMatchObject({ status: 304 });
    await expect(http("https://example.com", { retryCount: 0 })).rejects.toMatchObject({ statusCode: 304 });
    fetchImpl.mockImplementation(async () => new Response(null, { status: 429, headers: { "Retry-After": "120" } }));
    await expect(http("https://example.com", { retryOn429: false })).rejects.toMatchObject({ statusCode: 429, retryAfterMs: 120_000 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[2][1]).not.toHaveProperty("allowNotModified");
    expect(fetchImpl.mock.calls[2][1]).not.toHaveProperty("retryOn429");
  });

  it("北京时间上午下午计算时段，启动补跑且单次最多并发三个", async () => {
    const nowRef = { value: Date.parse("2026-09-23T01:01:00Z") };
    expect(schedulePosition(nowRef.value, ["09:00", "15:00"], "Asia/Shanghai")).toEqual({ latest: "2026-09-23T09:00", next: "2026-09-23T15:00" });
    const db = createDatabase(":memory:");
    const definitions = Array.from({ length: 5 }, (_, index) => ({ id: `source-${index}` }));
    let active = 0;
    let maxActive = 0;
    const hotService = {
      refreshSource: vi.fn(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active -= 1;
        return { success: true, stale: false };
      }),
    };
    const schedule = createWorkerSchedule({ db, registry: { list: () => definitions }, hotService, fetchLogs: createFetchLogService(db, () => nowRef.value), now: () => nowRef.value });
    expect(await schedule.tick()).toMatchObject({ slotKey: "2026-09-23T09:00", total: 5, success: 5, failed: 0 });
    expect(db.prepare("SELECT next_slot_key FROM worker_state WHERE id=1").get().next_slot_key).toBe("2026-09-23T15:00");
    expect(maxActive).toBe(3);
    expect(await schedule.tick()).toBeNull();
    nowRef.value = Date.parse("2026-09-23T07:01:00Z");
    expect(await schedule.tick()).toMatchObject({ slotKey: "2026-09-23T15:00", success: 5 });
    db.close();
  });

  it("单来源失败不影响其他来源及旧快照", async () => {
    const nowRef = { value: Date.parse("2026-09-23T07:01:00Z") };
    const db = createDatabase(":memory:");
    const schedule = createWorkerSchedule({ db, registry: { list: () => [{ id: "a" }, { id: "b" }] }, hotService: { refreshSource: async (id) => id === "a" ? { success: false } : { success: true } }, fetchLogs: createFetchLogService(db, () => nowRef.value), now: () => nowRef.value });
    expect(await schedule.tick()).toMatchObject({ total: 2, success: 1, failed: 1 });
    expect(db.prepare("SELECT failure_count FROM worker_slots").get().failure_count).toBe(1);
    db.close();
  });

  it("进程中断后租约过期可补跑，已成功来源不重复抓取", async () => {
    const current = Date.parse("2026-09-23T07:01:00Z");
    const db = createDatabase(":memory:");
    db.prepare("INSERT INTO worker_slots (slot_key, status, owner, lease_until, started_at) VALUES (?, 'running', 'dead', ?, ?)").run("2026-09-23T15:00", current - 1, current - 600_000);
    db.prepare("INSERT INTO worker_slot_sources (slot_key, source_id, status) VALUES (?, 'a', 'success')").run("2026-09-23T15:00");
    const refreshSource = vi.fn(async () => ({ success: true, stale: false }));
    const schedule = createWorkerSchedule({ db, registry: { list: () => [{ id: "a" }, { id: "b" }] }, hotService: { refreshSource }, fetchLogs: createFetchLogService(db, () => current), now: () => current });
    expect(await schedule.tick()).toMatchObject({ total: 2, success: 2 });
    expect(refreshSource).toHaveBeenCalledTimes(1);
    expect(refreshSource.mock.calls[0][0]).toBe("b");
    db.close();
  });

  it("日志稳定分页、筛选并清理 30 天前记录", () => {
    const nowRef = { value: Date.parse("2026-09-23T07:01:00Z") };
    const db = createDatabase(":memory:");
    const logs = createFetchLogService(db, () => nowRef.value);
    for (const id of ["a", "b", "a"]) logs.finish(logs.start(id, "scheduled"), "success", 2);
    const first = logs.list({ limit: 2 });
    expect(first.items.map((row) => row.sourceId)).toEqual(["a", "b"]);
    expect(logs.list({ limit: 2, cursor: first.nextCursor }).items.map((row) => row.sourceId)).toEqual(["a"]);
    expect(logs.list({ sourceId: "b" }).items).toHaveLength(1);
    expect(Object.keys(first.items[0])).not.toContain("rawResponse");
    nowRef.value += 31 * 86400_000;
    logs.cleanup();
    expect(logs.list().items).toHaveLength(0);
    db.close();
  });
});
