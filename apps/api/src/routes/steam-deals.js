import { responseSchema } from "../route-schemas.js";

export async function steamDealsRoutes(app, context) {
  app.get("/api/v1/steam-deals", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    schema: {
      tags: ["游戏优惠"], summary: "读取 Steam 国区优惠快照", description: "只读取 Worker 保存的游戏和人民币价格快照，每页 8 款；缺少快照时返回 503。",
      querystring: { type: "object", properties: { pageNumber: { type: "integer", minimum: 0, maximum: 1000, default: 0 } } },
      response: { 200: responseSchema("SteamDealsResponse"), 400: responseSchema("ApiError"), 503: responseSchema("ApiError") },
    },
  }, async (request, reply) => {
    const snapshot = context.steamDeals.getPage(request.query.pageNumber);
    if (!snapshot) return reply.code(503).send(context.apiError(request, "DEALS_INITIALIZING", "游戏优惠快照尚未生成，请稍后重试", null, true));
    return snapshot;
  });
}
