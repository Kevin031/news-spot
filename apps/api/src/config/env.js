import { resolve } from "node:path";
import { z } from "zod";

const booleanEnv = z.preprocess((value) => value === undefined ? undefined : !["0", "false", "off"].includes(String(value).toLowerCase()), z.boolean());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_PATH: z.string().default(resolve(process.cwd(), "data/news.db")),
  GITHUB_TOKEN: z.string().min(1).optional(),
  CORS_ORIGINS: z.string().default("http://localhost:5173,http://localhost:3000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  WEB_DIST_PATH: z.string().optional(),
  WORKER_RUN_TIMES: z.string().default("05:00,15:00"),
  WORKER_TIME_ZONE: z.string().default("Asia/Shanghai"),
  SOURCE_HACKERNEWS_ENABLED: booleanEnv.default(true),
  SOURCE_V2EX_ENABLED: booleanEnv.default(true),
  SOURCE_GITHUB_ENABLED: booleanEnv.default(true),
  SOURCE_BBC_ENABLED: booleanEnv.default(true),
  SOURCE_ITHOME_ENABLED: booleanEnv.default(true),
  SOURCE_BILIBILI_ENABLED: booleanEnv.default(true),
  SOURCE_DOUBAN_MOVIES_ENABLED: booleanEnv.default(true),
  SOURCE_DOUBAN_TV_ENABLED: booleanEnv.default(true),
  SOURCE_DEVTO_ENABLED: booleanEnv.default(true),
  SOURCE_STACKOVERFLOW_ENABLED: booleanEnv.default(true),
  SOURCE_WIKIPEDIA_ZH_ENABLED: booleanEnv.default(true),
  SOURCE_LOBSTERS_ENABLED: booleanEnv.default(true),
  SOURCE_SSPAI_ENABLED: booleanEnv.default(true),
  SOURCE_SOLIDOT_ENABLED: booleanEnv.default(true),
  SOURCE_TECHCRUNCH_ENABLED: booleanEnv.default(true),
  SOURCE_NPR_WORLD_ENABLED: booleanEnv.default(true),
  SOURCE_MARKETWATCH_ENABLED: booleanEnv.default(true),
  SOURCE_ARSTECHNICA_ENABLED: booleanEnv.default(true),
  SOURCE_AIHOT_SELECTED_ENABLED: booleanEnv.default(false),
  SOURCE_AIHOT_TOPICS_ENABLED: booleanEnv.default(false),
});

export function loadEnv(values = process.env) {
  return schema.parse(values);
}
