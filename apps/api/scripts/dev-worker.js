import { fileURLToPath } from "node:url";

process.env.NODE_ENV = "development";
process.env.DATABASE_PATH = fileURLToPath(new URL("../../../data/dev-news.db", import.meta.url));

await import("../src/worker.js");
