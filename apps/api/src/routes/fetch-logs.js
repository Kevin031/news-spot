import { responseSchema } from "../route-schemas.js";

export async function fetchLogsRoutes(app, context) {
  app.get("/api/v1/fetch-logs", {
    schema: {
      tags: ["抓取日志"], summary: "查询抓取日志", description: "日志保留 30 天，按开始时间倒序排列。将响应中的 nextCursor 原样传回以读取下一页。",
      querystring: { type: "object", properties: {
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20, description: "每页条数" },
        cursor: { type: "string", minLength: 1, maxLength: 200, description: "上一页返回的 nextCursor" },
        sourceId: { type: "string", minLength: 1, maxLength: 64, description: "按来源 ID 筛选" },
        status: { type: "string", enum: ["running", "success", "not_modified", "failure", "skipped"], description: "按抓取状态筛选" },
      } },
      response: { 200: responseSchema("FetchLogsResponse"), 400: responseSchema("ApiError"), 500: responseSchema("ApiError") },
    },
  }, async (request, reply) => {
    try { return context.fetchLogs.list(request.query); }
    catch (error) {
      if (error?.code === "INVALID_CURSOR") return reply.code(400).send(context.apiError(request, "INVALID_CURSOR", "抓取日志游标不合法", null, false));
      throw error;
    }
  });
}
