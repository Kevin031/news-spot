import { describe, expect, it } from "vitest";
import { orderSourcesByAvailability } from "./source-order.js";

describe("orderSourcesByAvailability", () => {
  it("将不可用来源置底并保持其他来源原顺序", () => {
    const sources = [
      { id: "bilibili", status: "unknown" },
      { id: "ithome", status: "unknown" },
      { id: "sspai", status: "unknown" },
      { id: "solidot", status: "unknown" },
    ];
    const results = {
      bilibili: { status: "error", items: [] },
      ithome: { status: "fresh", items: [{}] },
      sspai: { status: "stale", items: [{}] },
      solidot: { status: "loading", items: [] },
    };

    expect(orderSourcesByAvailability(sources, results).map((source) => source.id)).toEqual(["ithome", "sspai", "solidot", "bilibili"]);
  });

  it("来源恢复后回到配置顺序", () => {
    const sources = [{ id: "bilibili" }, { id: "ithome" }];
    const results = { bilibili: { status: "fresh" }, ithome: { status: "fresh" } };
    expect(orderSourcesByAvailability(sources, results).map((source) => source.id)).toEqual(["bilibili", "ithome"]);
  });
});
