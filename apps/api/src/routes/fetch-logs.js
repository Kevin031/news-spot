export async function fetchLogsRoutes(app, context) {
  app.get("/api/v1/fetch-logs", {
    schema: { querystring: { type: "object", properties: {
      limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      cursor: { type: "string", minLength: 1, maxLength: 200 },
      sourceId: { type: "string", minLength: 1, maxLength: 64 },
      status: { type: "string", enum: ["running", "success", "not_modified", "failure", "skipped"] },
    } } },
  }, async (request, reply) => {
    try { return context.fetchLogs.list(request.query); }
    catch (error) {
      if (error?.code === "INVALID_CURSOR") return reply.code(400).send(context.apiError(request, "INVALID_CURSOR", "抓取日志游标不合法", null, false));
      throw error;
    }
  });
}
