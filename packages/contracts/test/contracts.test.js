import { describe, expect, it } from "vitest";
import { assertUniqueSources, healthResponseSchema, hotItemSchema, sanitizeTitle, sourceDefinitionSchema } from "../src/index.js";

const source = {
  id: "hackernews",
  name: "Hacker News",
  category: "tech",
  homeUrl: "https://news.ycombinator.com",
  refreshIntervalMs: 300_000,
  timeoutMs: 8_000,
  enabled: true,
  riskLevel: "low",
  dataMethod: "official-api",
};

describe("共享契约", () => {
  it("接受合法来源和热点条目", () => {
    expect(sourceDefinitionSchema.parse(source).id).toBe("hackernews");
    expect(hotItemSchema.parse({
      id: "1",
      sourceId: "hackernews",
      title: "真实标题",
      url: "https://example.com/a",
      rank: 1,
      fetchedAt: new Date().toISOString(),
    }).score).toBeNull();
  });

  it("接受 AI 分类和来源署名，拒绝无效署名链接", () => {
    expect(sourceDefinitionSchema.parse({ ...source, category: "ai" }).category).toBe("ai");
    const item = { id: "a", sourceId: "aihot-selected", title: "AI 资讯", url: "https://example.com/a", rank: 1, fetchedAt: new Date().toISOString(), originalSourceName: "原始信源", attribution: { name: "AIHOT", url: "https://aihot.news/items/a" } };
    expect(hotItemSchema.parse(item).attribution?.name).toBe("AIHOT");
    expect(() => hotItemSchema.parse({ ...item, attribution: { name: "AIHOT", url: "file:///tmp/a" } })).toThrow();
  });

  it("拒绝非 HTTP URL 和重复来源", () => {
    expect(() => sourceDefinitionSchema.parse({ ...source, homeUrl: "file:///etc/passwd" })).toThrow();
    expect(() => assertUniqueSources([source, source])).toThrow("数据源 ID 重复");
  });

  it("清理控制字符并限制标题", () => {
    expect(sanitizeTitle("  A\n\tB  ")).toBe("A B");
    expect(sanitizeTitle("x".repeat(400))).toHaveLength(300);
  });

  it("健康可用率限制在 0 到 1", () => {
    const base = { status: "healthy", timestamp: new Date().toISOString(), uptimeSeconds: 1, database: "ok", sources: { total: 1, fresh: 1, stale: 0, error: 0, unknown: 0 } };
    expect(healthResponseSchema.parse({ ...base, sources: { ...base.sources, availabilityRatio: 1 } }).sources.availabilityRatio).toBe(1);
    expect(() => healthResponseSchema.parse({ ...base, sources: { ...base.sources, availabilityRatio: 2 } })).toThrow();
  });
});
