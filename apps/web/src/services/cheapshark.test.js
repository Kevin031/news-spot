import { describe, expect, it, vi } from "vitest";
import { applySteamPrices, fetchSteamDeals, normalizeSteamDeal } from "./cheapshark.js";

const deal = {
  storeID: "1", isOnSale: "1", title: "测试游戏", salePrice: "2.99", normalPrice: "19.99",
  savings: "85.042521", dealID: "ab%2Bcd%3D", steamAppID: "620", thumb: "https://shared.fastly.steamstatic.com/capsule.jpg",
};

describe("CheapShark Steam 优惠", () => {
  it("保留缩略图和 Steam App ID，跳转到 CheapShark", () => {
    expect(normalizeSteamDeal(deal)).toMatchObject({
      title: "测试游戏", thumbnail: deal.thumb, steamAppID: "620",
      url: "https://www.cheapshark.com/redirect?dealID=ab%2Bcd%3D",
    });
  });

  it("过滤非 Steam 或非促销，并为缺图条目保留占位", () => {
    expect(normalizeSteamDeal({ ...deal, storeID: "2" })).toBeNull();
    expect(normalizeSteamDeal({ ...deal, isOnSale: "0" })).toBeNull();
    expect(normalizeSteamDeal({ ...deal, salePrice: "NaN" })).toBeNull();
    expect(normalizeSteamDeal({ ...deal, steamAppID: null })).toBeNull();
    expect(normalizeSteamDeal({ ...deal, dealID: "bad%" })).toBeNull();
    expect(normalizeSteamDeal({ ...deal, thumb: "http://example.com/x.jpg" }).thumbnail).toBeNull();
  });

  it("请求零基分页并识别后续页", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => Array(8).fill(deal) });
    const priceFetcher = vi.fn().mockResolvedValue({ prices: { "620": { currency: "CNY", originalCents: 4200, finalCents: 2100, discountPercent: 50 } } });
    const result = await fetchSteamDeals(2, { fetcher, priceFetcher });
    const url = new window.URL(fetcher.mock.calls[0][0]);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ storeID: "1", onSale: "1", pageNumber: "2", pageSize: "8" });
    expect(result.items).toHaveLength(8);
    expect(priceFetcher).toHaveBeenCalledWith(["620"], undefined);
    expect(result.items[0]).toMatchObject({ salePrice: 21, normalPrice: 42, discount: 50 });
    expect(result.hasMore).toBe(true);
  });

  it("只显示 Steam 确认在国区打折的人民币价格", () => {
    const normalized = normalizeSteamDeal(deal);
    expect(applySteamPrices([normalized], { "620": { currency: "CNY", originalCents: 4200, finalCents: 2100, discountPercent: 50 } })).toHaveLength(1);
    expect(applySteamPrices([normalized], { "620": { currency: "CNY", originalCents: 4200, finalCents: 2100, discountPercent: 50, localizedName: "传送门 2" } })[0].title).toBe("传送门 2");
    expect(applySteamPrices([normalized], { "620": { currency: "CNY", originalCents: 4200, finalCents: 4200, discountPercent: 0 } })).toHaveLength(0);
    expect(applySteamPrices([normalized], { "620": null })).toHaveLength(0);
  });

  it("清楚报告限流和无效响应", async () => {
    await expect(fetchSteamDeals(0, { fetcher: async () => ({ ok: false, status: 429 }) })).rejects.toThrow("请求频繁");
    await expect(fetchSteamDeals(0, { fetcher: async () => ({ ok: true, json: async () => ({}) }) })).rejects.toThrow("无效数据");
  });
});
