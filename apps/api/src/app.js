import { existsSync } from "node:fs";
import { resolve } from "node:path";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import Fastify from "fastify";
import { apiDocsRoutes } from "./api-docs.js";
import { batchRoutes } from "./routes/batch.js";
import { fetchLogsRoutes } from "./routes/fetch-logs.js";
import { healthRoutes } from "./routes/health.js";
import { hotRoutes } from "./routes/hot.js";
import { metricsRoutes } from "./routes/metrics.js";
import { sourcesRoutes } from "./routes/sources.js";
import { steamPriceRoutes } from "./routes/steam-prices.js";
import { loadEnv } from "./config/env.js";
import { createRuntime } from "./runtime.js";
import { sharedSchemas } from "./route-schemas.js";
import { createSteamPriceService } from "./services/steam-price-service.js";

export async function buildApp(options = {}) {
  const env = options.env ?? loadEnv();
  const app = Fastify({ logger: options.logger ?? { level: env.LOG_LEVEL }, requestTimeout: 45_000, bodyLimit: 32 * 1024, trustProxy: true });
  const allowedOrigins = new Set(env.CORS_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean));
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)) });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  await app.register(swagger, { refResolver: { buildLocalReference: (schema, _baseUri, _fragment, index) => schema.$id ?? `schema-${index}` }, openapi: {
    openapi: "3.0.3",
    info: {
      title: "热点聚合 API",
      version: "1.0.0",
      description: "公开只读接口，无需认证，默认每个客户端每分钟最多 120 次请求。时间字段通常使用 ISO 8601，抓取统计中注明的时间戳使用 Unix 毫秒。热点数据通常来自已保存快照，来源尚无快照时可能触发一次补抓。跨域浏览器请求受 CORS 允许来源配置限制。",
    },
    servers: [{ url: "/", description: "当前站点" }],
    tags: [
      { name: "热点", description: "来源与热点内容" },
      { name: "运行状态", description: "健康检查与统计" },
      { name: "抓取日志", description: "抓取记录与分页" },
      { name: "游戏优惠", description: "Steam 中国区价格" },
    ],
  } });
  for (const [name, schema] of Object.entries(sharedSchemas)) app.addSchema({ $id: name, ...schema });

  const runtime = createRuntime({ ...options, env, logger: app.log });
  const { db, cache, metrics, registry, hotService, fetchLogs } = runtime;
  const context = {
    env, db, cache, metrics, registry, hotService, fetchLogs,
    steamPrices: createSteamPriceService({ fetchImpl: options.fetchImpl, now: options.now }),
    apiError: (request, code, message, sourceId = null, retryable = false) => ({ code, message, sourceId, retryable, requestId: request.id }),
  };

  app.setErrorHandler((error, request, reply) => {
    const validation = Boolean(error.validation);
    request.log.warn({ requestId: request.id, code: error.code, validation }, "请求处理失败");
    reply.code(validation ? 400 : error.statusCode ?? 500).send(context.apiError(request, validation ? "INVALID_REQUEST" : "INTERNAL_ERROR", validation ? "请求参数不合法" : "服务暂时不可用", null, !validation));
  });

  await app.register(sourcesRoutes, context);
  await app.register(hotRoutes, context);
  await app.register(batchRoutes, context);
  await app.register(healthRoutes, context);
  await app.register(metricsRoutes, context);
  await app.register(fetchLogsRoutes, context);
  await app.register(steamPriceRoutes, context);
  await app.register(apiDocsRoutes);

  const webRoot = env.WEB_DIST_PATH ? resolve(env.WEB_DIST_PATH) : resolve(process.cwd(), "apps/web/dist");
  if (existsSync(webRoot)) {
    await app.register(fastifyStatic, { root: webRoot, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.raw.method === "GET" && !request.url.startsWith("/api/")) return reply.sendFile("index.html");
      return reply.code(404).send(context.apiError(request, "NOT_FOUND", "请求的资源不存在", null, false));
    });
  }

  app.addHook("onClose", async () => { runtime.close(); });
  app.decorate("newsSpot", context);
  return app;
}
