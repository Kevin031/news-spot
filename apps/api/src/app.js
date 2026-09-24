import { existsSync } from "node:fs";
import { resolve } from "node:path";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { batchRoutes } from "./routes/batch.js";
import { fetchLogsRoutes } from "./routes/fetch-logs.js";
import { healthRoutes } from "./routes/health.js";
import { hotRoutes } from "./routes/hot.js";
import { metricsRoutes } from "./routes/metrics.js";
import { sourcesRoutes } from "./routes/sources.js";
import { loadEnv } from "./config/env.js";
import { createRuntime } from "./runtime.js";

export async function buildApp(options = {}) {
  const env = options.env ?? loadEnv();
  const app = Fastify({ logger: options.logger ?? { level: env.LOG_LEVEL }, requestTimeout: 45_000, bodyLimit: 32 * 1024, trustProxy: true });
  const allowedOrigins = new Set(env.CORS_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean));
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)) });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

  const runtime = createRuntime({ ...options, env, logger: app.log });
  const { db, cache, metrics, registry, hotService, fetchLogs } = runtime;
  const context = {
    env, db, cache, metrics, registry, hotService, fetchLogs,
    apiError: (request, code, message, sourceId = null, retryable = false) => ({ code, message, sourceId, retryable, requestId: request.id }),
  };

  await app.register(sourcesRoutes, context);
  await app.register(hotRoutes, context);
  await app.register(batchRoutes, context);
  await app.register(healthRoutes, context);
  await app.register(metricsRoutes, context);
  await app.register(fetchLogsRoutes, context);

  app.setErrorHandler((error, request, reply) => {
    const validation = Boolean(error.validation);
    request.log.warn({ requestId: request.id, code: error.code, validation }, "请求处理失败");
    reply.code(validation ? 400 : error.statusCode ?? 500).send(context.apiError(request, validation ? "INVALID_REQUEST" : "INTERNAL_ERROR", validation ? "请求参数不合法" : "服务暂时不可用", null, !validation));
  });

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
