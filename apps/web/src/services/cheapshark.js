import { newsApi } from "./api.js";

const DEALS_URL = "https://www.cheapshark.com/api/1.0/deals";
export const DEALS_PAGE_SIZE = 8;

export function normalizeSteamDeal(value) {
  if (!value || value.storeID !== "1" || value.isOnSale !== "1") return null;
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const salePrice = Number(value.salePrice);
  const normalPrice = Number(value.normalPrice);
  if (!title || !Number.isFinite(salePrice) || !Number.isFinite(normalPrice) || salePrice < 0 || normalPrice <= salePrice) return null;
  const steamAppID = String(value.steamAppID ?? "");
  if (!/^[1-9][0-9]*$/.test(steamAppID)) return null;
  if (typeof value.dealID !== "string" || !value.dealID) return null;
  let dealID;
  try {
    dealID = encodeURIComponent(decodeURIComponent(value.dealID));
  } catch {
    return null;
  }
  if (!/^[A-Za-z0-9%._~-]+$/.test(dealID)) return null;
  let thumbnail = null;
  try {
    const url = new window.URL(value.thumb);
    if (url.protocol === "https:") thumbnail = url.href;
  } catch { /* 缺图时显示占位。 */ }
  return {
    id: dealID,
    steamAppID,
    title,
    thumbnail,
    url: `https://www.cheapshark.com/redirect?dealID=${dealID}`,
  };
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

export async function fetchSteamDeals(pageNumber = 0, { signal, fetcher = fetch, priceFetcher = newsApi.steamPrices } = {}) {
  const url = new window.URL(DEALS_URL);
  url.search = new window.URLSearchParams({ storeID: "1", onSale: "1", pageNumber: String(pageNumber), pageSize: String(DEALS_PAGE_SIZE), sortBy: "DealRating" }).toString();
  const response = await fetcher(url.href, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(response.status === 429 ? "CheapShark 请求频繁，请稍后重试" : `CheapShark 请求失败（${response.status}）`);
  const payload = await response.json();
  if (!Array.isArray(payload)) throw new Error("CheapShark 返回了无效数据");
  const deals = payload.map(normalizeSteamDeal).filter(Boolean);
  if (!deals.length) return { items: [], hasMore: payload.length === DEALS_PAGE_SIZE };
  const ids = [...new Set(deals.map((deal) => deal.steamAppID))];
  const pricePayload = await priceFetcher(ids, signal);
  if (!pricePayload?.prices || typeof pricePayload.prices !== "object") throw new Error("Steam 国区价格数据无效");
  return { items: applySteamPrices(deals, pricePayload.prices), hasMore: payload.length === DEALS_PAGE_SIZE };
}
