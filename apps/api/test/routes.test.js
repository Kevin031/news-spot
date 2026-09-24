import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnv } from "../src/config/env.js";
import { createSourceDefinitions } from "../src/config/sources.js";
import { buildApp } from "../src/app.js";

const apps = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

async function makeApp() {
  const fetchImpl = async (url) => new Response(String(url).includes("topstories") ? "[1]" : JSON.stringify({ id: 1, title: "真实数据", url: "https://example.com/1", score: 1, time: 1787300000 }), { status: 200 });
  const env = loadEnv({ NODE_ENV: "test", DATABASE_PATH: ":memory:", LOG_LEVEL: "silent", CORS_ORIGINS: "http://localhost:5173" });
  const sources = [{ id: "hackernews", name: "Hacker News", category: "tech", homeUrl: "https://news.ycombinator.com", refreshIntervalMs: 30000, timeoutMs: 1000, enabled: true, riskLevel: "low", dataMethod: "official-api" }];
  const app = await buildApp({ env, databasePath: ":memory:", sources, fetchImpl, logger: false });
  apps.push(app);
  return app;
}

async function makeAihotApp(fetchImpl, now) {
  const env = loadEnv({ NODE_ENV: "test", DATABASE_PATH: ":memory:", LOG_LEVEL: "silent", SOURCE_AIHOT_SELECTED_ENABLED: "true", SOURCE_AIHOT_TOPICS_ENABLED: "true" });
  const sources = createSourceDefinitions(env).filter((entry) => entry.category === "ai");
  const app = await buildApp({ env, sources, fetchImpl, now, databasePath: ":memory:", logger: false });
  apps.push(app);
  return app;
}

describe("API 路由", () => {
  it("提供与公开路由一致的在线接口文档和 OpenAPI 定义", async () => {
    const app = await makeApp();
    const page = await app.inject("/api/docs");
    expect(page.statusCode).toBe(200);
    expect(page.headers["content-type"]).toContain("text/html");
    expect(page.body).toContain("接口文档");
    expect(page.body).toContain("/api/v1/hot/{sourceId}");
    expect((await app.inject("/api/docs/")).statusCode).toBe(200);

    const specResponse = await app.inject("/api/openapi.json");
    expect(specResponse.statusCode).toBe(200);
    const spec = specResponse.json();
    expect(spec.openapi).toBe("3.0.3");
    expect(Object.keys(spec.paths).sort()).toEqual([
      "/api/v1/batch", "/api/v1/fetch-logs", "/api/v1/health", "/api/v1/health/live",
      "/api/v1/hot/{sourceId}", "/api/v1/metrics", "/api/v1/sources",
    ].sort());
    for (const path of Object.keys(spec.paths)) {
      expect(app.hasRoute({ method: "GET", url: path.replace("{sourceId}", ":sourceId") })).toBe(true);
    }
    expect(spec.paths["/api/v1/batch"].get.parameters.find((entry) => entry.name === "sources")).toMatchObject({ required: true, schema: { maxLength: 500 } });
    expect(spec.paths["/api/v1/fetch-logs"].get.parameters.find((entry) => entry.name === "status").schema.enum).toContain("not_modified");
  });

  it("返回来源、真实热点和批量摘要", async () => {
    const app = await makeApp();
    expect((await app.inject("/api/v1/sources")).json().sources).toHaveLength(1);
    const hot = await app.inject("/api/v1/hot/hackernews?limit=1");
    expect(hot.statusCode).toBe(200);
    expect(hot.json().items[0].title).toBe("真实数据");
    expect(hot.json().items).toHaveLength(1);
    const batch = await app.inject("/api/v1/batch?sources=hackernews,missing&limit=1");
    expect(batch.json().summary).toMatchObject({ total: 2, success: 1, failed: 1 });
    const logs = (await app.inject("/api/v1/fetch-logs")).json();
    expect(logs.items).toHaveLength(1);
    expect(logs.items[0]).toMatchObject({ sourceId: "hackernews", trigger: "cold", status: "success" });
    expect(logs.items[0]).not.toHaveProperty("rawResponse");
    await app.inject("/api/v1/hot/hackernews");
    expect((await app.inject("/api/v1/fetch-logs")).json().items).toHaveLength(1);
  });

  it("拒绝非法参数和未知来源", async () => {
    const app = await makeApp();
    expect((await app.inject("/api/v1/hot/missing")).statusCode).toBe(404);
    expect((await app.inject("/api/v1/hot/hackernews?limit=99")).statusCode).toBe(400);
    expect((await app.inject(`/api/v1/batch?sources=${Array.from({ length: 13 }, (_, index) => `x${index}`).join(",")}`)).statusCode).toBe(400);
    expect((await app.inject("/api/v1/fetch-logs?limit=101")).statusCode).toBe(400);
    expect((await app.inject("/api/v1/fetch-logs?cursor=invalid")).statusCode).toBe(400);
  });

  it("限制 CORS 并拒绝已停用的强制抓取参数", async () => {
    const app = await makeApp();
    const denied = await app.inject({ url: "/api/v1/sources", headers: { origin: "https://evil.example" } });
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    const disabled = await app.inject("/api/v1/hot/hackernews?refresh=true");
    expect(disabled.statusCode).toBe(400);
    expect(disabled.json().code).toBe("REFRESH_DISABLED");
  });

  it("健康检查返回数据库状态", async () => {
    const app = await makeApp();
    const health = await app.inject("/api/v1/health");
    expect(health.json()).toMatchObject({ database: "ok", sources: { availabilityRatio: 0 } });
    await app.inject("/api/v1/hot/hackernews?limit=1");
    expect((await app.inject("/api/v1/health")).json()).toMatchObject({ sources: { availabilityRatio: 1 } });
    expect((await app.inject("/api/v1/metrics")).json().sources).toHaveLength(1);
  });

  it("空库补抓先入库再返回，普通重读零上游，Worker 更新跨连接可见", async () => {
    const dir = mkdtempSync(join(tmpdir(), "news-spot-cold-"));
    const databasePath = join(dir, "news.db");
    let fetchCount = 0;
    const fetchImpl = async (url) => {
      fetchCount += 1;
      return new Response(String(url).includes("topstories") ? "[1]" : JSON.stringify({ id: 1, title: `第 ${fetchCount} 次抓取`, url: "https://example.com/1", score: 1, time: 1787300000 }), { status: 200 });
    };
    const env = loadEnv({ NODE_ENV: "test", DATABASE_PATH: databasePath, LOG_LEVEL: "silent" });
    const sources = [{ id: "hackernews", name: "Hacker News", category: "tech", homeUrl: "https://news.ycombinator.com", refreshIntervalMs: 30000, timeoutMs: 1000, enabled: true }];
    const api = await buildApp({ env, databasePath, sources, fetchImpl, logger: false });
    const worker = await buildApp({ env, databasePath, sources, fetchImpl, logger: false });
    try {
      const first = (await api.inject("/api/v1/hot/hackernews")).json();
      expect(first.items[0].title).toBe("第 2 次抓取");
      expect(api.newsSpot.cache.get("hackernews")?.items[0].title).toBe(first.items[0].title);
      const countAfterCold = fetchCount;
      expect((await api.inject("/api/v1/hot/hackernews")).json().items[0].title).toBe(first.items[0].title);
      expect(fetchCount).toBe(countAfterCold);
      expect((await api.inject("/api/v1/fetch-logs")).json().items).toHaveLength(1);
      await worker.newsSpot.hotService.refreshSource("hackernews", { trigger: "scheduled" });
      expect((await api.inject("/api/v1/hot/hackernews")).json().items[0].title).toBe("第 4 次抓取");
      expect(fetchCount).toBe(4);
      expect((await api.inject("/api/v1/fetch-logs")).json().items).toHaveLength(2);
    } finally { await api.close(); await worker.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it("AIHOT 两来源经过来源列表和批量接口，单源 429 时另一来源仍可用", async () => {
    const selected = readFileSync(new URL("./fixtures/upstreams/aihot-items.json", import.meta.url), "utf8");
    const topics = readFileSync(new URL("./fixtures/upstreams/aihot-hot-topics.json", import.meta.url), "utf8");
    let selectedCalls = 0;
    let nowValue = 1_800_000_000_000;
    const fetchImpl = async (url) => {
      if (String(url).includes("/api/v1/items?")) {
        selectedCalls += 1;
        return selectedCalls === 1
          ? new Response(selected, { status: 200, headers: { ETag: 'W/"selected-1"' } })
          : new Response(null, { status: 429, headers: { "Retry-After": "120" } });
      }
      return new Response(topics, { status: 200 });
    };
    const app = await makeAihotApp(fetchImpl, () => nowValue);
    expect((await app.inject("/api/v1/sources")).json().sources.map((entry) => entry.id)).toEqual(["aihot-selected", "aihot-topics"]);
    const batch = (await app.inject("/api/v1/batch?sources=aihot-selected,aihot-topics&limit=12")).json();
    expect(batch.summary).toMatchObject({ total: 2, success: 2 });
    expect(batch.results[0].items[0]).toMatchObject({ originalSourceName: "MarkTechPost（RSS）", attribution: { name: "AIHOT" } });
    nowValue += 61_000;
    const stale = await app.newsSpot.hotService.refreshSource("aihot-selected");
    expect(stale).toMatchObject({ success: true, stale: true, status: "stale" });
    expect((await app.inject("/api/v1/hot/aihot-topics?limit=1")).json()).toMatchObject({ success: true, status: "fresh" });
    expect(selectedCalls).toBe(2);
    await app.newsSpot.hotService.refreshSource("aihot-selected");
    expect(selectedCalls).toBe(2);
    expect((await app.inject("/api/v1/fetch-logs?sourceId=aihot-selected")).json().items.map((entry) => entry.status)).toEqual(["skipped", "failure", "success"]);
  });

  it("AIHOT 304 复用已验证内容并记录未变化", async () => {
    const selected = readFileSync(new URL("./fixtures/upstreams/aihot-items.json", import.meta.url), "utf8");
    let current = 1_800_000_000_000;
    let calls = 0;
    const app = await makeAihotApp(async (url) => {
      if (!String(url).includes("/api/v1/items?")) throw new Error("意外请求");
      calls += 1;
      return calls === 1 ? new Response(selected, { status: 200, headers: { ETag: 'W/"selected-1"' } }) : new Response(null, { status: 304 });
    }, () => current);
    const first = (await app.inject("/api/v1/hot/aihot-selected")).json();
    current += 61_000;
    const next = await app.newsSpot.hotService.refreshSource("aihot-selected");
    expect(next.items[0].title).toBe(first.items[0].title);
    expect(calls).toBe(2);
    expect((await app.inject("/api/v1/fetch-logs?sourceId=aihot-selected")).json().items.map((entry) => entry.status)).toEqual(["not_modified", "success"]);
  });
});
