import { responseSchema } from "../route-schemas.js";

export async function sourcesRoutes(app, context) {
  app.get("/api/v1/sources", { schema: {
    tags: ["热点"], summary: "获取来源列表", description: "返回所有启用来源的元数据和当前状态。",
    response: { 200: responseSchema("SourcesResponse"), 500: responseSchema("ApiError") },
  } }, async () => ({
    timestamp: new Date().toISOString(),
    sources: context.registry.list().map((source) => context.hotService.describeSource(source)),
  }));
}
