import { responseSchema } from "../route-schemas.js";

export async function batchRoutes(app, context) {
  app.get("/api/v1/batch", {
    schema: {
      tags: ["热点"], summary: "批量获取热点", description: "最多 12 个来源；未知来源会在 results 中返回失败项，其他来源照常返回。",
      querystring: { type: "object", required: ["sources"], properties: { sources: { type: "string", minLength: 1, maxLength: 500, description: "以逗号分隔的来源 ID，去重后最多 12 个" }, limit: { type: "integer", minimum: 1, maximum: 50, default: 12, description: "每个来源返回的条数" } } },
      response: { 200: responseSchema("BatchResponse"), 400: responseSchema("ApiError"), 500: responseSchema("ApiError") },
    },
  }, async (request, reply) => {
    const ids = [...new Set(request.query.sources.split(",").map((id) => id.trim()).filter(Boolean))];
    if (ids.length > 12) return reply.code(400).send(context.apiError(request, "TOO_MANY_SOURCES", "单次最多请求 12 个数据源", null, false));
    const raw = await context.hotService.batch(ids, { limit: request.query.limit });
    const results = raw.map((result, index) => result ?? {
      sourceId: ids[index], sourceName: ids[index], success: false, status: "error", stale: false, staleReason: null,
      lastSuccessAt: null, fetchedAt: null, items: [], error: { code: "SOURCE_NOT_FOUND", message: "数据源不存在或未启用", retryable: false },
    });
    return {
      timestamp: new Date().toISOString(), results,
      summary: { total: results.length, success: results.filter((item) => item.success).length, failed: results.filter((item) => !item.success).length, stale: results.filter((item) => item.stale).length },
    };
  });
}
