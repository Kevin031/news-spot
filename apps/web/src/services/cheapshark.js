import { newsApi } from "./api.js";

export const DEALS_PAGE_SIZE = 8;

export async function fetchSteamDeals(pageNumber = 0, { signal, dealFetcher = newsApi.steamDeals } = {}) {
  const snapshot = await dealFetcher(pageNumber, signal);
  if (!Array.isArray(snapshot?.items) || typeof snapshot.hasMore !== "boolean") throw new Error("游戏优惠快照数据无效");
  return snapshot;
}
