import { createHttpClient } from "../lib/http-client.js";

const CACHE_MS = 10 * 60_000;
const NAME_CACHE_MS = 24 * 60 * 60_000;

function normalizePrice(entry) {
  const price = entry?.success && entry.data?.price_overview;
  if (!price || price.currency !== "CNY") return null;
  const originalCents = Number(price.initial);
  const finalCents = Number(price.final);
  const discountPercent = Number(price.discount_percent);
  if (![originalCents, finalCents, discountPercent].every(Number.isInteger) || originalCents < 0 || finalCents < 0 || finalCents > originalCents || discountPercent < 0 || discountPercent > 100) return null;
  return { currency: "CNY", originalCents, finalCents, discountPercent };
}

export function createSteamPriceService({ fetchImpl = fetch, now = Date.now } = {}) {
  const http = createHttpClient({ fetchImpl, userAgent: "NewsSpot/0.1 (https://hot-spots.kevinlau.cn)", retries: 0 });
  const cache = new Map();
  const pending = new Map();
  const nameCache = new Map();
  const namePending = new Map();

  async function fetchBatch(ids) {
    const url = new URL("https://store.steampowered.com/api/appdetails");
    url.searchParams.set("appids", ids.join(","));
    url.searchParams.set("cc", "cn");
    url.searchParams.set("filters", "price_overview");
    const response = await http(url.href, { timeoutMs: 8_000 });
    const data = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Steam 返回了无效价格数据");
    return Object.fromEntries(ids.map((id) => [id, normalizePrice(data[id])]));
  }

  async function getPrices(ids) {
    const unique = [...new Set(ids)];
    const missing = unique.filter((id) => !pending.has(id) && (!cache.has(id) || cache.get(id).expiresAt <= now()));
    if (missing.length) {
      const batch = fetchBatch(missing);
      for (const id of missing) {
        const task = batch.then((prices) => {
          const value = prices[id];
          cache.set(id, { value, expiresAt: now() + CACHE_MS });
          if (cache.size > 500) cache.delete(cache.keys().next().value);
          return value;
        }).finally(() => pending.delete(id));
        pending.set(id, task);
      }
    }
    const entries = await Promise.all(unique.map(async (id) => [id, pending.has(id) ? await pending.get(id) : cache.get(id).value]));
    const prices = Object.fromEntries(entries);
    const pricedIds = unique.filter((id) => prices[id]);
    // Steam 的 basic 过滤器不支持批量 appID，因此限制并发逐个获取本地化名称。
    for (let offset = 0; offset < pricedIds.length; offset += 4) {
      await Promise.all(pricedIds.slice(offset, offset + 4).map(async (id) => {
        prices[id] = { ...prices[id], localizedName: await getLocalizedName(id) };
      }));
    }
    return prices;
  }

  async function getLocalizedName(id) {
    const saved = nameCache.get(id);
    if (saved && saved.expiresAt > now()) return saved.value;
    if (namePending.has(id)) return namePending.get(id);
    const task = (async () => {
      try {
        const url = new URL("https://store.steampowered.com/api/appdetails");
        url.searchParams.set("appids", id);
        url.searchParams.set("cc", "cn");
        url.searchParams.set("l", "schinese");
        url.searchParams.set("filters", "basic");
        const response = await http(url.href, { timeoutMs: 5_000 });
        const data = await response.json();
        const rawName = data?.[id]?.success && data[id].data?.name;
        const value = typeof rawName === "string" ? rawName.trim().slice(0, 300) || null : null;
        nameCache.set(id, { value, expiresAt: now() + NAME_CACHE_MS });
        if (nameCache.size > 500) nameCache.delete(nameCache.keys().next().value);
        return value;
      } catch {
        // 名称不是价格展示的前置条件，失败时保留 CheapShark 标题。
        return null;
      }
    })().finally(() => namePending.delete(id));
    namePending.set(id, task);
    return task;
  }

  return { getPrices };
}
