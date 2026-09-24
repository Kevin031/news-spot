import { loadEnv } from "./config/env.js";
import { setInterval, clearInterval } from "node:timers";
import { createRuntime } from "./runtime.js";
import { createWorkerSchedule } from "./services/worker-schedule.js";

const env = loadEnv();
const runtime = createRuntime({ env, logger: console });
const schedule = createWorkerSchedule({ db: runtime.db, registry: runtime.registry, hotService: runtime.hotService, fetchLogs: runtime.fetchLogs, now: runtime.now, times: runtime.scheduleTimes, timeZone: env.WORKER_TIME_ZONE, logger: console });

if (process.argv.includes("--once")) {
  try {
    const result = await schedule.runOnce();
    console.info("Worker 单次抓取完成", result);
    if (result.failed > 0) process.exitCode = 1;
  } finally { runtime.close(); }
} else {
  let active = null;
  let stopped = false;
  async function cycle() {
    if (active) { schedule.heartbeat(); return; }
    active = schedule.tick();
    try {
      const result = await active;
      if (result) console.info("Worker 时段抓取完成", result);
    } catch (error) {
      console.error("Worker 时段抓取失败", error instanceof Error ? error.message : String(error));
    } finally { active = null; }
  }
  const timer = setInterval(() => { if (!stopped) void cycle(); }, 60_000);
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, async () => {
      stopped = true;
      clearInterval(timer);
      if (active) await active.catch(() => {});
      runtime.close();
      process.exit(0);
    });
  }
  await cycle();
}
