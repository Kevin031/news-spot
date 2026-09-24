import { assertUniqueSources } from "@news-spot/contracts";

export function createSourceDefinitions(env) {
  return assertUniqueSources([
    { id: "hackernews", name: "Hacker News", category: "tech", homeUrl: "https://news.ycombinator.com", refreshIntervalMs: 300_000, timeoutMs: 8_000, enabled: env.SOURCE_HACKERNEWS_ENABLED, riskLevel: "low", dataMethod: "official-api" },
    { id: "v2ex", name: "V2EX 热门", category: "tech", homeUrl: "https://www.v2ex.com", refreshIntervalMs: 600_000, timeoutMs: 8_000, enabled: env.SOURCE_V2EX_ENABLED, riskLevel: "low", dataMethod: "public-api" },
    { id: "github", name: "GitHub 新锐项目", category: "tech", homeUrl: "https://github.com", refreshIntervalMs: 600_000, timeoutMs: 8_000, enabled: env.SOURCE_GITHUB_ENABLED, riskLevel: "low", dataMethod: "official-api" },
    { id: "bbc", name: "BBC World", category: "world", homeUrl: "https://www.bbc.com/news/world", refreshIntervalMs: 900_000, timeoutMs: 8_000, enabled: env.SOURCE_BBC_ENABLED, riskLevel: "low", dataMethod: "rss" },
    { id: "ithome", name: "IT之家", category: "china", homeUrl: "https://www.ithome.com", refreshIntervalMs: 600_000, timeoutMs: 8_000, enabled: env.SOURCE_ITHOME_ENABLED, riskLevel: "low", dataMethod: "rss" },
    { id: "bilibili", name: "哔哩哔哩排行榜", category: "china", homeUrl: "https://www.bilibili.com", refreshIntervalMs: 600_000, timeoutMs: 8_000, enabled: env.SOURCE_BILIBILI_ENABLED, riskLevel: "medium", dataMethod: "public-web-api" },
    { id: "devto", name: "DEV Community", category: "tech", homeUrl: "https://dev.to", refreshIntervalMs: 900_000, timeoutMs: 12_000, enabled: env.SOURCE_DEVTO_ENABLED, riskLevel: "low", dataMethod: "official-api" },
    { id: "stackoverflow", name: "Stack Overflow", category: "tech", homeUrl: "https://stackoverflow.com", refreshIntervalMs: 600_000, timeoutMs: 8_000, enabled: env.SOURCE_STACKOVERFLOW_ENABLED, riskLevel: "low", dataMethod: "official-api" },
    { id: "lobsters", name: "Lobsters", category: "tech", homeUrl: "https://lobste.rs", refreshIntervalMs: 600_000, timeoutMs: 8_000, enabled: env.SOURCE_LOBSTERS_ENABLED, riskLevel: "low", dataMethod: "rss" },
    { id: "sspai", name: "少数派", category: "china", homeUrl: "https://sspai.com", refreshIntervalMs: 900_000, timeoutMs: 8_000, enabled: env.SOURCE_SSPAI_ENABLED, riskLevel: "low", dataMethod: "rss" },
    { id: "solidot", name: "Solidot", category: "china", homeUrl: "https://www.solidot.org", refreshIntervalMs: 600_000, timeoutMs: 8_000, enabled: env.SOURCE_SOLIDOT_ENABLED, riskLevel: "low", dataMethod: "rss" },
    { id: "techcrunch", name: "TechCrunch", category: "tech", homeUrl: "https://techcrunch.com", refreshIntervalMs: 900_000, timeoutMs: 8_000, enabled: env.SOURCE_TECHCRUNCH_ENABLED, riskLevel: "low", dataMethod: "rss" },
    { id: "npr-world", name: "NPR World", category: "world", homeUrl: "https://www.npr.org/sections/world", refreshIntervalMs: 900_000, timeoutMs: 8_000, enabled: env.SOURCE_NPR_WORLD_ENABLED, riskLevel: "low", dataMethod: "rss" },
    { id: "marketwatch", name: "MarketWatch", category: "finance", homeUrl: "https://www.marketwatch.com", refreshIntervalMs: 900_000, timeoutMs: 8_000, enabled: env.SOURCE_MARKETWATCH_ENABLED, riskLevel: "low", dataMethod: "rss" },
    { id: "arstechnica", name: "Ars Technica", category: "tech", homeUrl: "https://arstechnica.com", refreshIntervalMs: 900_000, timeoutMs: 8_000, enabled: env.SOURCE_ARSTECHNICA_ENABLED, riskLevel: "low", dataMethod: "rss" },
    { id: "aihot-selected", name: "AIHOT 精选", category: "ai", homeUrl: "https://aihot.news", refreshIntervalMs: 300_000, timeoutMs: 8_000, enabled: env.SOURCE_AIHOT_SELECTED_ENABLED, riskLevel: "medium", dataMethod: "public-api" },
    { id: "aihot-topics", name: "AIHOT 热点榜", category: "ai", homeUrl: "https://aihot.news", refreshIntervalMs: 300_000, timeoutMs: 8_000, enabled: env.SOURCE_AIHOT_TOPICS_ENABLED, riskLevel: "medium", dataMethod: "public-api" },
  ]);
}
