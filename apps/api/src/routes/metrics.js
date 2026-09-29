import { responseSchema } from "../route-schemas.js";

export async function metricsRoutes(app, context) {
  app.get("/api/v1/metrics", { schema: {
    tags: ["运行状态"], summary: "抓取统计", description: "返回 Worker 状态及各来源的请求成功率、耗时和最近错误。",
    response: { 200: responseSchema("MetricsResponse"), 500: responseSchema("ApiError") },
  } }, async () => ({
    timestamp: new Date().toISOString(),
    worker: { state: context.db.prepare("SELECT heartbeat_at, next_slot_key FROM worker_state WHERE id=1").get() ?? null, latestSlot: context.fetchLogs.latestSlot() },
    sources: context.registry.list().map((source) => ({
      sourceId: source.id,
      ...context.hotService.metrics(source.id),
    })),
  }));
}
