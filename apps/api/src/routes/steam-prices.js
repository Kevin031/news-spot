import { responseSchema } from "../route-schemas.js";

export async function steamPriceRoutes(app, context) {
  app.get("/api/v1/steam-prices", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    schema: {
      tags: ["游戏优惠"], summary: "查询 Steam 中国区价格", description: "按 Steam App ID 批量查询国区实际售价；每次最多 8 款，未在国区提供价格的游戏返回 null。价格单位为人民币分。",
      querystring: { type: "object", required: ["appids"], properties: { appids: { type: "string", minLength: 1, maxLength: 80, pattern: "^[1-9][0-9]*(,[1-9][0-9]*)*$", description: "逗号分隔的 Steam App ID，最多 8 个" } } },
      response: { 200: responseSchema("SteamPricesResponse"), 400: responseSchema("ApiError"), 502: responseSchema("ApiError") },
    },
  }, async (request, reply) => {
    const ids = [...new Set(request.query.appids.split(","))];
    if (ids.length > 8) return reply.code(400).send(context.apiError(request, "INVALID_REQUEST", "一次最多查询 8 款游戏", null, false));
    try {
      return { prices: await context.steamPrices.getPrices(ids) };
    } catch (error) {
      request.log.warn({ err: error, appIds: ids }, "Steam 国区价格查询失败");
      return reply.code(502).send(context.apiError(request, "STEAM_UNAVAILABLE", "Steam 国区价格暂时不可用", null, true));
    }
  });
}
