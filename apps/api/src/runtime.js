import { loadEnv } from "./config/env.js";
import { createSourceDefinitions } from "./config/sources.js";
import { createDatabase } from "./db/index.js";
import { createHttpClient } from "./lib/http-client.js";
import { createCacheService } from "./services/cache-service.js";
import { createCircuitBreaker } from "./services/circuit-breaker.js";
import { createFetchLogService } from "./services/fetch-log-service.js";
import { createSteamDealsService } from "./services/steam-deals-service.js";
import { createSteamPriceService } from "./services/steam-price-service.js";
import { createHotService } from "./services/hot-service.js";
import { createMetricsService } from "./services/metrics-service.js";
import { createRefreshCoordination } from "./services/refresh-coordination.js";
import { parseRunTimes } from "./services/worker-schedule.js";
import { createSourceRegistry } from "./sources/registry.js";

export function createRuntime(options = {}) {
  const env = options.env ?? loadEnv();
  const now = options.now ?? (() => Date.now());
  const scheduleTimes = parseRunTimes(env.WORKER_RUN_TIMES);
  new Intl.DateTimeFormat("en-US", { timeZone: env.WORKER_TIME_ZONE });
  const db = createDatabase(options.databasePath ?? env.DATABASE_PATH);
  const cache = createCacheService(db);
  const metrics = createMetricsService(db);
  const registry = createSourceRegistry(options.sources ?? createSourceDefinitions(env));
  const coordination = createRefreshCoordination(db, now);
  const fetchLogs = createFetchLogService(db, now);
  const hotService = createHotService({ registry, http: createHttpClient({ fetchImpl: options.fetchImpl }), env, cache, metrics, circuit: createCircuitBreaker(), coordination, fetchLogs, logger: options.logger, now, scheduleTimes, timeZone: env.WORKER_TIME_ZONE });
  const steamPrices = createSteamPriceService({ fetchImpl: options.fetchImpl, now });
  const steamDeals = createSteamDealsService({ fetchImpl: options.fetchImpl, cache, prices: steamPrices, fetchLogs, now });
  return { env, db, cache, metrics, registry, coordination, fetchLogs, hotService, steamPrices, steamDeals, scheduleTimes, now, close: () => db.close() };
}
