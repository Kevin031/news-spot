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
  await page.route("**/api/v1/steam-deals?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    items: [{ id: "default", title: "快照游戏", url: "https://www.cheapshark.com/redirect?dealID=default", thumbnail: null, salePrice: 21, normalPrice: 42, discount: 50 }],
    hasMore: false, fetchedAt: "2026-08-21T09:00:00.000Z", stale: true,
  }) }));
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

test("响应式首页展示真实来源状态且无横向溢出", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hacker News" })).toBeVisible();
  await expect(page.getByLabel("Steam 游戏优惠").getByText("最近成功快照")).toBeVisible();
  await expect(page.getByText("暂时无法获取数据")).toBeVisible();
  await expect(page.locator(".source-card")).toHaveCount(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  if (testInfo.project.name === "desktop") {
    const first = await page.locator(".steam-deals").boundingBox();
    const second = await page.locator(".source-card").first().boundingBox();
    const error = await page.locator(".source-card--error").boundingBox();
    expect(Math.abs(first.height - second.height)).toBeLessThan(1);
    expect(error.height).toBeLessThan(400);
  }
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
    await expect(page.getByRole("button", { name: "切换布局" })).toHaveCount(1);
    await page.getByRole("button", { name: "切换布局" }).click();
    expect(await page.evaluate(() => localStorage.getItem("news-spot-layout"))).toBe("compact");
  }
  await page.getByRole("button", { name: "切换主题" }).click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  expect(await page.evaluate(() => localStorage.getItem("news-spot-theme"))).toBe("dark");
});

test("首页 Steam 优惠卡片展示缩略图、价格和 CheapShark 链接", async ({ page }, testInfo) => {
  const requests = [];
  await page.route("**/api/v1/steam-deals?**", (route) => {
    const url = new URL(route.request().url());
    requests.push(Object.fromEntries(url.searchParams));
    const pageNumber = Number(url.searchParams.get("pageNumber"));
    const count = pageNumber === 0 ? 8 : 1;
    route.fulfill({ contentType: "application/json", body: JSON.stringify({
      items: Array.from({ length: count }, (_, index) => ({
        id: `test%2B${pageNumber}-${index}%3D`, title: pageNumber === 0 && index === 0 ? "中文游戏 0-0" : `游戏 ${pageNumber}-${index}`,
        url: `https://www.cheapshark.com/redirect?dealID=test%2B${pageNumber}-${index}%3D`,
        salePrice: 9.9, normalPrice: 49, discount: 80,
        thumbnail: index === 0 ? "https://images.example.com/game.jpg" : null,
      })), hasMore: pageNumber === 0, fetchedAt: new Date().toISOString(), stale: false,
    }) });
  });
  await page.route("https://images.example.com/game.jpg", (route) => route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+iYxkAAAAASUVORK5CYII=", "base64") }));
  await page.goto("/");
  await expect.poll(() => page.locator(".steam-deal-row").count()).toBeGreaterThanOrEqual(8);
  await page.getByRole("tab", { name: /游戏优惠/ }).click();
  expect(requests[0]).toMatchObject({ pageNumber: "0" });
  await expect(page.getByRole("img", { name: "中文游戏 0-0 缩略图" })).toBeVisible();
  await expect(page.getByRole("img", { name: "游戏 0-1 暂无缩略图" })).toBeVisible();
  await expect(page.locator(".steam-deal-row").first().getByText("¥9.90")).toBeVisible();
  await expect(page.locator(".steam-deal-row").first().getByText("¥49.00")).toBeVisible();
  await expect(page.locator(".steam-deal-row").first().getByText("-80%")).toBeVisible();
  await expect(page.locator(".steam-deal-row").first().getByRole("link", { name: "中文游戏 0-0", exact: true })).toHaveAttribute("href", "https://www.cheapshark.com/redirect?dealID=test%2B0-0%3D");
  if (await page.locator(".steam-deal-row").count() === 8) {
    await page.evaluate(() => document.querySelector(".steam-list-end")?.scrollIntoView());
  }
  await expect(page.locator(".steam-deal-row")).toHaveCount(9);
  expect(requests[1].pageNumber).toBe("1");
  if (testInfo.project.name !== "mobile") {
    const dimensions = await page.locator(".steam-deals").evaluate((card) => ({ height: card.getBoundingClientRect().height, viewport: innerHeight, listHeight: card.querySelector(".steam-deal-list").clientHeight, contentHeight: card.querySelector(".steam-deal-list").scrollHeight }));
    expect(dimensions.height).toBeLessThanOrEqual(dimensions.viewport * 0.8 + 1);
    if (testInfo.project.name === "desktop") expect(dimensions.contentHeight).toBeGreaterThan(dimensions.listHeight);
  }
  await page.getByRole("tab", { name: /科技/ }).click();
  await page.getByRole("tab", { name: /游戏优惠/ }).click();
  expect(requests).toHaveLength(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("桌面热点卡片在 80vh 内独立滚动", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile");
  await page.route("**/api/v1/batch?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    timestamp: new Date().toISOString(),
    results: sources.map((source) => ({ ...result(source), items: Array.from({ length: 30 }, (_, index) => ({
      ...result(source).items[0], id: `${source.id}-${index}`, title: `${source.name} 热点 ${index}`,
    })) })),
    summary: { total: 8, success: 8, failed: 0, stale: 0 },
  }) }));
  await page.goto("/");
  const dimensions = await page.locator(".source-card").first().evaluate((card) => ({ height: card.getBoundingClientRect().height, viewport: innerHeight, listHeight: card.querySelector(".hot-list").clientHeight, contentHeight: card.querySelector(".hot-list").scrollHeight }));
  expect(dimensions.height).toBeLessThanOrEqual(dimensions.viewport * 0.8 + 1);
  expect(dimensions.contentHeight).toBeGreaterThan(dimensions.listHeight);
  await page.locator(".source-card .hot-list").first().evaluate((list) => { list.scrollTop = list.scrollHeight; });
  await expect(page.locator(".source-card").first().getByText("Hacker News 热点 29")).toBeVisible();
});

test("游戏优惠只读取本站快照接口", async ({ page }) => {
  const requests = [];
  page.on("request", (request) => {
    if (request.url().includes("cheapshark.com/api/") || request.url().includes("/steam-prices")) requests.push(request.url());
  });
  await page.route("**/api/v1/steam-deals?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    items: [{ id: "deal", title: "快照游戏", url: "https://www.cheapshark.com/redirect?dealID=deal", thumbnail: null, salePrice: 21, normalPrice: 42, discount: 50 }],
    hasMore: false, fetchedAt: new Date().toISOString(), stale: true,
  }) }));
  await page.goto("/");
  await expect(page.getByText("快照游戏")).toBeVisible();
  await expect(page.getByLabel("Steam 游戏优惠").getByText("最近成功快照")).toBeVisible();
  expect(requests).toEqual([]);
});
