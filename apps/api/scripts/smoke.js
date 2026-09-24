import { buildApp } from "../src/app.js";

const minSuccess = Number(process.env.SMOKE_MIN_SUCCESS || 8);
if (!Number.isInteger(minSuccess) || minSuccess < 1) throw new Error("SMOKE_MIN_SUCCESS 必须是正整数");

const app = await buildApp({ databasePath: ":memory:", logger: false });
const ids = app.newsSpot.registry.list().map((source) => source.id);
const results = [];
let nextIndex = 0;

async function worker() {
  while (nextIndex < ids.length) {
    const sourceId = ids[nextIndex];
    nextIndex += 1;
    const started = Date.now();
    const result = await app.newsSpot.hotService.refreshSource(sourceId, { trigger: "manual", limit: 3 });
    results.push({ sourceId, success: result?.success ?? false, stale: result?.stale ?? false, count: result?.items?.length ?? 0, durationMs: Date.now() - started, error: result?.error?.message ?? result?.staleReason ?? null });
  }
}

await Promise.all(Array.from({ length: Math.min(3, ids.length) }, worker));
results.sort((left, right) => ids.indexOf(left.sourceId) - ids.indexOf(right.sourceId));
console.table(results);
const successCount = results.filter((row) => row.success && row.count > 0).length;
console.log(`真实来源 smoke：${successCount}/${ids.length} 成功，门禁 ${minSuccess}`);
await app.close();
if (successCount < minSuccess) process.exitCode = 1;
