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
    try { await runtime.steamDeals.refresh({ trigger: "manual" }); }
    catch (error) {
      console.error("Worker Steam 优惠抓取失败", error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
    console.info("Worker 单次抓取完成", result);
    if (result.failed > 0) process.exitCode = 1;
  } finally { runtime.close(); }
} else {
  let active = null;
  let stopped = false;
  let steamRetryAfter = 0;
  let steamPending = !runtime.steamDeals.hasSnapshot();
  async function cycle(startup = false) {
    if (active) { schedule.heartbeat(); return; }
    const steamTask = steamPending && Date.now() >= steamRetryAfter
      ? runtime.steamDeals.refresh({ trigger: "cold" }).then(() => { steamPending = false; }).catch((error) => {
        steamRetryAfter = Date.now() + 10 * 60_000;
        console.error("Worker Steam 优惠抓取失败", error instanceof Error ? error.message : String(error));
      })
      : null;
    active = (async () => {
      const result = await schedule.tick();
      if (startup && !result) {
        const cold = await schedule.runMissingSnapshots(runtime.cache);
        if (cold.total) console.info("Worker 启动补抓完成", cold);
      }
      return result;
    })();
    try {
      const result = await active;
      if (steamTask) await steamTask;
      if (result && !steamTask) steamPending = true;
      if (steamPending && Date.now() >= steamRetryAfter) {
        try {
          await runtime.steamDeals.refresh({ trigger: result ? "scheduled" : "cold", slotKey: result?.slotKey });
          steamPending = false;
        }
        catch (error) {
          steamRetryAfter = Date.now() + 10 * 60_000;
          console.error("Worker Steam 优惠抓取失败", error instanceof Error ? error.message : String(error));
        }
      }
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
  await cycle(true);
}
