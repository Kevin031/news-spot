import { expect, test } from "@playwright/test";

const sources = [
  { id: "hackernews", name: "Hacker News", category: "tech", homeUrl: "https://news.ycombinator.com", status: "unknown", stale: false, lastSuccessAt: null, lastError: null },
  { id: "v2ex", name: "V2EX 热门", category: "tech", homeUrl: "https://www.v2ex.com", status: "unknown", stale: false, lastSuccessAt: null, lastError: null },
  { id: "github", name: "GitHub 新锐项目", category: "tech", homeUrl: "https://github.com", status: "unknown", stale: false, lastSuccessAt: null, lastError: null },
  { id: "bbc", name: "BBC World", category: "world", homeUrl: "https://www.bbc.com/news/world", status: "unknown", stale: false, lastSuccessAt: null, lastError: null },
  { id: "ithome", name: "IT之家", category: "china", homeUrl: "https://www.ithome.com", status: "unknown", stale: false, lastSuccessAt: null, lastError: null },
  { id: "bilibili", name: "哔哩哔哩排行榜", category: "china", homeUrl: "https://www.bilibili.com", status: "unknown", stale: false, lastSuccessAt: null, lastError: null },
  { id: "aihot-selected", name: "AIHOT 精选", category: "ai", homeUrl: "https://aihot.news", status: "unknown", stale: false, lastSuccessAt: null, lastError: null },
  { id: "aihot-topics", name: "AIHOT 热点榜", category: "ai", homeUrl: "https://aihot.news", status: "unknown", stale: false, lastSuccessAt: null, lastError: null },
];

function result(source, status = "fresh") {
  const success = status !== "error";
  return {
    sourceId: source.id, sourceName: source.name, success, status, stale: status === "stale",
    staleReason: status === "stale" ? "上游超时" : null,
    lastSuccessAt: "2026-08-21T09:00:00.000Z", fetchedAt: "2026-08-21T09:00:00.000Z",
    items: success ? [{ id: `${source.id}-1`, sourceId: source.id, title: `${source.name} 真实热点`, url: `https://example.com/${source.id}`, rank: 1, score: source.category === "ai" ? null : 100, summary: source.id === "aihot-selected" ? "AIHOT 提供的摘要" : source.id === "aihot-topics" ? null : "来自公开上游的数据", publishedAt: null, fetchedAt: "2026-08-21T09:00:00.000Z", ...(source.category === "ai" ? { originalSourceName: "原始信源", attribution: { name: "AIHOT", url: `https://aihot.news/items/${source.id}-1` } } : {}), ...(source.id === "aihot-topics" ? { sourceCount: 7 } : {}) }] : [],
    error: success ? null : { code: "SOURCE_UNAVAILABLE", message: "上游暂时不可用", retryable: true },
  };
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/sources", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ timestamp: new Date().toISOString(), sources }) }));
  await page.route("**/api/v1/batch?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    timestamp: new Date().toISOString(),
    results: sources.map((source, index) => result(source, index === 3 ? "stale" : index === 5 ? "error" : "fresh")),
    summary: { total: 8, success: 7, failed: 1, stale: 1 },
  }) }));
  await page.route("**/api/v1/hot/**", (route) => {
    const id = new URL(route.request().url()).pathname.split("/").pop();
    const source = sources.find((item) => item.id === id);
    route.fulfill({ contentType: "application/json", body: JSON.stringify(result(source)) });
  });
  await page.route("**/api/v1/fetch-logs?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [{ id: 1, sourceId: "hackernews", trigger: "scheduled", startedAt: "2026-09-23T01:00:00Z", finishedAt: "2026-09-23T01:00:01Z", status: "success", itemCount: 20, errorCode: null }], nextCursor: null, latestSlot: { key: "2026-09-23T09:00", status: "completed", success: 8, failed: 0, total: 8 } }) }));
});

test("响应式首页展示真实来源状态且无横向溢出", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hacker News" })).toBeVisible();
  await expect(page.getByText("最近成功快照")).toBeVisible();
  await expect(page.getByText("暂时无法获取数据")).toBeVisible();
  await expect(page.locator(".source-card")).toHaveCount(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("页面重载只请求已保存数据，抓取日志按钮在移动端可用", async ({ page }) => {
  const hotUrls = [];
  page.on("request", (request) => { if (request.url().includes("/api/v1/hot/")) hotUrls.push(request.url()); });
  await page.goto("/");
  await page.getByRole("button", { name: "重新加载全部来源" }).click();
  await expect.poll(() => hotUrls.length).toBe(8);
  expect(hotUrls.every((url) => !url.includes("refresh=true"))).toBe(true);
  await page.getByRole("button", { name: "抓取日志" }).click();
  const dialog = page.getByRole("dialog", { name: "抓取日志" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("listitem").getByText("Hacker News")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("AI 资讯板块区分精选与热点榜并保留来源链接", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: /AI 资讯/ }).click();
  await expect(page.locator(".source-card")).toHaveCount(2);
  await expect(page.getByText("AIHOT 摘要：AIHOT 提供的摘要")).toBeVisible();
  await expect(page.getByText("7 个信源")).toBeVisible();
  const selected = page.locator(".source-card").filter({ hasText: "AIHOT 精选" });
  await expect(selected.locator(".hot-main-link")).toHaveAttribute("href", "https://example.com/aihot-selected");
  await expect(selected.locator(".hot-provenance a")).toHaveAttribute("href", "https://aihot.news/items/aihot-selected-1");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("AIHOT 一张卡片失败时另一张仍可浏览", async ({ page }) => {
  await page.route("**/api/v1/batch?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    timestamp: new Date().toISOString(),
    results: sources.map((source) => result(source, source.id === "aihot-topics" ? "error" : "fresh")),
    summary: { total: sources.length, success: sources.length - 1, failed: 1, stale: 0 },
  }) }));
  await page.goto("/");
  await page.getByRole("tab", { name: /AI 资讯/ }).click();
  await expect(page.locator(".source-card")).toHaveCount(2);
  await expect(page.getByText("暂时无法获取数据")).toBeVisible();
  await expect(page.locator(".source-card").filter({ hasText: "AIHOT 精选" }).locator(".hot-main-link")).toBeVisible();
});

test("未启用 AIHOT 时隐藏空的 AI 资讯分类", async ({ page }) => {
  await page.route("**/api/v1/sources", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ timestamp: new Date().toISOString(), sources: sources.filter((source) => source.category !== "ai") }) }));
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /AI 资讯/ })).toHaveCount(0);
  await expect(page.locator(".source-card")).toHaveCount(6);
});

test("分类、搜索、布局和主题可操作并持久化", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("tab", { name: /科技/ }).click();
  await expect(page.locator(".source-card")).toHaveCount(3);

  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  await expect(page.getByRole("dialog", { name: "搜索热点" })).toBeVisible();
  await page.getByPlaceholder("输入热点关键词").fill("Hacker News");
  await expect(page.getByRole("dialog").getByText("Hacker News 真实热点")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "关闭" }).click();

  if (testInfo.project.name === "desktop") {
    await page.getByRole("button", { name: "切换布局" }).click();
    expect(await page.evaluate(() => localStorage.getItem("news-spot-layout"))).toBe("compact");
  }
  await page.getByRole("button", { name: "切换主题" }).click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  expect(await page.evaluate(() => localStorage.getItem("news-spot-theme"))).toBe("dark");
});
