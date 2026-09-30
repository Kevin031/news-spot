import { createHttpClient } from "../lib/http-client.js";

const SOURCE_ID = "steam-deals";
const PAGE_SIZE = 8;
const MAX_PAGES = 4;
const MAX_ITEMS = 40;
const SNAPSHOT_TTL_MS = 6 * 60 * 60_000;

export function normalizeSteamDeal(value) {
  if (!value || value.storeID !== "1" || value.isOnSale !== "1") return null;
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const salePrice = Number(value.salePrice);
  const normalPrice = Number(value.normalPrice);
  const steamAppID = String(value.steamAppID ?? "");
  if (!title || !Number.isFinite(salePrice) || !Number.isFinite(normalPrice) || salePrice < 0 || normalPrice <= salePrice || !/^[1-9][0-9]*$/.test(steamAppID)) return null;
  if (typeof value.dealID !== "string" || !value.dealID) return null;
  let dealID;
  try { dealID = encodeURIComponent(decodeURIComponent(value.dealID)); }
  catch { return null; }
  if (!/^[A-Za-z0-9%._~-]+$/.test(dealID)) return null;
  let thumbnail = null;
  try {
    const url = new URL(value.thumb);
    if (url.protocol === "https:") thumbnail = url.href;
  } catch { /* 缺图时由页面显示占位。 */ }
  return { id: dealID, steamAppID, title, thumbnail, url: `https://www.cheapshark.com/redirect?dealID=${dealID}` };
}

export function applySteamPrices(deals, prices) {
  return deals.flatMap((deal) => {
    const price = prices?.[deal.steamAppID];
    if (price?.currency !== "CNY" || !Number.isInteger(price.originalCents) || !Number.isInteger(price.finalCents) || !Number.isInteger(price.discountPercent)) return [];
    if (price.originalCents <= price.finalCents || price.finalCents < 0 || price.discountPercent <= 0 || price.discountPercent > 100) return [];
    const localizedName = typeof price.localizedName === "string" ? price.localizedName.trim() : "";
    return [{ ...deal, title: localizedName || deal.title, salePrice: price.finalCents / 100, normalPrice: price.originalCents / 100, discount: price.discountPercent }];
  });
}

export function createSteamDealsService({ fetchImpl = fetch, cache, prices, fetchLogs, now = Date.now } = {}) {
  const http = createHttpClient({ fetchImpl, userAgent: "NewsSpot/0.1 (https://hot-spots.kevinlau.cn)", retries: 1 });
  let pending = null;

  async function refresh({ trigger = "scheduled", slotKey = null } = {}) {
    if (pending) return pending;
    pending = (async () => {
      const logId = fetchLogs?.start(SOURCE_ID, trigger, slotKey);
      const previous = cache.get(SOURCE_ID);
      const items = [];
      try {
        const seen = new Set();
        for (let pageNumber = 0; pageNumber < MAX_PAGES && items.length < MAX_ITEMS; pageNumber += 1) {
          const url = new URL("https://www.cheapshark.com/api/1.0/deals");
          for (const [key, value] of Object.entries({ storeID: "1", onSale: "1", pageNumber: String(pageNumber), pageSize: String(PAGE_SIZE), sortBy: "DealRating" })) url.searchParams.set(key, value);
          const response = await http(url.href, { timeoutMs: 10_000 });
          const payload = await response.json();
          if (!Array.isArray(payload)) throw new Error("CheapShark 返回了无效数据");
          const candidates = payload.map(normalizeSteamDeal).filter((deal) => deal && !seen.has(deal.steamAppID));
          for (const deal of candidates) seen.add(deal.steamAppID);
          if (candidates.length) items.push(...applySteamPrices(candidates, await prices.getPrices(candidates.map((deal) => deal.steamAppID))));
          if (payload.length < PAGE_SIZE) break;
        }
        if (!items.length) throw new Error("未获取到国区折扣游戏");
        cache.set(SOURCE_ID, items.slice(0, MAX_ITEMS), SNAPSHOT_TTL_MS, now());
        if (logId != null) fetchLogs.finish(logId, "success", Math.min(items.length, MAX_ITEMS));
        return cache.get(SOURCE_ID);
      } catch (error) {
        if (!previous && items.length) cache.set(SOURCE_ID, items.slice(0, MAX_ITEMS), SNAPSHOT_TTL_MS, now());
        cache.recordError(SOURCE_ID, error instanceof Error ? error.message : String(error));
        if (logId != null) fetchLogs.finish(logId, "failure", 0, Number.isInteger(error?.statusCode) ? `HTTP_${error.statusCode}` : "DEALS_UNAVAILABLE");
        throw error;
      }
    })();
    try { return await pending; }
    finally { pending = null; }
  }

  function getPage(pageNumber) {
    const snapshot = cache.get(SOURCE_ID);
    if (!snapshot) return null;
    const start = pageNumber * PAGE_SIZE;
    return {
      items: snapshot.items.slice(start, start + PAGE_SIZE),
      hasMore: start + PAGE_SIZE < snapshot.items.length,
      fetchedAt: new Date(snapshot.fetchedAt).toISOString(),
      stale: Boolean(snapshot.lastError) || snapshot.expiresAt <= now(),
    };
  }

  return { refresh, getPage, hasSnapshot: () => Boolean(cache.get(SOURCE_ID)) };
}
