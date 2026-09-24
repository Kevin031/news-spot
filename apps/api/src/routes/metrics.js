export async function metricsRoutes(app, context) {
  app.get("/api/v1/metrics", async () => ({
    timestamp: new Date().toISOString(),
    worker: { state: context.db.prepare("SELECT heartbeat_at, next_slot_key FROM worker_state WHERE id=1").get() ?? null, latestSlot: context.fetchLogs.latestSlot() },
    sources: context.registry.list().map((source) => ({
      sourceId: source.id,
      ...context.hotService.metrics(source.id),
    })),
  }));
}
