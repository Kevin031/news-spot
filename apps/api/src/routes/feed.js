import { responseSchema } from "../route-schemas.js";

export async function feedRoutes(app, context) {
  app.get("/api/v1/feed", {
    schema: {
      tags: ["热点"], summary: "一次获取全部来源和热点", description: "返回所有启用来源的元数据、已保存热点及统计，供首页一次加载。只读取 SQLite，不触发上游抓取；无快照来源单独返回错误，不影响其他来源。",
      querystring: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 50, default: 12, description: "每个来源返回的条数" } } },
      response: { 200: responseSchema("FeedResponse"), 400: responseSchema("ApiError"), 500: responseSchema("ApiError") },
    },
  }, async (request) => {
    const definitions = context.registry.list();
    const results = await context.hotService.batch(definitions.map((source) => source.id), { limit: request.query.limit });
    return {
      timestamp: new Date().toISOString(),
      sources: definitions.map((source) => context.hotService.describeSource(source)),
      results,
      summary: { total: results.length, success: results.filter((item) => item.success).length, failed: results.filter((item) => !item.success).length, stale: results.filter((item) => item.stale).length },
    };
  });
}
