export async function sourcesRoutes(app, context) {
  app.get("/api/v1/sources", async () => ({
    timestamp: new Date().toISOString(),
    sources: context.registry.list().map((source) => context.hotService.describeSource(source)),
  }));
}
