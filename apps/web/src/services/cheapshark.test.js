import { describe, expect, it, vi } from "vitest";
import { fetchSteamDeals } from "./cheapshark.js";

describe("Steam 游戏优惠快照", () => {
  it("按页读取本站已保存的游戏和人民币价格", async () => {
    const snapshot = { items: [{ id: "deal", title: "测试游戏", salePrice: 21, normalPrice: 42, discount: 50 }], hasMore: true, fetchedAt: new Date().toISOString(), stale: false };
    const dealFetcher = vi.fn().mockResolvedValue(snapshot);
    expect(await fetchSteamDeals(2, { dealFetcher })).toEqual(snapshot);
    expect(dealFetcher).toHaveBeenCalledWith(2, undefined);
  });

  it("拒绝无效快照", async () => {
    await expect(fetchSteamDeals(0, { dealFetcher: async () => ({}) })).rejects.toThrow("数据无效");
  });
});
