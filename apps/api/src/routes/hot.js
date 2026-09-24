export async function hotRoutes(app, context) {
  app.get("/api/v1/hot/:sourceId", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    schema: {
      params: { type: "object", required: ["sourceId"], properties: { sourceId: { type: "string", minLength: 1, maxLength: 64 } } },
      querystring: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 50, default: 20 }, refresh: { type: "boolean", default: false } } },
    },
  }, async (request, reply) => {
    const { sourceId } = request.params;
    const { limit, refresh } = request.query;
    if (refresh) {
      return reply.code(400).send(context.apiError(request, "REFRESH_DISABLED", "手动抓取已停用，请重新加载已保存数据", sourceId, false));
    }
    const result = await context.hotService.get(sourceId, { limit });
    if (!result) return reply.code(404).send(context.apiError(request, "SOURCE_NOT_FOUND", "数据源不存在或未启用", sourceId, false));
    return result;
  });
}
