import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const dryRun = process.argv.includes("--dry-run");
const voltaPnpm = process.env.VOLTA_HOME && resolve(process.env.VOLTA_HOME, "bin/pnpm");
const pnpmCommand = voltaPnpm && existsSync(voltaPnpm) ? voltaPnpm : "pnpm";

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const configFile = process.env.DEPLOY_CONFIG_FILE || resolve(homedir(), ".config/news-spot/deploy.env");
loadEnvFile(configFile);
loadEnvFile(resolve(root, ".env.deploy"));
const childEnv = pnpmCommand !== "pnpm"
  ? { ...process.env, PATH: `${resolve(process.env.VOLTA_HOME, "bin")}${delimiter}${process.env.PATH || ""}` }
  : process.env;

const legacyTarget = process.env.DEPLOY_USER && process.env.DEPLOY_HOST
  ? `${process.env.DEPLOY_USER}@${process.env.DEPLOY_HOST}`
  : "";
const config = {
  target: process.env.DEPLOY_SSH_TARGET || legacyTarget || "tencent-cloud",
  port: process.env.DEPLOY_PORT || "",
  path: process.env.DEPLOY_PATH || "/opt/news-spot",
  appPort: process.env.DEPLOY_APP_PORT || "20245",
  domain: process.env.DEPLOY_DOMAIN || "hot-spots.kevinlau.cn",
  envFile: process.env.DEPLOY_ENV_FILE || "",
  proxyReload: process.env.DEPLOY_PROXY_RELOAD_COMMAND || "",
  keepReleases: process.env.DEPLOY_KEEP_RELEASES || "5",
  nodeImage: process.env.DEPLOY_NODE_IMAGE || "node:22-bookworm-slim",
  npmRegistry: process.env.DEPLOY_NPM_REGISTRY || "https://registry.npmjs.org",
  skipPublicCheck: ["1", "true", "yes"].includes((process.env.DEPLOY_SKIP_PUBLIC_CHECK || "false").toLowerCase()),
};

function fail(message) {
  console.error(`部署错误：${message}`);
  console.error(`部署配置文件：${configFile}`);
  process.exit(1);
}

if (!/^[a-z0-9_.@-]+$/i.test(config.target)) fail("DEPLOY_SSH_TARGET 包含非法字符");
if (config.port && (!/^\d{1,5}$/.test(config.port) || Number(config.port) > 65535)) fail("DEPLOY_PORT 不合法");
if (!/^\d{1,5}$/.test(config.appPort) || Number(config.appPort) > 65535) fail("DEPLOY_APP_PORT 不合法");
if (!/^[a-z0-9.-]+$/i.test(config.domain)) fail("DEPLOY_DOMAIN 不是安全域名");
if (!/^\/[a-z0-9/_.-]+$/i.test(config.path) || config.path === "/" || config.path.length < 8) fail("DEPLOY_PATH 必须是明确的绝对路径");
if (!/^[1-9]\d*$/.test(config.keepReleases)) fail("DEPLOY_KEEP_RELEASES 必须是正整数");
if (!/^[a-z0-9./:_@-]+$/i.test(config.nodeImage)) fail("DEPLOY_NODE_IMAGE 包含非法字符");
if (!/^https:\/\/[a-z0-9./_-]+$/i.test(config.npmRegistry)) fail("DEPLOY_NPM_REGISTRY 必须是安全的 HTTPS 地址");
if (config.envFile && !existsSync(resolve(root, config.envFile))) fail("DEPLOY_ENV_FILE 文件不存在");
if (config.proxyReload && /[\r\n\0]/.test(config.proxyReload)) fail("DEPLOY_PROXY_RELOAD_COMMAND 包含非法换行");

const releaseId = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const releasePath = `${config.path}/releases/${releaseId}`;
const image = `news-spot:${releaseId}`;
const workPath = resolve(root, ".deploy");
const imageTar = resolve(workPath, `${releaseId}.image.tar`);
const imageArchive = `${imageTar}.gz`;
const remoteArchive = `${config.path}/incoming/${releaseId}.image.tar.gz`;
const sshArgs = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3"];
if (config.port) sshArgs.push("-p", config.port);

function run(command, args, options = {}) {
  console.log(`\n> ${options.visible || `${command} ${args.join(" ")}`}`);
  if (dryRun) return;
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env: childEnv });
  if (result.error) fail(`${command} 无法执行：${result.error.message}`);
  if (result.status !== 0) process.exit(result.status || 1);
}

function ssh(script, visible) {
  run("ssh", [...sshArgs, config.target, script], { visible });
}

const shellQuote = (value) => `'${String(value).replaceAll("'", `'"'"'`)}'`;
const rsyncSsh = ["ssh", ...sshArgs].map(shellQuote).join(" ");

console.log("News Spot 腾讯云部署");
console.log(`目标域名：https://${config.domain}`);
console.log(`SSH 目标：${config.target}`);
console.log(`发布目录：${releasePath}`);
console.log(`应用端口：127.0.0.1:${config.appPort}`);
console.log(`模式：${dryRun ? "dry-run" : "正式部署"}`);

if (!dryRun) {
  run(pnpmCommand, ["lint"], { visible: "pnpm lint" });
  run(pnpmCommand, ["typecheck"], { visible: "pnpm typecheck" });
  run(pnpmCommand, ["test"], { visible: "pnpm test" });
  run(pnpmCommand, ["build"], { visible: "pnpm build" });
  run("ssh", [...sshArgs, config.target, "true"], { visible: "ssh <tencent-cloud> 检查连接" });
  mkdirSync(workPath, { recursive: true });
}

run("docker", ["build", "--platform", "linux/amd64", "--build-arg", `NODE_IMAGE=${config.nodeImage}`, "--build-arg", `NPM_REGISTRY=${config.npmRegistry}`, "-t", image, "."], { visible: `docker build --platform linux/amd64 --build-arg NODE_IMAGE=<configured> --build-arg NPM_REGISTRY=<configured> -t ${image} .` });
run("docker", ["save", "--output", imageTar, image], { visible: `docker save ${image}` });
run("gzip", ["-1", "-f", imageTar], { visible: "gzip <production-image>" });

ssh(`mkdir -p '${config.path}/incoming' '${releasePath}/deploy' '${config.path}/shared'`, "ssh <tencent-cloud> 创建发布目录");
run("rsync", ["--archive", "--partial", "--compress", "-e", rsyncSsh, imageArchive, `${config.target}:${remoteArchive}`], { visible: "rsync <production-image> <tencent-cloud>" });
run("rsync", ["--archive", "-e", rsyncSsh, resolve(root, "deploy/compose.prod.yaml"), `${config.target}:${releasePath}/deploy/compose.prod.yaml`], { visible: "rsync <production-compose> <tencent-cloud>" });

if (config.envFile) {
  run("rsync", ["--archive", "--chmod=F600", "-e", rsyncSsh, resolve(root, config.envFile), `${config.target}:${config.path}/shared/.env`], { visible: "rsync <production-env> <tencent-cloud>" });
} else {
  const defaultEnv = [
    "NODE_ENV=production",
    "HOST=0.0.0.0",
    "PORT=3000",
    "DATABASE_PATH=/app/data/news.db",
    "WEB_DIST_PATH=/app/apps/web/dist",
    `CORS_ORIGINS=https://${config.domain}`,
    "LOG_LEVEL=info",
    "WORKER_RUN_TIMES=09:00,15:00",
    "WORKER_TIME_ZONE=Asia/Shanghai",
  ].join("\\n");
  ssh(`test -f '${config.path}/shared/.env' || { umask 077; printf '%b\\n' '${defaultEnv}' > '${config.path}/shared/.env'; }`, "ssh <tencent-cloud> 初始化生产环境变量");
}

ssh(`ln -sfn '${config.path}/shared/.env' '${releasePath}/.env'`, "ssh <tencent-cloud> 关联共享环境变量");

const proxyCommand = config.proxyReload ? `${config.proxyReload} && ` : "";
const deployScript = `set -eu
cd '${releasePath}'
previous=$(docker inspect --format='{{.Config.Image}}' news-spot 2>/dev/null || true)
previous_release=$(readlink -f '${config.path}/current' 2>/dev/null || true)
rollback() {
  echo '新版本检查失败，开始回滚' >&2
  docker logs --tail=120 news-spot >&2 || true
  docker logs --tail=120 news-spot-worker >&2 || true
  if [ -n "$previous" ] && [ -f "$previous_release/deploy/compose.prod.yaml" ]; then
    NEWS_SPOT_IMAGE="$previous" APP_PORT='${config.appPort}' docker compose -p news-spot -f "$previous_release/deploy/compose.prod.yaml" up -d --remove-orphans
  fi
  exit 1
}
gzip -dc '${remoteArchive}' | docker load
NEWS_SPOT_IMAGE='${image}' APP_PORT='${config.appPort}' docker compose -p news-spot -f deploy/compose.prod.yaml up -d --remove-orphans || rollback
api_health=''; worker_health=''; i=0
while [ $i -lt 45 ]; do
  api_health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' news-spot 2>/dev/null || true)
  worker_health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' news-spot-worker 2>/dev/null || true)
  [ "$api_health" = healthy ] && [ "$worker_health" = healthy ] && break
  i=$((i+1)); sleep 2
done
[ "$api_health" = healthy ] && [ "$worker_health" = healthy ] || rollback
curl -fsS 'http://127.0.0.1:${config.appPort}/api/v1/health/live' >/dev/null || rollback
curl -fsS 'http://127.0.0.1:${config.appPort}/api/v1/fetch-logs?limit=1' >/dev/null || rollback
${config.skipPublicCheck ? "" : `curl -fsS --max-time 20 'https://${config.domain}/api/v1/fetch-logs?limit=1' >/dev/null || rollback`}
${proxyCommand}ln -sfn '${releasePath}' '${config.path}/current'
printf '%s\\n' '${image}' > '${config.path}/current-image'
rm -f '${remoteArchive}'
kept=0
for old_release in $(find '${config.path}/releases' -mindepth 1 -maxdepth 1 -type d -printf '%f\\n' | sort -r); do
  kept=$((kept+1))
  if [ "$kept" -gt '${config.keepReleases}' ] && printf '%s' "$old_release" | grep -Eq '^[0-9]{14}$'; then
    rm -rf '${config.path}/releases/'"$old_release"
    docker image rm "news-spot:$old_release" >/dev/null 2>&1 || true
  fi
done
echo 'deployed=${image}'`;
ssh(deployScript, "ssh <tencent-cloud> 载入镜像、健康检查并切换版本");

if (!config.skipPublicCheck) {
  run("curl", ["--noproxy", "*", "--fail", "--silent", "--show-error", "--location", "--max-time", "20", `https://${config.domain}/api/v1/health/live`], { visible: `curl --noproxy '*' https://${config.domain}/api/v1/health/live` });
}

if (!dryRun) rmSync(imageArchive, { force: true });
console.log(`\n部署完成：https://${config.domain}`);
