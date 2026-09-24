import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const apiDir = fileURLToPath(new URL("../apps/api/", import.meta.url));
const webDir = fileURLToPath(new URL("../apps/web/", import.meta.url));
const apiPort = process.env.DEV_API_PORT || "3001";
const webPort = process.env.DEV_WEB_PORT || "5173";

function start(name, args, cwd, stdin) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: process.env,
    stdio: [stdin, "inherit", "inherit"],
  });
  child.on("error", (error) => {
    console.error(`${name} 启动失败：${error.message}`);
    stop(1);
  });
  child.on("exit", (code, signal) => {
    if (!stopping) {
      console.error(`${name} 已退出（${signal || code}）`);
      stop(code || 1);
    }
  });
  return child;
}

let stopping = false;
const children = [];
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
}

console.log(`开发 API：http://127.0.0.1:${apiPort}`);
children.push(start("API", ["--watch", "scripts/dev.js"], apiDir, "ignore"));
children.push(start("Web", ["node_modules/vite/bin/vite.js", "--port", webPort], webDir, "inherit"));

process.on("SIGINT", () => stop(130));
process.on("SIGTERM", () => stop(143));
