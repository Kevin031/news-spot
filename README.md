# News Spot

News Spot 是一个只展示真实上游数据的热点聚合站。前端使用 Vite 8、Vue 3 和 Less，API 使用 Fastify；数据源失败时会明确显示最近成功快照或错误，不会用 Mock 数据填充生产页面。

[作者演示站](https://hot-spots.kevinlau.cn) · [演示站 API 文档](https://hot-spots.kevinlau.cn/api/docs) · [演示站 OpenAPI JSON](https://hot-spots.kevinlau.cn/api/openapi.json)

这是可自行部署的项目。上述站点由作者维护，仅供体验；部署者可使用自己的域名、端口和环境配置。

## 目录

- [已接入来源](#已接入来源)
- [本地开发](#本地开发)
- [验证命令](#验证命令)
- [API](#api)
- [定时抓取与失败策略](#定时抓取与失败策略)
- [Docker 部署](#docker-部署)
- [环境变量](#环境变量)
- [告警建议](#告警建议)
- [使用边界](#使用边界)

## 已接入来源

| 来源 | 获取方式 | 风险等级 |
| --- | --- | ---: |
| Hacker News | 官方 Firebase API | 低 |
| V2EX | 公开 API | 低 |
| GitHub 新锐项目 | 官方 REST Search API | 低 |
| BBC World | 官方 RSS | 低 |
| IT之家 | 官方站 RSS | 低 |
| 哔哩哔哩排行榜 | 公开 Web JSON 接口 | 中 |
| 豆瓣热门电影 | 豆瓣选电影公开列表接口 | 中 |
| 豆瓣热门电视剧 | 豆瓣选剧集公开列表接口 | 中 |
| DEV Community | 官方 Forem API | 低 |
| Stack Overflow | 官方 Stack Exchange API | 低 |
| 中文维基热点 | Wikimedia Analytics 官方页面浏览量 API | 低 |
| Lobsters | 站点 RSS | 低 |
| 少数派 | 站点 RSS | 低 |
| Solidot | 站点 RSS | 低 |
| TechCrunch | 站点 RSS | 低 |
| NPR World | 官方站 RSS | 低 |
| MarketWatch | 站点 Top Stories RSS | 低 |
| Ars Technica | 站点 RSS | 低 |
| AIHOT 精选（默认关闭） | AIHOT v1 公开 API | 中 |
| AIHOT 热点榜（默认关闭） | AIHOT v1 公开 API | 中 |

Bilibili 接口可能返回风控状态。服务不会尝试绕过访问控制；已有成功快照时标记为旧数据继续展示，冷启动失败时显示来源不可用。

豆瓣电影和电视剧分别展示在“影视”分类的两个卡片中，按豆瓣热门列表顺序排列；列表展示作品海报，评分固定在右侧以黄色文字显示，不作为热度分数。豆瓣接口可能限制访问，失败时沿用已有成功快照或显示来源不可用。可分别用 `SOURCE_DOUBAN_MOVIES_ENABLED=false`、`SOURCE_DOUBAN_TV_ENABLED=false` 关闭。

中文维基热点读取 `zh.wikipedia.org` 的每日最多浏览词条，过滤首页、搜索页等非词条页面。榜单按 UTC 日期结算，当前读取前日数据以避开生成延迟；每条显示统计日期和真实浏览量。它表示词条关注度，不代表新闻事件热度。请求会按 [Wikimedia Analytics API 访问规则](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/documentation/access-policy.html) 携带可识别的 User-Agent，可用 `SOURCE_WIKIPEDIA_ZH_ENABLED=false` 关闭。

部署时可根据目标机的实际连通性独立启停来源：

- 作者演示站所在的腾讯云服务器上，V2EX 和 BBC 连续失败时通过 `SOURCE_*_ENABLED=false` 暂停。
- 作者演示站保持 Bilibili 启用；能取得真实数据时正常展示，失败时显示旧快照或错误，并排到当前分类底部。
- MarketWatch 等 RSS 来源只使用 feed 返回的标题、摘要和原文链接，不抓取正文或绕过付费限制。

### AI 资讯板块

AI 资讯分类使用 [AIHOT v1 接口](https://aihot.news/agent?tab=api)：

| 内容 | 接口 |
| --- | --- |
| 近期精选 | `GET /api/v1/items?mode=selected&window=24h&limit=20` |
| 当前热点榜 | `GET /api/v1/hot-topics` |

条目主链接指向原始信源，次要链接保留 AIHOT 署名；精选摘要由 AIHOT 的 AI 生成，涉及重要事实请回原文核对。AIHOT 的内容评分和热点榜信源数不作为应用“热度”分数。

两个来源默认关闭，可分别设置 `SOURCE_AIHOT_SELECTED_ENABLED=true`、`SOURCE_AIHOT_TOPICS_ENABLED=true` 启用。Worker 按配置的上午、下午时段抓取；后续请求使用 ETag 条件请求，304 复用已验证内容，429 按 `Retry-After` 暂停请求，失败时保留最后一次真实成功快照。来源异常可关闭对应开关并重启服务，其他来源不受影响。

应用会通过公开的 `/api/v1/hot/:sourceId` 和 `/api/v1/batch` 返回来源数据。启用 AIHOT 公网展示时需有覆盖页面和这些接口用途的书面授权。

### Steam 游戏优惠

首页直接展示 Steam 游戏优惠列表卡片，也可用“游戏优惠”分类单独筛选。

- Worker 在计划时段从 [CheapShark Deals API](https://apidocs.cheapshark.com/) 获取 Steam 优惠候选，批量查询 Steam 中国区的 `price_overview`，仅保存国区真实折扣及人民币价格。首次启动若缺少快照，也由 Worker 初始化；首页 API 始终只读 SQLite 快照。
- Worker 逐个请求 `l=schinese&filters=basic` 获取名称，优先保存 Steam 提供的简体中文名；未提供或请求失败时保留 CheapShark 原标题。每次最多扫描 4 页候选并保存 40 款游戏。
- 缩略图来自 CheapShark，失效时显示占位。桌面端卡片最高 80vh，列表在卡片内滚动；滚动至底部时从本站快照读取下一批。点击优惠仍使用 CheapShark 要求的 redirect 链接。
- 快照保存在与其他来源相同的 SQLite 中，抓取失败时继续展示上次成功快照；价格查询缓存 10 分钟，名称缓存 24 小时。Steam 卡片不计入新闻来源的可用数统计。

Steam 商店 `appdetails` 未列入公开 Web API 文档，接口变化时会明确显示错误，不会用美元价格冒充国区价格。实际售价请以商店页面为准。

## 本地开发

要求 Node.js 22 及以上、pnpm 10.33.0。

```bash
pnpm install
pnpm dev
```

| 服务 | 地址 | 说明 |
| --- | --- | --- |
| 开发 Web | `http://localhost:5173` | Vite 将 `/api` 代理到开发 API |
| 开发 API | `http://127.0.0.1:3001` | 与开发 Worker 共用独立的 `data/dev-news.db` |
| 生产服务 | `http://localhost:3000` | 本地运行生产容器时使用 |

`pnpm dev` 同时启动 Web、API 和 Worker。Worker 会生成 Steam 优惠快照。开发环境将 `/api` 固定代理到本机开发 API，不会误连 3000 端口上的生产服务。生产构建默认请求同源 `/api`，由 Fastify 提供后端；前后端分开部署时，可在构建时设置 `VITE_API_BASE`。

修改开发脚本或代理配置后，请重启 `pnpm dev`。单终端运行时，输入 `r` 并回车可重启 Vite，输入 `h` 并回车可查看快捷键；后端文件变更由 Node.js watch 模式自动重启。也可以分别运行 `pnpm --filter @news-spot/api dev` 和 `pnpm --filter @news-spot/web dev`。

## 验证命令

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @news-spot/api test:smoke
PLAYWRIGHT_HTML_OPEN=never pnpm test:e2e
```

在线 smoke 会访问真实上游，不作为每次提交的稳定 CI 门禁。默认通过标准是至少 8 个来源返回非空真实数据；作者演示站发布时使用 `SMOKE_MIN_SUCCESS=10`。

## API

接口文档支持填写参数并直接发送请求：

- 本地：[API 文档](http://localhost:5173/api/docs)，OpenAPI JSON 地址为 `http://localhost:5173/api/openapi.json`。
- 作者演示站：[API 文档](https://hot-spots.kevinlau.cn/api/docs)，[OpenAPI JSON](https://hot-spots.kevinlau.cn/api/openapi.json) 可导入其他 API 工具。自行部署后，将域名替换为自己的站点地址。

OpenAPI 文档由 `@fastify/swagger` 根据实际路由 schema 动态生成；请求参数及响应结构在路由和共享 schema 中维护，`/api/docs` 读取同一份生成结果。

| 接口 | 说明 |
|---|---|
| `GET /api/v1/sources` | 来源元数据和当前状态 |
| `GET /api/v1/hot/:sourceId?limit=12` | 单来源热点 |
| `GET /api/v1/batch?sources=a,b&limit=12` | 最多 12 个来源的部分成功批量响应 |
| `GET /api/v1/fetch-logs` | 最近 30 天的抓取日志，支持 `sourceId`、`status`、`cursor`、`limit` 筛选和分页 |
| `GET /api/v1/steam-prices?appids=620,1057090` | 最多批量查询 8 款游戏的 Steam 中国区价格和本地化名称，金额单位为人民币分 |
| `GET /api/v1/steam-deals?pageNumber=0` | 分页读取 Worker 保存的 Steam 国区优惠快照，不发起上游请求 |
| `GET /api/v1/health/live` | 容器存活检查 |
| `GET /api/v1/health` | 数据库和来源就绪状态 |
| `GET /api/v1/metrics` | 无敏感信息的来源成功率与耗时 |

每条热点包含原始标题、原文 URL、来源、排名、可选热度、上游时间和抓取时间。点击内容直接前往原始来源。

## 定时抓取与失败策略

- 独立 Worker 默认在北京时间每天 `05:00`、`15:00` 抓取所有启用的来源并写入 SQLite；启动时补跑最近未完成的时段，若该时段已完成，则立即补抓所有尚无快照的启用来源。Steam 优惠也会在缺少快照时立即抓取。可用 `WORKER_RUN_TIMES`、`WORKER_TIME_ZONE` 配置时段。
- 页面加载与“重新加载”只读取 SQLite。某来源没有任何快照时，API 才进行一次受租约保护的补抓，成功写库后返回。同一来源的并发补抓只执行一次。
- 最近计划时段尚未更新时，页面展示已保存的旧数据与实际更新时间。抓取失败不覆盖旧快照。
- 页头“抓取日志”按钮可查看定时、补抓及手动运行的结果，日志保留 30 天。`/api/v1/health` 报告 Worker 心跳、下次时段和最近时段结果。
- 公网 `refresh=true` 已停用并返回 `REFRESH_DISABLED`。来源契约的 `refreshIntervalMs` 为兼容旧客户端保留，不再决定抓取频率。
- 网络错误、408、429 和 5xx 最多重试两次；普通 4xx 不重试。
- 连续三次失败后熔断五分钟。
- 没有成功快照且补抓失败时返回明确错误，不伪造内容。

## Docker 部署

```bash
cp .env.example .env
docker compose up --build -d
docker compose ps
```

使用根目录的 `compose.yaml` 启动后，页面和 API 默认通过 `http://localhost:3000` 访问。API 与 Worker 共享命名卷 `news-spot-data` 中的 SQLite，容器重建后仍会保留。可运行 `pnpm --filter @news-spot/api worker:once` 单次手动抓取。对外提供服务时，请使用自己的域名配置反向代理和 HTTPS。

回滚时用上一版本镜像替换 `compose.yaml` 中的 `image`，然后执行：

```bash
docker compose up -d
```

不要删除数据卷。若必须清空缓存，先停止容器并备份 SQLite，再显式删除卷。

### 作者演示站的自动发布

以下流程用于作者演示站，也可作为自建部署的参考。`scripts/deploy.mjs` 中的默认 SSH 目标、目录、端口和域名是作者演示站的配置；使用前请在自己的部署配置文件中覆盖。服务器需预先安装 Docker、Docker Compose、rsync，并确保部署用户有权执行 `docker` 命令。

首次配置用户级部署文件：

```bash
mkdir -p ~/.config/news-spot
cp .env.deploy.example ~/.config/news-spot/deploy.env
```

示例默认通过 `~/.ssh/config` 中的 `tencent-cloud` alias 连接服务器，发布到 `/opt/news-spot`，应用仅监听 `127.0.0.1:20245`。自行部署时，至少修改 `DEPLOY_SSH_TARGET`、`DEPLOY_PATH`、`DEPLOY_APP_PORT` 和 `DEPLOY_DOMAIN`。如需覆盖抓取源、管理员密钥等环境配置，可新建不会提交到 Git 的 `.env.production`，并在用户级部署配置中启用：

```dotenv
DEPLOY_ENV_FILE=.env.production
```

预演发布流程，不连接或修改服务器：

```bash
npm run deploy:dry-run
```

正式发布：

```bash
npm run deploy
```

正式发布会先执行 lint、类型检查、单元测试和构建，再在本机构建 `linux/amd64` 镜像、压缩上传，并在目标服务器载入镜像。API 与 Worker 通过健康检查后才切换版本；失败时恢复上一版本的 Compose 和镜像。SQLite 数据保存在独立命名卷中。

可参考 [作者演示站的 Nginx 配置示例](deploy/nginx/hot-spots.kevinlau.cn.conf.example) 配置反向代理和 HTTPS 证书；如果服务器已有代理配置，可在部署配置文件中设置 `DEPLOY_PROXY_RELOAD_COMMAND`。发布结束会检查 `https://<DEPLOY_DOMAIN>/api/v1/health/live`，成功响应后命令才会正常退出。

## 环境变量

完整示例见 [`.env.example`](.env.example)。

- `GITHUB_TOKEN` 可选，用于提升官方 API 限额；失效时自动降级到匿名请求。
- `CORS_ORIGINS` 是逗号分隔的允许来源。
- `SOURCE_*_ENABLED` 可以关闭单个来源。
- `WORKER_RUN_TIMES` 默认 `05:00,15:00`；`WORKER_TIME_ZONE` 默认 `Asia/Shanghai`。已有部署若在持久化的 `.env` 中设置了旧时段，需同步更新该变量并重启 Worker。
- `SMOKE_MIN_SUCCESS` 只用于在线 smoke，控制真实来源最低成功数。
- 日志不记录 Token 或上游响应正文。

## 告警建议

- `/api/v1/health` 连续三次返回 `unhealthy`。
- Worker 心跳超过 3 分钟未更新，或最近一个时段存在失败来源。
- 某来源连续两个计划时段失败。
- SQLite 不可写或容器健康检查失败。

## 使用边界

本项目不抓取文章全文，不绕过验证码、登录、付费墙或访问控制。AIHOT 来源经其公开 v1 API 接入，其启用受上述使用规则约束；其他新来源接入前也应确认接口或 RSS 的使用条款和稳定性。
