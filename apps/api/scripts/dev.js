import { fileURLToPath } from "node:url";

// 开发环境固定使用独立端口和数据库，避免误连本机运行的生产服务。
process.env.NODE_ENV = "development";
process.env.HOST = "127.0.0.1";
process.env.PORT = process.env.DEV_API_PORT || "3001";
process.env.DATABASE_PATH = fileURLToPath(new URL("../../../data/dev-news.db", import.meta.url));
delete process.env.WEB_DIST_PATH;

await import("../src/server.js");
