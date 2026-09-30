const string = { type: "string" };
const dateTime = { type: "string", format: "date-time" };
const nullableDateTime = { ...dateTime, nullable: true };
const nullableString = { ...string, nullable: true };
const integer = { type: "integer" };
const ref = (name) => ({ $ref: `${name}#` });
export const responseSchema = (name, description = name === "ApiError" ? "请求失败" : "请求成功") => ({ ...ref(name), description });

// 路由运行时与 OpenAPI 生成共用的响应结构。
export const sharedSchemas = {
    ApiError: { type: "object", required: ["code", "message", "sourceId", "retryable", "requestId"], properties: {
      code: string, message: string, sourceId: nullableString, retryable: { type: "boolean" }, requestId: string,
    } },
    HotItem: { type: "object", required: ["id", "sourceId", "title", "url", "rank", "score", "summary", "publishedAt", "fetchedAt"], properties: {
      id: string, sourceId: string, title: string, url: { ...string, format: "uri" }, rank: integer,
      score: { type: "number", nullable: true }, summary: nullableString, publishedAt: nullableDateTime, fetchedAt: dateTime,
      posterUrl: { ...string, format: "uri", nullable: true }, rating: { type: "number", nullable: true },
      originalSourceName: string, attribution: { type: "object", required: ["name", "url"], properties: { name: string, url: { ...string, format: "uri" } } },
      sourceCount: integer,
    } },
    Source: { type: "object", required: ["id", "name", "category", "homeUrl", "refreshIntervalMs", "timeoutMs", "enabled", "riskLevel", "dataMethod", "status", "stale", "lastSuccessAt", "lastError"], properties: {
      id: string, name: string, category: { ...string, enum: ["china", "tech", "world", "finance", "ai", "entertainment"] }, homeUrl: { ...string, format: "uri" },
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
    SteamPrice: { type: "object", nullable: true, required: ["currency", "originalCents", "finalCents", "discountPercent", "localizedName"], properties: {
      currency: { ...string, enum: ["CNY"] }, originalCents: integer, finalCents: integer, discountPercent: integer, localizedName: nullableString,
    } },
    SteamPricesResponse: { type: "object", required: ["prices"], properties: {
      prices: { type: "object", additionalProperties: ref("SteamPrice") },
    } },
    SteamDealsResponse: { type: "object", required: ["items", "hasMore", "fetchedAt", "stale"], properties: {
      items: { type: "array", items: { type: "object", additionalProperties: true } },
      hasMore: { type: "boolean" }, fetchedAt: dateTime, stale: { type: "boolean" },
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
};
