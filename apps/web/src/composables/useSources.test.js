import { describe, expect, it, vi } from "vitest";
import { useSources } from "./useSources.js";

const source = { id: "hackernews", name: "Hacker News", category: "tech" };
const sources = (count) => Array.from({ length: count }, (_, index) => ({ id: `source-${index}`, name: `Source ${index}`, category: "tech" }));
const resultFor = (id) => ({ sourceId: id, status: "fresh", success: true, items: [] });
const payloadFor = (allSources) => ({ sources: allSources, results: allSources.map(({ id }) => resultFor(id)) });

describe("useSources", () => {
  it("首次加载超过 12 个来源也只请求一次聚合接口", async () => {
    const api = { feed: vi.fn(async () => payloadFor(sources(18))), sources: vi.fn(), batch: vi.fn(), hot: vi.fn() };
    const state = useSources(api);
    await state.load();
    expect(state.sources.value).toHaveLength(18);
    expect(Object.keys(state.results.value)).toHaveLength(18);
    expect(api.feed).toHaveBeenCalledExactlyOnceWith(12, expect.objectContaining({ aborted: false }));
    expect(api.sources).not.toHaveBeenCalled();
    expect(api.batch).not.toHaveBeenCalled();
    expect(api.hot).not.toHaveBeenCalled();
    expect(state.loading.value).toBe(false);
  });

  it("聚合结果中失败来源不影响其他来源", async () => {
    const payload = payloadFor(sources(18));
    payload.results[6] = { ...payload.results[6], status: "error", success: false, error: { message: "尚无快照" } };
    const state = useSources({ feed: async () => payload });
    await state.load();
    expect(state.results.value["source-6"].status).toBe("error");
    expect(state.results.value["source-0"].status).toBe("fresh");
    expect(state.results.value["source-17"].status).toBe("fresh");
  });

  it("全部刷新只请求一次聚合接口，等待时保留已有内容", async () => {
    let finish;
    const api = { feed: vi.fn(() => new Promise((resolve) => { finish = resolve; })), hot: vi.fn() };
    const state = useSources(api);
    state.sources.value = [source];
    state.results.value = { hackernews: resultFor("hackernews") };
    const pending = state.refreshAll();
    expect(state.loading.value).toBe(true);
    expect(state.results.value.hackernews.status).toBe("fresh");
    finish(payloadFor(sources(18)));
    await pending;
    expect(api.feed).toHaveBeenCalledTimes(1);
    expect(api.hot).not.toHaveBeenCalled();
    expect(state.sources.value).toHaveLength(18);
    expect(state.loading.value).toBe(false);
  });

  it("已取消的旧请求不能覆盖新结果或提前清除加载状态", async () => {
    const pending = [];
    const api = { feed: vi.fn((_limit, signal) => new Promise((resolve, reject) => pending.push({ signal, resolve, reject }))) };
    const state = useSources(api);
    const first = state.load();
    const second = state.load();
    expect(pending[0].signal.aborted).toBe(true);
    pending[0].reject(new Error("旧请求失败"));
    await first;
    expect(state.loading.value).toBe(true);
    pending[1].resolve(payloadFor([source]));
    await second;
    expect(state.results.value.hackernews.status).toBe("fresh");
    const third = state.load();
    state.stop();
    pending[2].resolve(payloadFor(sources(18)));
    await third;
    expect(state.sources.value).toEqual([source]);
  });

  it("聚合请求失败后可重新加载恢复", async () => {
    const api = { feed: vi.fn().mockRejectedValueOnce(new Error("连接失败")).mockResolvedValue(payloadFor([source])) };
    const state = useSources(api);
    state.sources.value = [source];
    await state.load();
    expect(state.results.value.hackernews).toMatchObject({ status: "error", error: { message: "连接失败" } });
    expect(state.loading.value).toBe(false);
    await state.load();
    expect(state.results.value.hackernews.status).toBe("fresh");
  });

  it("单卡刷新仍只请求对应来源", async () => {
    const api = { feed: vi.fn(), hot: vi.fn(async () => resultFor("hackernews")) };
    const state = useSources(api);
    await state.refreshSource("hackernews");
    expect(api.hot).toHaveBeenCalledExactlyOnceWith("hackernews", { limit: 12 });
    expect(api.feed).not.toHaveBeenCalled();
    expect(state.results.value.hackernews.status).toBe("fresh");
  });

  it("单卡刷新失败时展示错误", async () => {
    const state = useSources({ hot: async () => { throw new Error("失败"); } });
    state.results.value = { hackernews: resultFor("hackernews") };
    await state.refreshSource("hackernews");
    expect(state.results.value.hackernews).toMatchObject({ status: "error", error: { message: "失败" } });
  });
});
