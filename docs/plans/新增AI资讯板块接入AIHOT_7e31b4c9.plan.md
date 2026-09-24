---
name: 新增 AI 资讯板块接入 AIHOT
overview: 沿用现有“分类标签 + 来源卡片”结构，新增 AI 分类及 AIHOT 精选、AIHOT 热点榜两个来源。服务端适配 AIHOT v1 API，保留来源标识、条件请求与现有失败降级；公开启用以使用范围确认为前提。
isProject: false
---

# 新增 AI 资讯板块接入 AIHOT 实现计划

## 需求理解

- **目标**：首页增加“AI 资讯”板块，让用户分别查看 AIHOT 近期精选和当前热点榜，点开条目可到原始来源，并能识别 AIHOT 及原始信源。
- **现状**：`apps/web/src/App.vue` 用固定分类标签筛选服务端来源；`apps/api/src/config/sources.js`、`apps/api/src/sources/registry.js` 定义和注册来源，所有来源经 `hot-service.js` 的缓存、熔断和快照降级后进入 `/api/v1/sources` 与 `/api/v1/batch`。`packages/contracts/src/index.js` 的分类枚举尚无 `ai`，条目也没有单条原始信源和聚合方署名字段。现有 15 个来源、Vitest fixture、Fastify inject、Vue Test Utils 与 Playwright 用例可复用。
- **外部契约**：2026-09-23 实测 `GET /api/v1/items?mode=selected&window=24h&limit=20` 与 `GET /api/v1/hot-topics` 均返回 200。前者为最近窗口精选，后者是至多 10 条的当前榜单；均支持 ETag，响应 `Cache-Control` 当前含 `s-maxage=60`。字段与错误以 [AIHOT OpenAPI 3.1](https://aihot.news/openapi-v1.json) 为准；[接入说明](https://aihot.news/agent?tab=api) 要求 429 遵守 `Retry-After`，并说明 `/api/public/*` 将停服，因此直接使用 v1。
- **约束**：[AIHOT 使用规则](https://aihot.news/terms)允许一定范围的个人、公益非商业和组织内部用途；对外商业服务、公开镜像、批量再分发，以及向第三方提供机器可读能力均需事先取得书面授权。当前项目已有公网地址，且 `/api/v1/hot/:sourceId`、`/api/v1/batch` 会公开返回来源数据，因此生产启用须有覆盖这一接口用途的书面授权。实施时新增来源默认关闭；不把 API 匿名可用视为使用许可。现有 README 写明“不依赖参考站 API”，接入后须修订这一事实描述。
- **方案**：新增 `ai` 分类和两张来源卡片：`aihot-selected` 展示 24 小时精选，`aihot-topics` 展示当前榜单。两张卡片各有独立来源开关、缓存和故障状态；不引入详情页、全量 snapshot/changes 同步或新的数据库。`items` 的 0–100 `score` 是 AIHOT 内容评分，不写入本项目表示热度的 `score`；`hot-topics` 的 `sourceCount`、`signalCount` 也不伪装为热度。榜单继续使用上游 `rank`。

## 一、扩展契约、配置和来源注册

涉及文件：`packages/contracts/src/index.js`、`packages/contracts/test/contracts.test.js`、`apps/api/src/config/env.js`、`apps/api/src/config/sources.js`、`apps/api/src/sources/registry.js`、`.env.example`。

1. 给 `categorySchema` 加 `ai`；为 `hotItemSchema` 增加可选的原始信源名称、AIHOT 署名名称和链接字段，旧来源不受影响。URL 仍限定 HTTP/HTTPS。这样从 AIHOT 返回的 `source.name`、`attribution.name/url` 能经过本项目 API 完整传递。
2. 增加 `SOURCE_AIHOT_SELECTED_ENABLED` 和 `SOURCE_AIHOT_TOPICS_ENABLED`，默认 `false`。在来源定义中登记独立 ID、AI 分类、AIHOT 主页、`public-api`、超时和刷新周期；注册两个专用适配器。建议常规刷新周期 5 分钟，实际不得低于响应 `s-maxage`。配置关闭时 `/api/v1/sources` 不展示它们，现有来源保持原顺序和响应兼容。
3. 更新来源数量与分类契约测试，断言两个适配器已注册、默认关闭、显式开启后可被 `/api/v1/sources` 返回。

## 二、接入 AIHOT v1 并处理条件请求

涉及文件：拟新增 `apps/api/src/sources/aihot.js`，`apps/api/src/lib/http-client.js`，必要时 `apps/api/src/services/hot-service.js`，拟新增 `apps/api/test/fixtures/upstreams/aihot-items.json`、`apps/api/test/fixtures/upstreams/aihot-hot-topics.json`，`apps/api/test/sources.test.js`、`apps/api/test/services.test.js`。

1. 精选固定请求 `mode=selected&window=24h&limit=20`，不传滚动 `cursor`；映射 `id/title/links.original/source.name/attribution/publishedAt/summary`。原文链接无效的条目跳过并记录可诊断错误；全部无效按现有空数据失败处理。AIHOT `summary` 是 AI 生成内容，页面标注其来源，且不抓取正文。
2. 热点榜请求 `/api/v1/hot-topics`，映射 `rank/id/title/links.original/source.name`；可将 `sourceCount` 作为明确标注的“信源数”附加信息展示，不能写入 `score`。`latestAt` 是事件最新信号时间，不能冒充原文发表时间；不调用 `links.story` HTML 地址充当 API。
3. 为固定 URL 保存最近成功响应的 ETag 和条目，后续同 URL 发 `If-None-Match`；304 复用对应成功条目并更新本项目快照时间。若进程重启或没有同 URL 成功数据，发送普通 GET。现有通用 HTTP 客户端把 304 当错误，需增加限定于该适配器的“允许 304”能力，避免改变其他来源行为。不要通过动态时间戳或无关参数破坏 ETag 命中。
4. 对 429 尊重 `Retry-After`：在规定时间前拒绝该来源再次请求，交给现有快照降级；通用客户端不得对 AIHOT 的 429 立即重试。5xx 沿用有界退避，失败时沿用 24 小时内真实快照。缓存元数据先放在适配器进程内；重启后一次普通 GET 即可恢复，无需 SQLite 迁移。避免把 AIHOT 的 Problem JSON 正文或整批条目写入日志。
5. 用裁剪后的真实响应 fixture 验证字段映射、缺少可选字段、非法链接、304、429 `Retry-After`、5xx 和空数据；通过现有服务测试确认旧快照降级及单源失败不影响其他来源。

## 三、增加 AI 分类与可辨认的署名

涉及文件：`apps/web/src/App.vue`、`apps/web/src/components/HotItemRow.vue`、`apps/web/src/components/SourceCard.vue`、`apps/web/src/components/CategoryTabs.test.js`、`apps/web/src/components/SourceCard.test.js`、`tests/e2e/news-spot.spec.js`；如布局需要，仅调整 `apps/web/src/styles/global.less`。

1. 在现有标签中加入“AI 资讯”，计数继续表示已启用来源数。使用现有网格、紧凑布局、加载、旧快照、错误、搜索和单源刷新状态；默认关闭时不显示空的 AI 标签，启用后出现两张卡片。“全部”分类仍按现有来源顺序呈现。
2. 每条 AIHOT 内容保留点击原文的主链接；在次要文案展示原始信源，并给出可访问的 AIHOT 条目/署名链接。精选摘要明确标识为 AIHOT 提供的摘要；其他来源维持现有显示。榜单如展示信源数，必须使用新字段及明确标签，不能显示为“热度”。
3. 扩展组件和浏览器用例：AI 标签切换、两来源计数、原文与署名链接、精选和榜单区别、窄屏无横向溢出、单源失败时另一张卡片可用。

## 四、文档与启用门禁

涉及文件：`README.md`、`.env.example`、必要时 `apps/api/scripts/smoke.js`。

1. README 写明 AIHOT 两个 v1 端点、接口来源、摘要属性、刷新/ETag/429 策略、默认关闭开关、回退方法和 AIHOT 使用规则链接；修订“不依赖参考站 API”这句已过时描述。
2. 上线前取得覆盖本站公网页面及公开 JSON 接口的 AIHOT 明确书面授权，且上线展示方式、请求量和缓存范围遵守授权条件。未确认时保持两个生产开关关闭。启用后分别运行在线 smoke 并观察 `/api/v1/metrics`、`/api/v1/health`；单源异常直接关闭对应开关并重启，不清空 SQLite 卷。

## 完整需求专项检查

- **接口 Mock**：项目已有 `apps/api/test/fixtures/upstreams/` 和可注入的 `http`/`fetchImpl`，另有前端 composable 假 API 与 Playwright 路由拦截。新增两个经过裁剪的 AIHOT fixture 和异常响应即可验证业务链路；生产页面继续只使用真实上游成功数据或真实成功快照。
- **单元测试**：项目已配置 Vitest、Vue Test Utils 和 Fastify inject。以适配器解析、条件请求、限流退避、来源开关及 UI 署名为主要自验收；端到端和在线 smoke 用于补充跨层行为与真实连通性。

## 验证顺序

1. `pnpm --filter @news-spot/contracts test && pnpm --filter @news-spot/api test && pnpm --filter @news-spot/web test`，覆盖字段映射、304、429、异常降级和分类/链接组件。
2. `pnpm typecheck && pnpm lint`；再运行 `PLAYWRIGHT_HTML_OPEN=never pnpm test:e2e` 检查双卡片与窄屏交互。
3. 在显式开启两个来源的非生产环境，调用 `/api/v1/sources` 与 `/api/v1/batch?sources=aihot-selected,aihot-topics&limit=12`；检查各自非空、链接指向原文、署名可见。重复请求确认条件请求可得到 304，模拟 429 后确认没有即时重试。
4. 使用范围确认后才做生产启用与在线 smoke；任何授权或连通性问题都保持开关关闭。

## 明确不做

- 不同步 AIHOT 全部历史精选，不建本地镜像、全文库、代理 API 或批量导出；`items` 的 24 小时窗口只用于近期卡片。
- 不接入日报、Codex resets、story 详情、RSS 或 MCP；这些需要独立的产品形态与权限评估。
- 不引入新的生产 Mock、账号、密钥、数据库迁移或新的视觉设计体系。

## 已确认项

- 用户于执行阶段确认，已取得 AIHOT 对本站公网展示及公开 JSON 接口的书面授权；据此启用了两个生产来源。

## 实施跟踪规则

- 实施过程中以本文末尾 TODO 为进度依据。
- 开始任务前先读取 TODO；每完成一个可独立验收的交付项并通过相关验证后，立即将对应的 `- [ ]` 更新为 `- [x]`。
- 不要等全部开发结束后一次性勾选，不得在缺少验证结果时提前勾选。
- 遇到阻塞时保持未勾选，并在该项后补充阻塞原因。
- 新发现的必要工作应补充为新的 checkbox，不得删除未完成事项。

## TODO

- [x] 扩展 AI 分类、条目署名契约和两个默认关闭的来源开关，完成契约与来源注册测试。
- [x] 实现两个 AIHOT v1 适配器及 ETag、304、429 处理，完成 fixture 和服务层测试。
- [x] 加入 AI 标签、双卡片及原始信源/AIHOT 署名展示，完成组件与端到端验证。
- [x] 更新 README 和环境示例，完成类型检查、lint 与非生产真实接口检查。
- [x] 用户确认已取得覆盖本站公网展示及 JSON 接口的书面授权；已启用生产开关并发布 `news-spot:20260923091304`。公网批量接口返回精选 12 条、热点榜 10 条，均为 fresh；两个来源指标各有 1 次成功、0 次失败，手机端真实页面显示两张卡片且无溢出或脚本错误。
