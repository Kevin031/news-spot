import { describe, expect, it, vi } from "vitest";
import { createSteamPriceService } from "../src/services/steam-price-service.js";

const steamResponse = {
  "620": { success: true, data: { price_overview: { currency: "CNY", initial: 4200, final: 2100, discount_percent: 50 } } },
  "1057090": { success: true, data: { price_overview: { currency: "USD", initial: 1000, final: 500, discount_percent: 50 } } },
};

describe("Steam 国区价格", () => {
  it("批量查询、过滤非人民币价格，并在有效期内复用结果", async () => {
    let current = 1000;
    const fetchImpl = vi.fn().mockImplementation(async (url) => {
      const query = new URL(url).searchParams;
      return new Response(JSON.stringify(query.get("filters") === "basic" ? { "620": { success: true, data: { name: "传送门 2" } } } : steamResponse), { status: 200 });
    });
    const service = createSteamPriceService({ fetchImpl, now: () => current });
    const [first, second] = await Promise.all([
      service.getPrices(["620", "1057090"]), service.getPrices(["620", "1057090"]),
    ]);
    expect(first).toEqual(second);
    expect(first["620"]).toEqual({ currency: "CNY", originalCents: 4200, finalCents: 2100, discountPercent: 50, localizedName: "传送门 2" });
    expect(first["1057090"]).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(Object.fromEntries(url.searchParams)).toEqual({ appids: "620,1057090", cc: "cn", filters: "price_overview" });
    await service.getPrices(["620"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    current += 600_001;
    await service.getPrices(["620"]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const nameUrl = new URL(fetchImpl.mock.calls[1][0]);
    expect(Object.fromEntries(nameUrl.searchParams)).toEqual({ appids: "620", cc: "cn", l: "schinese", filters: "basic" });
  });

  it("上游失败时不缓存错误", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify(steamResponse), { status: 200 })).mockResolvedValueOnce(new Response(null, { status: 503 }));
    const service = createSteamPriceService({ fetchImpl });
    await expect(service.getPrices(["620"])).rejects.toThrow();
    expect((await service.getPrices(["620"]))["620"].finalCents).toBe(2100);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
