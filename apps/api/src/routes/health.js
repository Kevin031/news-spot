export async function healthRoutes(app, context) {
  app.get("/api/v1/health/live", async () => ({ status: "ok", timestamp: new Date().toISOString() }));
  app.get("/api/v1/health", async (_request, reply) => {
    const descriptions = context.registry.list().map((source) => context.hotService.describeSource(source));
    const counts = { total: descriptions.length, fresh: 0, stale: 0, error: 0, unknown: 0 };
    for (const source of descriptions) counts[source.status] += 1;
    const database = context.cache.isHealthy() ? "ok" : "error";
    const state = context.db.prepare("SELECT heartbeat_at, next_slot_key FROM worker_state WHERE id=1").get();
    const lastSlot = context.fetchLogs.latestSlot();
    const worker = {
      status: state && Date.now() - state.heartbeat_at < 180_000 ? "ok" : "missing",
      heartbeatAt: state ? new Date(state.heartbeat_at).toISOString() : null,
      nextSlot: state?.next_slot_key ?? null,
      lastSlot,
    };
    counts.availabilityRatio = counts.total ? (counts.fresh + counts.stale) / counts.total : 0;
    const status = database === "error" ? "unhealthy" : counts.fresh > 0 && counts.error === 0 && counts.stale === 0 && worker.status === "ok" && lastSlot?.status === "completed" && lastSlot.failed === 0 ? "healthy" : "degraded";
    if (status === "unhealthy") reply.code(503);
    return { status, timestamp: new Date().toISOString(), uptimeSeconds: process.uptime(), database, sources: counts, worker };
  });
}
