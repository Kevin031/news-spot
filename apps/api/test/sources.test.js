import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fetchBbc } from "../src/sources/bbc.js";
import { fetchBilibili } from "../src/sources/bilibili.js";
import { fetchDoubanMovies, fetchDoubanTv } from "../src/sources/douban.js";
import { fetchGithub } from "../src/sources/github.js";
import { fetchHackerNews } from "../src/sources/hackernews.js";
import { fetchIthome } from "../src/sources/ithome.js";
import { fetchV2ex } from "../src/sources/v2ex.js";
import { fetchDevto } from "../src/sources/devto.js";
import { fetchStackOverflow } from "../src/sources/stackoverflow.js";
import { fetchRssSource } from "../src/sources/rss-source.js";
import { fetchAihotSelected, fetchAihotTopics } from "../src/sources/aihot.js";
import { fetchWikipediaZh } from "../src/sources/wikipedia-zh.js";
import { loadEnv } from "../src/config/env.js";
import { createSourceDefinitions } from "../src/config/sources.js";
import { createSourceRegistry } from "../src/sources/registry.js";

const fixture = (name) => readFileSync(fileURLToPath(new URL(`./fixtures/upstreams/${name}`, import.meta.url)), "utf8");
const response = (body) => new Response(body, { status: 200, headers: { "content-type": body.trim().startsWith("<") ? "application/xml" : "application/json" } });
const source = (id) => ({ id, timeoutMs: 1000 });

describe("真实数据适配器", () => {
  it("标准化 Hacker News", async () => {
    const http = async (url, options) => {
      expect(options).toMatchObject({ retryCount: 0 });
      return response(String(url).includes("topstories") ? "[1]" : JSON.stringify({ id: 1, title: "HN story", url: "https://example.com/hn", score: 10, descendants: 3, time: 1787300000 }));
    };
    const items = await fetchHackerNews({ http, source: source("hackernews"), limit: 1 });
    expect(items[0]).toMatchObject({ id: "1", rank: 1, score: 10 });
  });

  it("标准化 V2EX", async () => {
    const items = await fetchV2ex({ http: async () => response(fixture("v2ex.json")), source: source("v2ex"), limit: 1 });
    expect(items[0].url).toBe("https://www.v2ex.com/t/101");
  });

  it("标准化 GitHub", async () => {
    const items = await fetchGithub({ http: async () => response(fixture("github.json")), source: source("github"), env: {}, limit: 1 });
    expect(items[0]).toMatchObject({ title: "owner/repository", score: 320 });
  });

  it("GitHub Token 失效时降级为公开请求", async () => {
    let calls = 0;
    const http = async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error("未授权"), { statusCode: 401 });
      return response(fixture("github.json"));
    };
    const items = await fetchGithub({ http, source: source("github"), env: { GITHUB_TOKEN: "invalid" }, limit: 1 });
    expect(items).toHaveLength(1);
    expect(calls).toBe(2);
  });

  it.each([["bbc", fetchBbc], ["ithome", fetchIthome]])("标准化 %s RSS", async (id, adapter) => {
    const items = await adapter({ http: async () => response(fixture("rss.xml")), source: source(id), limit: 1 });
    expect(items[0]).toMatchObject({ title: "真实 RSS 标题", summary: "真实摘要" });
  });

  it("标准化 Bilibili 并校验状态", async () => {
    const items = await fetchBilibili({ http: async () => response(fixture("bilibili.json")), source: source("bilibili"), limit: 1 });
    expect(items[0]).toMatchObject({ id: "BV1fixture", score: 8888 });
    await expect(fetchBilibili({ http: async () => response('{"code":-1}'), source: source("bilibili") })).rejects.toThrow("异常状态");
  });

  it("将豆瓣热门电影和电视剧分别映射成真实作品链接", async () => {
    const urls = [];
    const http = async (url, options) => {
      urls.push(String(url));
      expect(options).toMatchObject({ retryOn429: false, headers: { Referer: "https://movie.douban.com/" } });
      return response(fixture("douban.json"));
    };
    const movies = await fetchDoubanMovies({ http, source: source("douban-movies"), limit: 1 });
    const tv = await fetchDoubanTv({ http, source: source("douban-tv") });
    expect(urls[0]).toContain("type=movie");
    expect(urls[1]).toContain("type=tv");
    expect(movies).toHaveLength(1);
    expect(movies[0]).toMatchObject({ id: "36850814", rank: 1, score: null, rating: 6.4, posterUrl: "https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2934583425.jpg", url: "https://movie.douban.com/subject/36850814/" });
    expect(tv).toHaveLength(2);
    expect(tv[1]).toMatchObject({ id: "37297001", rank: 2, score: null, rating: null, posterUrl: null, summary: "更新至14集" });
    await expect(fetchDoubanMovies({ http: async () => response("{}"), source: source("douban-movies") })).rejects.toThrow("结构异常");
    await expect(fetchDoubanTv({ http: async () => response('{"subjects":[]}'), source: source("douban-tv") })).rejects.toThrow("无有效条目");
  });

  it("标准化 DEV Community 并限制高延迟请求重试", async () => {
    const http = async (_url, options) => {
      expect(options).toMatchObject({ retryCount: 1 });
      return response(fixture("devto.json"));
    };
    const items = await fetchDevto({ http, source: { ...source("devto"), timeoutMs: 12000 }, limit: 3 });
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ id: "4617912", score: 410 });
    await expect(fetchDevto({ http: async () => response("{}"), source: source("devto") })).rejects.toThrow("返回结构异常");
  });

  it("标准化 Stack Overflow、解码标题并遵守 backoff", async () => {
    const stackSource = source("stackoverflow");
    const payload = JSON.parse(fixture("stackoverflow.json"));
    let now = 1_800_000_000_000;
    const http = async () => response(JSON.stringify({ ...payload, backoff: 2 }));
    const items = await fetchStackOverflow({ http, source: stackSource, limit: 3, now: () => now });
    expect(items).toHaveLength(3);
    expect(items[1]).toMatchObject({ title: "What is the difference between MiniProfiler's request duration and action duration?", score: 5 });
    await expect(fetchStackOverflow({ http, source: stackSource, now: () => now })).rejects.toMatchObject({ code: "UPSTREAM_BACKOFF" });
    now += 2001;
    await expect(fetchStackOverflow({ http, source: stackSource, now: () => now })).resolves.toHaveLength(3);
  });

  it("中文维基日榜过滤非词条，并保留浏览量和统计日期", async () => {
    const http = async (url, options) => {
      expect(String(url)).toBe("https://wikimedia.org/api/rest_v1/metrics/pageviews/top/zh.wikipedia.org/all-access/2026/09/28");
      expect(options.headers["User-Agent"]).toContain("hot-spots.kevinlau.cn");
      return response(JSON.stringify({ items: [{ articles: [
        { article: "Wikipedia:首页", views: 1000, rank: 1 },
        { article: "Special:Search", views: 900, rank: 2 },
        { article: "2026年亞洲運動會", views: 800, rank: 3 },
        { article: "颱風_樺加沙", views: 700, rank: 4 },
      ] }] }));
    };
    const items = await fetchWikipediaZh({ http, source: source("wikipedia-zh"), limit: 2, now: () => Date.parse("2026-09-30T12:00:00Z") });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: "2026年亞洲運動會", rank: 1, score: 800, summary: "2026-09-28 浏览量", publishedAt: null });
    expect(items[1].url).toBe("https://zh.wikipedia.org/wiki/%E9%A2%B1%E9%A2%A8_%E6%A8%BA%E5%8A%A0%E6%B2%99");
    expect(items[1].rank).toBe(2);
  });

  it("中文维基日榜异常时报告失败", async () => {
    const context = { source: source("wikipedia-zh"), now: () => Date.parse("2026-09-30T12:00:00Z") };
    await expect(fetchWikipediaZh({ ...context, http: async () => response("{}") })).rejects.toThrow("结构异常");
    await expect(fetchWikipediaZh({ ...context, http: async () => response('{"items":[{"articles":[{"article":"Special:Search","views":1}]}]}') })).rejects.toThrow("无有效词条");
  });

  it.each(["lobsters", "sspai", "solidot", "techcrunch", "npr-world", "marketwatch", "arstechnica"])("标准化 %s 的独立 RSS fixture", async (id) => {
    const items = await fetchRssSource({ http: async () => response(fixture(`${id}.xml`)), source: source(id), feedUrl: `https://example.com/${id}.xml`, limit: 3 });
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.rank)).toEqual([1, 2, 3]);
    expect(items.every((item) => item.url.startsWith("http"))).toBe(true);
    expect(items.every((item) => item.publishedAt)).toBe(true);
  });

  it("RSS 过滤重复和非法链接，并清理摘要标签与实体", async () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item><title>A &amp;amp; B</title><link>https://example.com/one</link><description><![CDATA[<p>Hello <b>world</b> &amp;</p>]]></description></item>
      <item><title>重复</title><link>https://example.com/one</link></item>
      <item><title>非法</title><link>ftp://example.com/file</link></item>
    </channel></rss>`;
    const items = await fetchRssSource({ http: async () => response(xml), source: source("rss"), feedUrl: "https://example.com/feed" });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: "A & B", summary: "Hello world &", rank: 1 });
  });

  it("标准化 AIHOT 精选与热点榜且不误标评分或信源数", async () => {
    const selected = await fetchAihotSelected({ http: async () => response(fixture("aihot-items.json")), source: source("aihot-selected") });
    const topics = await fetchAihotTopics({ http: async () => response(fixture("aihot-hot-topics.json")), source: source("aihot-topics") });
    expect(selected[0]).toMatchObject({ score: null, originalSourceName: "MarkTechPost（RSS）", attribution: { name: "AIHOT" } });
    expect(selected[0].url).toContain("marktechpost.com");
    expect(topics[0]).toMatchObject({ rank: 1, score: null, sourceCount: 23, publishedAt: null });
    expect(topics[0].attribution.url).toContain("aihot.news/items/");
  });

  it("AIHOT 对同一 URL 使用 ETag，304 复用已验证条目", async () => {
    const currentSource = source("aihot-selected");
    let calls = 0;
    let nowValue = 1_800_000_000_000;
    const now = () => nowValue;
    const http = async (url, options) => {
      expect(String(url)).toBe("https://aihot.news/api/v1/items?mode=selected&window=24h&limit=20");
      calls += 1;
      if (calls === 1) {
        expect(options.headers).toEqual({});
        return new Response(fixture("aihot-items.json"), { status: 200, headers: { ETag: 'W/"selected-1"' } });
      }
      expect(options.headers).toEqual({ "If-None-Match": 'W/"selected-1"' });
      return new Response(null, { status: 304 });
    };
    const first = await fetchAihotSelected({ http, source: currentSource, now });
    await expect(fetchAihotSelected({ http, source: currentSource, now })).resolves.toHaveLength(1);
    expect(calls).toBe(1);
    nowValue += 61_000;
    const second = await fetchAihotSelected({ http, source: currentSource, now });
    expect(calls).toBe(2);
    expect(second[0]).toMatchObject({ id: first[0].id, title: first[0].title });
    expect(second[0].fetchedAt).not.toBe(first[0].fetchedAt);
  });

  it("AIHOT 遇到 429 后按 Retry-After 暂停请求", async () => {
    const currentSource = source("aihot-topics");
    let nowValue = 1_800_000_000_000;
    let calls = 0;
    const http = async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error("上游返回 HTTP 429"), { statusCode: 429, retryAfterMs: 120_000 });
      return response(fixture("aihot-hot-topics.json"));
    };
    const context = { http, source: currentSource, now: () => nowValue };
    await expect(fetchAihotTopics(context)).rejects.toThrow("HTTP 429");
    nowValue += 60_000;
    await expect(fetchAihotTopics(context)).rejects.toMatchObject({ code: "UPSTREAM_BACKOFF" });
    expect(calls).toBe(1);
    nowValue += 60_000;
    await expect(fetchAihotTopics(context)).resolves.toHaveLength(1);
  });

  it("AIHOT 拒绝异常结构和无效原文链接", async () => {
    const context = { source: source("aihot-selected") };
    await expect(fetchAihotSelected({ ...context, http: async () => response("{}") })).rejects.toThrow("结构异常");
    const payload = JSON.parse(fixture("aihot-items.json"));
    payload.items[0].links.original = "file:///tmp/item";
    const warnings = [];
    await expect(fetchAihotSelected({ ...context, logger: { warn: (fields) => warnings.push(fields) }, http: async () => response(JSON.stringify(payload)) })).rejects.toThrow("无有效条目");
    expect(warnings).toEqual([{ sourceId: "aihot-selected", invalidCount: 1 }]);
    await expect(fetchAihotSelected({ ...context, http: async () => response('{"schemaVersion":1,"items":[]}') })).rejects.toThrow("空数据");
  });

  it("注册 20 个来源且豆瓣默认开启、AIHOT 默认关闭", () => {
    const definitions = createSourceDefinitions(loadEnv({ NODE_ENV: "test" }));
    const registry = createSourceRegistry(definitions);
    expect(definitions).toHaveLength(20);
    expect(registry.list()).toHaveLength(18);
    expect(registry.get("douban-movies")).toMatchObject({ category: "entertainment", enabled: true });
    expect(registry.get("douban-tv")).toMatchObject({ category: "entertainment", enabled: true });
    expect(registry.get("wikipedia-zh")).toMatchObject({ category: "china", enabled: true });
    expect(registry.get("aihot-selected")).toMatchObject({ category: "ai", enabled: false });
    expect(registry.get("aihot-topics")).toMatchObject({ category: "ai", enabled: false });
    expect(registry.list().every((definition) => !("feedUrl" in definition) && !("endpoint" in definition))).toBe(true);
    expect(definitions.every((definition) => typeof registry.adapter(definition.id) === "function")).toBe(true);
    const enabled = createSourceRegistry(createSourceDefinitions(loadEnv({ NODE_ENV: "test", SOURCE_AIHOT_SELECTED_ENABLED: "true", SOURCE_AIHOT_TOPICS_ENABLED: "true" })));
    expect(enabled.list().filter((entry) => entry.category === "ai")).toHaveLength(2);
  });
});
