const string = { type: "string" };
const dateTime = { type: "string", format: "date-time" };
const nullableDateTime = { ...dateTime, nullable: true };
const nullableString = { ...string, nullable: true };
const integer = { type: "integer" };

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const response = (name, description = "请求成功") => ({ description, content: { "application/json": { schema: ref(name) } } });
const errorResponse = { description: "请求失败", content: { "application/json": { schema: ref("ApiError") } } };
const query = (name, schema, description, required = false) => ({ name, in: "query", required, description, schema });

export const openapiDocument = {
  openapi: "3.0.3",
  info: {
    title: "热点聚合 API",
    version: "1.0.0",
    description: "公开只读接口。所有时间为 ISO 8601；热点数据通常来自已保存快照，来源尚无快照时可能触发一次补抓。",
  },
  servers: [{ url: "/", description: "当前站点" }],
  tags: [
    { name: "热点", description: "来源与热点内容" },
    { name: "运行状态", description: "健康检查与统计" },
    { name: "抓取日志", description: "抓取记录与分页" },
  ],
  paths: {
    "/api/v1/sources": { get: {
      tags: ["热点"], summary: "获取来源列表", description: "返回所有启用来源的元数据和当前状态。",
      responses: { 200: response("SourcesResponse"), 500: errorResponse },
    } },
    "/api/v1/hot/{sourceId}": { get: {
      tags: ["热点"], summary: "获取单个来源的热点", description: "按来源 ID 获取热点；refresh=true 已停用，会返回 400。",
      parameters: [
        { name: "sourceId", in: "path", required: true, description: "来源 ID，可先从来源列表获取", schema: { ...string, minLength: 1, maxLength: 64 }, example: "hackernews" },
        query("limit", { ...integer, minimum: 1, maximum: 50, default: 20 }, "返回条数"),
        query("refresh", { type: "boolean", default: false }, "强制抓取已停用；传 true 返回 400"),
      ],
      responses: { 200: response("SourceResult"), 400: errorResponse, 404: errorResponse, 500: errorResponse },
    } },
    "/api/v1/batch": { get: {
      tags: ["热点"], summary: "批量获取热点", description: "最多 12 个来源；未知来源会在 results 中返回失败项，其他来源照常返回。",
      parameters: [
        query("sources", { ...string, minLength: 1, maxLength: 500 }, "以逗号分隔的来源 ID，去重后最多 12 个", true),
        query("limit", { ...integer, minimum: 1, maximum: 50, default: 12 }, "每个来源返回的条数"),
      ],
      responses: { 200: response("BatchResponse"), 400: errorResponse, 500: errorResponse },
    } },
    "/api/v1/fetch-logs": { get: {
      tags: ["抓取日志"], summary: "查询抓取日志", description: "日志保留 30 天，按开始时间倒序排列。将响应中的 nextCursor 原样传回以读取下一页。",
      parameters: [
        query("limit", { ...integer, minimum: 1, maximum: 100, default: 20 }, "每页条数"),
        query("cursor", { ...string, minLength: 1, maxLength: 200 }, "上一页返回的 nextCursor"),
        query("sourceId", { ...string, minLength: 1, maxLength: 64 }, "按来源 ID 筛选"),
        query("status", { ...string, enum: ["running", "success", "not_modified", "failure", "skipped"] }, "按抓取状态筛选"),
      ],
      responses: { 200: response("FetchLogsResponse"), 400: errorResponse, 500: errorResponse },
    } },
    "/api/v1/health/live": { get: {
      tags: ["运行状态"], summary: "存活检查", description: "用于确认 API 进程正在响应。",
      responses: { 200: response("LiveResponse") },
    } },
    "/api/v1/health": { get: {
      tags: ["运行状态"], summary: "就绪状态", description: "汇总数据库、来源和 Worker 状态；数据库异常时返回 503。",
      responses: { 200: response("HealthResponse"), 503: response("HealthResponse", "数据库异常") },
    } },
    "/api/v1/metrics": { get: {
      tags: ["运行状态"], summary: "抓取统计", description: "返回 Worker 状态及各来源的请求成功率、耗时和最近错误。",
      responses: { 200: response("MetricsResponse"), 500: errorResponse },
    } },
  },
  components: { schemas: {
    ApiError: { type: "object", required: ["code", "message", "sourceId", "retryable", "requestId"], properties: {
      code: string, message: string, sourceId: nullableString, retryable: { type: "boolean" }, requestId: string,
    } },
    HotItem: { type: "object", required: ["id", "sourceId", "title", "url", "rank", "score", "summary", "publishedAt", "fetchedAt"], properties: {
      id: string, sourceId: string, title: string, url: { ...string, format: "uri" }, rank: integer,
      score: { type: "number", nullable: true }, summary: nullableString, publishedAt: nullableDateTime, fetchedAt: dateTime,
      originalSourceName: string, attribution: { type: "object", required: ["name", "url"], properties: { name: string, url: { ...string, format: "uri" } } },
      sourceCount: integer,
    } },
    Source: { type: "object", required: ["id", "name", "category", "homeUrl", "refreshIntervalMs", "timeoutMs", "enabled", "riskLevel", "dataMethod", "status", "stale", "lastSuccessAt", "lastError"], properties: {
      id: string, name: string, category: { ...string, enum: ["china", "tech", "world", "finance", "ai"] }, homeUrl: { ...string, format: "uri" },
      refreshIntervalMs: integer, timeoutMs: integer, enabled: { type: "boolean" }, riskLevel: { ...string, enum: ["low", "medium", "high"] },
      dataMethod: { ...string, enum: ["official-api", "public-api", "rss", "public-web-api", "html"] },
      status: { ...string, enum: ["unknown", "fresh", "stale", "error"] }, stale: { type: "boolean" }, lastSuccessAt: nullableDateTime, lastError: nullableString,
    } },
    SourcesResponse: { type: "object", required: ["timestamp", "sources"], properties: { timestamp: dateTime, sources: { type: "array", items: ref("Source") } } },
    SourceResult: { type: "object", required: ["sourceId", "sourceName", "success", "status", "stale", "staleReason", "lastSuccessAt", "fetchedAt", "items", "error"], properties: {
      sourceId: string, sourceName: string, success: { type: "boolean" }, status: { ...string, enum: ["unknown", "fresh", "stale", "error"] },
      stale: { type: "boolean" }, staleReason: nullableString, lastSuccessAt: nullableDateTime, fetchedAt: nullableDateTime,
      items: { type: "array", items: ref("HotItem") },
      error: { type: "object", nullable: true, required: ["code", "message", "retryable"], properties: { code: string, message: string, retryable: { type: "boolean" } } },
    } },
    BatchResponse: { type: "object", required: ["timestamp", "results", "summary"], properties: {
      timestamp: dateTime, results: { type: "array", items: ref("SourceResult") },
      summary: { type: "object", required: ["total", "success", "failed", "stale"], properties: { total: integer, success: integer, failed: integer, stale: integer } },
    } },
    WorkerSlot: { type: "object", nullable: true, required: ["key", "status", "startedAt", "finishedAt", "total", "success", "failed"], properties: {
      key: string, status: string, startedAt: dateTime, finishedAt: nullableDateTime, total: integer, success: integer, failed: integer,
    } },
    FetchLog: { type: "object", required: ["id", "sourceId", "trigger", "slotKey", "startedAt", "finishedAt", "status", "itemCount", "errorCode"], properties: {
      id: integer, sourceId: string, trigger: string, slotKey: nullableString, startedAt: dateTime, finishedAt: nullableDateTime,
      status: { ...string, enum: ["running", "success", "not_modified", "failure", "skipped"] }, itemCount: { ...integer, nullable: true }, errorCode: nullableString,
    } },
    FetchLogsResponse: { type: "object", required: ["items", "nextCursor", "latestSlot"], properties: {
      items: { type: "array", items: ref("FetchLog") }, nextCursor: nullableString, latestSlot: ref("WorkerSlot"),
    } },
    LiveResponse: { type: "object", required: ["status", "timestamp"], properties: { status: { ...string, enum: ["ok"] }, timestamp: dateTime } },
    HealthResponse: { type: "object", required: ["status", "timestamp", "uptimeSeconds", "database", "sources", "worker"], properties: {
      status: { ...string, enum: ["healthy", "degraded", "unhealthy"] }, timestamp: dateTime, uptimeSeconds: { type: "number" }, database: { ...string, enum: ["ok", "error"] },
      sources: { type: "object", required: ["total", "fresh", "stale", "error", "unknown", "availabilityRatio"], properties: {
        total: integer, fresh: integer, stale: integer, error: integer, unknown: integer, availabilityRatio: { type: "number" },
      } },
      worker: { type: "object", required: ["status", "heartbeatAt", "nextSlot", "lastSlot"], properties: {
        status: { ...string, enum: ["ok", "missing"] }, heartbeatAt: nullableDateTime, nextSlot: nullableString, lastSlot: ref("WorkerSlot"),
      } },
    } },
    MetricsResponse: { type: "object", required: ["timestamp", "worker", "sources"], properties: {
      timestamp: dateTime,
      worker: { type: "object", required: ["state", "latestSlot"], properties: {
        state: { type: "object", nullable: true, properties: { heartbeat_at: integer, next_slot_key: nullableString } }, latestSlot: ref("WorkerSlot"),
      } },
      sources: { type: "array", items: { type: "object", required: ["sourceId", "totalRequests", "successRate", "consecutiveFailures", "averageDurationMs", "p95DurationMs", "lastSuccessAt", "lastErrorAt", "lastError"], properties: {
        sourceId: string, totalRequests: integer, successRate: { type: "number", nullable: true }, consecutiveFailures: integer,
        averageDurationMs: integer, p95DurationMs: integer, lastSuccessAt: { type: "integer", nullable: true, description: "Unix 毫秒时间戳" },
        lastErrorAt: { type: "integer", nullable: true, description: "Unix 毫秒时间戳" }, lastError: nullableString,
      } } },
    } },
  } },
};
