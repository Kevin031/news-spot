# News Spot

News Spot 是一个只展示真实上游数据的热点聚合站。前端使用 Vite 8、Vue 3 和 Less，API 使用 Fastify；数据源失败时会明确显示最近成功快照或错误，不会用 Mock 数据填充生产页面。

## 已接入来源

| 来源 | 获取方式 | 风险等级 |
|---|---|---:|---:|
| Hacker News | 官方 Firebase API | 低 |
| V2EX | 公开 API | 低 |
| GitHub 新锐项目 | 官方 REST Search API | 低 |
| BBC World | 官方 RSS | 低 |
| IT之家 | 官方站 RSS | 低 |
| 哔哩哔哩排行榜 | 公开 Web JSON 接口 | 中 |
| DEV Community | 官方 Forem API | 低 |
| Stack Overflow | 官方 Stack Exchange API | 低 |
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

生产环境会根据目标机的真实连通性独立启停来源。V2EX 和 BBC 在腾讯云连续失败时通过 `SOURCE_*_ENABLED=false` 暂停；Bilibili 保持启用，能取得真实数据时正常展示，失败时显示旧快照或错误并排到当前分类底部。MarketWatch 等 RSS 来源只使用 feed 返回的标题、摘要和原文链接，不抓取正文或绕过付费限制。

### AI 资讯板块

AI 资讯分类使用 [AIHOT v1 接口](https://aihot.news/agent?tab=api) 的 `GET /api/v1/items?mode=selected&window=24h&limit=20` 和 `GET /api/v1/hot-topics`，分别展示近期精选和当前热点榜。条目主链接指向原始信源，次要链接保留 AIHOT 署名；精选摘要由 AIHOT 的 AI 生成，涉及重要事实请回原文核对。AIHOT 的内容评分和热点榜信源数不作为本站“热度”分数。

两个来源默认关闭，可分别设置 `SOURCE_AIHOT_SELECTED_ENABLED=true`、`SOURCE_AIHOT_TOPICS_ENABLED=true` 启用。Worker 按配置的上午、下午时段抓取；后续请求使用 ETag 条件请求，304 复用已验证内容，429 按 `Retry-After` 暂停请求，失败时保留最后一次真实成功快照。来源异常可关闭对应开关并重启服务，其他来源不受影响。

本站会通过公开的 `/api/v1/hot/:sourceId` 和 `/api/v1/batch` 返回来源数据。启用 AIHOT 公网展示时需有覆盖页面和这些接口用途的书面授权。

## 本地开发

要求 Node.js 22 及以上、pnpm 10.33.0。

```bash
pnpm install
pnpm dev
```

- 开发 Web：`http://localhost:5173`
- 开发 API：`http://127.0.0.1:3001`，使用独立的 `data/dev-news.db`
- 生产服务入口：`http://localhost:3000`（本地运行生产容器时）

开发环境由 Vite 将 `/api` 固定代理到本机开发 API，不会因 3000 端口上运行着生产服务而误连。生产构建默认请求同源 `/api`，由部署后的 Fastify 服务提供正式后端；如前后端分开部署，可在构建时设置 `VITE_API_BASE`。若修改了开发脚本或代理配置，请重启 `npm run dev`。
单终端运行时，前端直接接收终端输入：输入 `r` 后回车可重启 Vite，输入 `h` 后回车可查看快捷键。后端文件变更由 Node.js watch 模式自动重启。也可以分别在两个终端运行 `pnpm --filter @news-spot/api dev` 和 `pnpm --filter @news-spot/web dev`。

## 验证命令

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @news-spot/api test:smoke
PLAYWRIGHT_HTML_OPEN=never pnpm test:e2e
```

在线 smoke 会访问真实上游，不作为每次提交的稳定 CI 门禁。默认通过标准是至少 8 个来源返回非空真实数据；生产发布使用 `SMOKE_MIN_SUCCESS=10`。

## API

| 接口 | 说明 |
|---|---|
| `GET /api/v1/sources` | 来源元数据和当前状态 |
| `GET /api/v1/hot/:sourceId?limit=12` | 单来源热点 |
| `GET /api/v1/batch?sources=a,b&limit=12` | 最多 12 个来源的部分成功批量响应 |
| `GET /api/v1/fetch-logs` | 最近 30 天的抓取日志，支持 `sourceId`、`status`、`cursor`、`limit` 筛选和分页 |
| `GET /api/v1/health/live` | 容器存活检查 |
| `GET /api/v1/health` | 数据库和来源就绪状态 |
| `GET /api/v1/metrics` | 无敏感信息的来源成功率与耗时 |

每条热点包含原始标题、原文 URL、来源、排名、可选热度、上游时间和抓取时间。点击内容直接前往原始来源。

## 定时抓取与失败策略

- 独立 Worker 默认在北京时间每天 `09:00`、`15:00` 抓取所有启用的来源并写入 SQLite；启动时补跑最近未完成的时段。可用 `WORKER_RUN_TIMES`、`WORKER_TIME_ZONE` 配置时段。
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

生产页面和 API 统一使用 `http://localhost:3000`。API 与 Worker 共享命名卷 `news-spot-data` 中的 SQLite，容器重建后仍会保留。可运行 `pnpm --filter @news-spot/api worker:once` 单次手动抓取。

回滚时用上一版本镜像替换 `compose.yaml` 中的 `image`，然后执行：

```bash
docker compose up -d
```

不要删除数据卷。若必须清空缓存，先停止容器并备份 SQLite，再显式删除卷。

### 发布到 hot-spots.kevinlau.cn

项目提供基于 SSH、rsync 和 Docker Compose 的发布命令。服务器需预先安装
Docker、Docker Compose、rsync，并确保部署用户有权执行 `docker` 命令。

默认读取与隔壁项目一致的用户级部署配置。首次配置：

```bash
mkdir -p ~/.config/news-spot
cp .env.deploy.example ~/.config/news-spot/deploy.env
```

默认通过 `~/.ssh/config` 中的 `tencent-cloud` alias 连接服务器，发布到
`/opt/news-spot`，应用仅监听 `127.0.0.1:20245`。如生产环境需要覆盖抓取源、
管理员密钥等配置，可新建不会提交到 Git 的 `.env.production`，并在用户级
部署配置中启用：

```dotenv
DEPLOY_ENV_FILE=.env.production
```

先预演发布流程，不连接或修改服务器：

```bash
npm run deploy:dry-run
```

确认无误后正式发布：

```bash
npm run deploy
```

正式发布会先执行 lint、类型检查、单元测试和构建，然后在本机构建
`linux/amd64` 镜像、压缩上传、在腾讯云载入镜像并等待 API 与 Worker 健康检查。SQLite 数据
保存在独立命名卷中。容器健康检查失败时会恢复上一版本 Compose 和镜像。

可参考
[`deploy/nginx/hot-spots.kevinlau.cn.conf.example`](deploy/nginx/hot-spots.kevinlau.cn.conf.example)
配置 Nginx 和 HTTPS 证书；如果服务器已有代理配置，可在 `.env.deploy` 中设置
`DEPLOY_PROXY_RELOAD_COMMAND`。发布结束会检查
`https://hot-spots.kevinlau.cn/api/v1/health/live`，成功响应后命令才会正常退出。

## 环境变量

完整示例见 [`.env.example`](.env.example)。

- `GITHUB_TOKEN` 可选，用于提升官方 API 限额；失效时自动降级到匿名请求。
- `CORS_ORIGINS` 是逗号分隔的允许来源。
- `SOURCE_*_ENABLED` 可以关闭单个来源。
- `WORKER_RUN_TIMES` 默认 `09:00,15:00`；`WORKER_TIME_ZONE` 默认 `Asia/Shanghai`。
- `SMOKE_MIN_SUCCESS` 只用于在线 smoke，控制真实来源最低成功数。
- 日志不记录 Token 或上游响应正文。

## 告警建议

- `/api/v1/health` 连续三次返回 `unhealthy`。
- Worker 心跳超过 3 分钟未更新，或最近一个时段存在失败来源。
- 某来源连续两个计划时段失败。
- SQLite 不可写或容器健康检查失败。

## 使用边界

本项目不抓取文章全文，不绕过验证码、登录、付费墙或访问控制。AIHOT 来源经其公开 v1 API 接入，其启用受上述使用规则约束；其他新来源接入前也应确认接口或 RSS 的使用条款和稳定性。
