import { describe, expect, it, vi } from "vitest";
import { useSources } from "./useSources.js";

const source = { id: "hackernews", name: "Hacker News", category: "tech" };
const sources = (count) => Array.from({ length: count }, (_, index) => ({ id: `source-${index}`, name: `Source ${index}`, category: "tech" }));
const resultFor = (id) => ({ sourceId: id, status: "fresh", success: true, items: [] });

describe("useSources", () => {
  it("先加载来源再批量加载数据", async () => {
    const api = {
      sources: vi.fn(async () => ({ sources: [source] })),
      batch: vi.fn(async () => ({ results: [{ sourceId: "hackernews", status: "fresh", success: true, items: [] }] })),
      hot: vi.fn(),
    };
    const state = useSources(api);
    await state.load();
    expect(state.sources.value).toEqual([source]);
    expect(state.results.value.hackernews.status).toBe("fresh");
  });

  it("刷新失败时保留来源并展示错误", async () => {
    const api = { sources: vi.fn(), batch: vi.fn(), hot: vi.fn(async () => { throw new Error("失败"); }) };
    const state = useSources(api);
    state.results.value = { hackernews: { sourceId: "hackernews", status: "fresh", items: [] } };
    await state.refreshSource("hackernews");
    expect(state.results.value.hackernews).toMatchObject({ status: "error", error: { message: "失败" } });
  });

  it("将 14 个来源分成 6、6、2 三批渐进加载", async () => {
    const allSources = sources(14);
    const api = {
      sources: vi.fn(async () => ({ sources: allSources })),
      batch: vi.fn(async (ids) => ({ results: ids.map(resultFor) })),
      hot: vi.fn(),
    };
    const state = useSources(api);
    await state.load();
    expect(api.batch.mock.calls.map(([ids]) => ids.length)).toEqual([6, 6, 2]);
    expect(Object.keys(state.results.value)).toHaveLength(14);
    expect(state.loading.value).toBe(false);
  });

  it("单批失败只标记该批来源，不覆盖已成功批次", async () => {
    const allSources = sources(14);
    let call = 0;
    const api = {
      sources: vi.fn(async () => ({ sources: allSources })),
      batch: vi.fn(async (ids) => {
        call += 1;
        if (call === 2) throw new Error("批次失败");
        return { results: ids.map(resultFor) };
      }),
      hot: vi.fn(),
    };
    const state = useSources(api);
    await state.load();
    expect(state.results.value["source-0"].status).toBe("fresh");
    expect(state.results.value["source-6"]).toMatchObject({ status: "error", error: { message: "批次失败" } });
    expect(state.results.value["source-12"].status).toBe("fresh");
  });

  it("全部刷新最多并发三个来源", async () => {
    const allSources = sources(8);
    let active = 0;
    let maxActive = 0;
    const api = {
      hot: vi.fn(async (id) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active -= 1;
        return resultFor(id);
      }),
    };
    const state = useSources(api);
    state.sources.value = allSources;
    state.results.value = Object.fromEntries(allSources.map((item) => [item.id, resultFor(item.id)]));
    await state.refreshAll();
    expect(api.hot).toHaveBeenCalledTimes(8);
    expect(maxActive).toBe(3);
    expect(api.hot.mock.calls.every(([, options]) => !Object.hasOwn(options, "refresh"))).toBe(true);
  });
});
