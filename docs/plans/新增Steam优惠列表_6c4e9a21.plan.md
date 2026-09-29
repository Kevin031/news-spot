---
name: 新增 Steam 优惠列表
overview: 使用 CheapShark Deals 接口发现 Steam 在售折扣，再批量查询 Steam 中国区实际人民币价格与折扣，并通过 CheapShark 跳转到优惠。
isProject: false
---

# 新增 Steam 优惠列表实现计划

## 需求理解

- **目标**：首页提供 Steam 国区优惠列表，每个游戏有缩略图或明确的图片缺失占位，并显示人民币价格。
- **现状**：首页按新闻来源分类，来源数据由后端 Worker 定时写入 SQLite；前端有 Vue 分类标签、卡片和 Vitest、Playwright 测试。尚无游戏优惠页面或游戏数据模型。
- **接口事实**：CheapShark `GET /api/1.0/deals` 支持 `storeID=1`（Steam）、`onSale=1`、零基页码、最多 60 条的 `pageSize`；响应提供 `thumb`、`salePrice`、`normalPrice`、`savings`、`dealID`。价格单位是 USD。优惠点击必须使用 `https://www.cheapshark.com/redirect?dealID={id}`。接口支持 CORS，并建议浏览器直接请求；自动化批量采集可能触发限流。
- **方案**：根据后续反馈，首页“全部”直接展示 Steam 优惠列表卡片；浏览器先从 CheapShark 获取每批 8 条和 `steamAppID`，本站后端再批量查询 Steam `cc=cn` 价格，并逐个查询简体中文名，仅展示国区真实折扣。“游戏优惠”分类用于筛选。滚动自动续页，保留本次访问的数据并支持失败重试。PC 卡片最高 80vh，内容在卡片内滚动。新闻 API、Worker 与来源可用数保持原有语义。

## 一、接口和数据转换

拟新增：`apps/web/src/services/cheapshark.js`、`apps/web/src/services/cheapshark.test.js`

1. 固定请求 Steam 的在售 Deals，使用 `pageNumber` 和 `pageSize=8`；处理 HTTP 错误、非数组数据和中断。
2. 将字符串价格与折扣转为有限数字，只接纳 Steam 在售条目；规范化已编码 `dealID` 用于 CheapShark redirect；只允许 HTTPS 缩略图，缺失时保留占位状态。
3. 单元测试覆盖请求参数、典型映射、非法数据、URL 编码及上游错误。

## 二、列表界面

拟新增：`apps/web/src/components/SteamDeals.vue`
修改：`apps/web/src/App.vue`、`apps/web/src/styles/global.less`

1. 分类标签新增“游戏优惠”；首页卡片首次显示后加载数据，切换分类保留结果，避免重复请求。
2. 每项显示缩略图、优先显示简体中文名、折扣、现价、原价和优惠链接；图片加载失败显示占位。说明 Steam 国区人民币价格及 CheapShark 来源。
3. 提供加载、空列表、请求失败重试和滚动自动续页状态；移动端不产生横向溢出。

## 三、Steam 中国区价格

涉及文件：`apps/api/src/services/steam-price-service.js`、`apps/api/src/routes/steam-prices.js`、`apps/api/src/app.js`、`apps/api/src/route-schemas.js`、`apps/web/src/services/cheapshark.js`、`apps/web/src/components/SteamDeals.vue`

1. 后端验证最多 8 个纯数字 App ID，批量请求 Steam `appdetails?cc=cn&filters=price_overview`，将分单位金额短时缓存；请求失败返回明确错误。
2. 前端用 CheapShark 提供的 App ID 查询国区价格，只展示 `currency=CNY` 且 `discount_percent>0` 的游戏。没有国区售价或国区并未促销的记录不显示，不做汇率换算；全批过滤后仍可加载下一批。
3. 缩略图和发现数据仍来自 CheapShark，优惠入口继续使用其 redirect 链接，价格说明改为 Steam 国区人民币。

## 完整需求专项检查

- **接口 Mock**：现有 Playwright `page.route` 用于浏览器端接口模拟；新增 CheapShark 路由用例，覆盖列表、图片与滚动续页。生产页面始终请求真实接口，不使用 Mock 填充。
- **单元测试**：项目已配置 Vitest；转换和失败分支作为主要自验收。

## 验证顺序

1. `pnpm --filter @news-spot/web test`
2. `pnpm lint && pnpm typecheck && pnpm build`
3. `PLAYWRIGHT_HTML_OPEN=never pnpm test:e2e`，检查移动、平板、桌面布局与入口、缩略图、跳转链接。

## 明确不做

- 不建立价格历史数据库或定时抓取 CheapShark；接口文档建议按用户浏览请求。
- 不把 Steam 商店链接作为优惠主链接；CheapShark 要求使用 redirect。
- 不做美元对人民币的汇率换算；人民币价格直接来自 Steam 国区接口。

## 实施跟踪规则

- 实施过程中以本文末尾 TODO 为进度依据。
- 开始任务前先读取 TODO；每完成一个可独立验收的交付项并通过相关验证后，立即将对应的 `- [ ]` 更新为 `- [x]`。
- 不要等全部开发结束后一次性勾选，不得在缺少验证结果时提前勾选。
- 遇到阻塞时保持未勾选，并在该项后补充阻塞原因。
- 新发现的必要工作应补充为新的 checkbox，不得删除未完成事项。

## TODO

- [x] 接口请求和数据转换通过单元测试。
- [x] 游戏优惠分类、缩略图列表及交互通过浏览器用例。
- [x] 项目 lint、类型检查、构建及相关测试通过。
- [x] 根据用户反馈将 Steam 优惠改为首页列表卡片，验证首页可见、缩略图和响应式布局。
- [x] 添加 Steam 国区价格批量查询接口及短时缓存，通过后端测试。
- [x] 将首页价格和折扣切换为 Steam 国区真实数据，通过前端和响应式浏览器测试。
- [x] 更新说明，并通过完整 lint、类型检查、单元测试和构建。
- [x] 优先显示 Steam 简体中文游戏名，保留英文回退；服务端名称查询与缓存通过单元测试。
- [x] PC 卡片最高 80vh 并在卡片内滚动；Steam 滚动自动续页并通过响应式浏览器测试。
