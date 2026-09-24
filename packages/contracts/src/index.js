import { z } from "zod";

const httpUrl = z.string().url().refine((value) => /^https?:\/\//.test(value), "仅支持 HTTP/HTTPS URL");

export const categorySchema = z.enum(["china", "tech", "world", "finance", "ai"]);
export const sourceStatusSchema = z.enum(["unknown", "fresh", "stale", "error"]);

export const hotItemSchema = z.object({
  id: z.string().min(1).max(300),
  sourceId: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(300),
  url: httpUrl,
  rank: z.number().int().positive(),
  score: z.number().finite().nullable().default(null),
  summary: z.string().trim().max(500).nullable().default(null),
  publishedAt: z.string().datetime().nullable().default(null),
  fetchedAt: z.string().datetime(),
  originalSourceName: z.string().trim().min(1).max(200).optional(),
  attribution: z.object({ name: z.string().trim().min(1).max(100), url: httpUrl }).optional(),
  sourceCount: z.number().int().nonnegative().optional(),
});

export const sourceDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(1).max(50),
  category: categorySchema,
  homeUrl: httpUrl,
  refreshIntervalMs: z.number().int().min(30_000),
  timeoutMs: z.number().int().min(1_000).max(30_000),
  enabled: z.boolean(),
  riskLevel: z.enum(["low", "medium", "high"]),
  dataMethod: z.enum(["official-api", "public-api", "rss", "public-web-api", "html"]),
});

export const sourceResultSchema = z.object({
  sourceId: z.string(),
  sourceName: z.string(),
  success: z.boolean(),
  status: sourceStatusSchema,
  stale: z.boolean(),
  staleReason: z.string().nullable(),
  lastSuccessAt: z.string().datetime().nullable(),
  fetchedAt: z.string().datetime().nullable(),
  items: z.array(hotItemSchema),
  error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).nullable(),
});

export const publicSourceSchema = sourceDefinitionSchema.extend({
  status: sourceStatusSchema,
  stale: z.boolean(),
  lastSuccessAt: z.string().datetime().nullable(),
  lastError: z.string().nullable(),
});

export const batchResponseSchema = z.object({
  timestamp: z.string().datetime(),
  results: z.array(sourceResultSchema),
  summary: z.object({
    total: z.number().int().nonnegative(),
    success: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    stale: z.number().int().nonnegative(),
  }),
});

export const healthResponseSchema = z.object({
  status: z.enum(["healthy", "degraded", "unhealthy"]),
  timestamp: z.string().datetime(),
  uptimeSeconds: z.number().nonnegative(),
  database: z.enum(["ok", "error"]),
  sources: z.object({ total: z.number(), fresh: z.number(), stale: z.number(), error: z.number(), unknown: z.number(), availabilityRatio: z.number().min(0).max(1) }),
});

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  sourceId: z.string().nullable(),
  retryable: z.boolean(),
  requestId: z.string(),
});

/** @param {unknown} sources */
export function assertUniqueSources(sources) {
  const parsed = z.array(sourceDefinitionSchema).parse(sources);
  const ids = new Set();
  for (const source of parsed) {
    if (ids.has(source.id)) throw new Error(`数据源 ID 重复: ${source.id}`);
    ids.add(source.id);
  }
  return parsed;
}

/** @param {unknown} value */
export function sanitizeTitle(value) {
  return String(value ?? "")
    // 标题需要清理所有 ASCII 控制字符，避免污染日志与页面。
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}
