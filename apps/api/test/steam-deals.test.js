import { describe, expect, it, vi } from "vitest";
import { createDatabase } from "../src/db/index.js";
import { createCacheService } from "../src/services/cache-service.js";
import { applySteamPrices, createSteamDealsService, normalizeSteamDeal } from "../src/services/steam-deals-service.js";

const deal = {
  storeID: "1", isOnSale: "1", title: "测试游戏", salePrice: "2.99", normalPrice: "19.99",
  dealID: "ab%2Bcd%3D", steamAppID: "620", thumb: "https://shared.fastly.steamstatic.com/capsule.jpg",
};

const price = { currency: "CNY", originalCents: 4200, finalCents: 2100, discountPercent: 50, localizedName: "传送门 2" };

describe("Steam 优惠快照", () => {
  it("校验候选游戏并只接受真实国区折扣", () => {
    const normalized = normalizeSteamDeal(deal);
    expect(normalized).toMatchObject({ steamAppID: "620", url: "https://www.cheapshark.com/redirect?dealID=ab%2Bcd%3D", thumbnail: deal.thumb });
    expect(normalizeSteamDeal({ ...deal, storeID: "2" })).toBeNull();
    expect(normalizeSteamDeal({ ...deal, steamAppID: null })).toBeNull();
    expect(applySteamPrices([normalized], { "620": price })[0]).toMatchObject({ title: "传送门 2", salePrice: 21, normalPrice: 42, discount: 50 });
    expect(applySteamPrices([normalized], { "620": { ...price, discountPercent: 0, finalCents: 4200 } })).toEqual([]);
  });

  it("Worker 抓取后接口只读快照，刷新失败保留旧数据", async () => {
    const db = createDatabase(":memory:");
    const cache = createCacheService(db);
    let fail = false;
    const fetchImpl = vi.fn(async () => fail ? new Response(null, { status: 403 }) : new Response(JSON.stringify([deal]), { status: 200 }));
    const prices = { getPrices: vi.fn(async () => ({ "620": price })) };
    const service = createSteamDealsService({ fetchImpl, cache, prices, now: () => 1_000 });
    try {
      expect(service.getPage(0)).toBeNull();
      await service.refresh();
      const count = fetchImpl.mock.calls.length;
      expect(service.getPage(0)).toMatchObject({ items: [{ title: "传送门 2", salePrice: 21 }], hasMore: false, stale: false });
      expect(fetchImpl).toHaveBeenCalledTimes(count);
      fail = true;
      await expect(service.refresh()).rejects.toThrow();
      expect(service.getPage(0).items[0].title).toBe("传送门 2");
      expect(service.getPage(0).stale).toBe(true);
    } finally { db.close(); }
  });

  it("后续页失败时保存已校验的首批游戏", async () => {
    const db = createDatabase(":memory:");
    const cache = createCacheService(db);
    const fetchImpl = async (url) => Number(new URL(url).searchParams.get("pageNumber")) === 0
      ? new Response(JSON.stringify(Array.from({ length: 8 }, (_, index) => ({ ...deal, dealID: `deal-${index}`, steamAppID: String(620 + index) }))), { status: 200 })
      : new Response(null, { status: 403 });
    const prices = { getPrices: async (ids) => Object.fromEntries(ids.map((id) => [id, price])) };
    const service = createSteamDealsService({ fetchImpl, cache, prices });
    try {
      await expect(service.refresh()).rejects.toThrow();
      expect(service.getPage(0)).toMatchObject({ hasMore: false, stale: true });
      expect(service.getPage(0).items).toHaveLength(8);
    } finally { db.close(); }
  });
});
