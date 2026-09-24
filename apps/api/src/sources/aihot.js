import { hotItemSchema, sanitizeTitle } from "@news-spot/contracts";

const BASE = "https://aihot.news";
const selectedUrl = `${BASE}/api/v1/items?mode=selected&window=24h&limit=20`;
const topicsUrl = `${BASE}/api/v1/hot-topics`;
const stateBySource = new WeakMap();

function httpUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function isoDate(value) {
  return value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null;
}

function cacheTtlMs(value) {
  const match = /(?:^|,)\s*s-maxage=(\d+)/i.exec(value || "");
  return Math.max(Number(match?.[1] ?? 60) * 1000, 60_000);
}

function mapItem(row, source, index, fetchedAt, isTopic) {
  const original = httpUrl(row?.links?.original);
  const aihot = httpUrl(row?.links?.aihot);
  if (!original || !aihot || !row?.id || !sanitizeTitle(row.title)) return null;
  const attributionUrl = httpUrl(row?.attribution?.url) || aihot;
  const parsed = hotItemSchema.safeParse({
    id: String(row.id),
    sourceId: source.id,
    title: sanitizeTitle(row.title),
    url: original,
    rank: isTopic && Number.isInteger(row.rank) && row.rank > 0 ? row.rank : index + 1,
    score: null,
    summary: isTopic ? null : sanitizeTitle(row.summary).slice(0, 500) || null,
    publishedAt: isTopic ? null : isoDate(row.publishedAt),
    fetchedAt,
    originalSourceName: sanitizeTitle(row?.source?.name).slice(0, 200) || "未知信源",
    attribution: { name: sanitizeTitle(row?.attribution?.name).slice(0, 100) || "AIHOT", url: attributionUrl },
    ...(isTopic && Number.isInteger(row.sourceCount) && row.sourceCount >= 0 ? { sourceCount: row.sourceCount } : {}),
  });
  return parsed.success ? parsed.data : null;
}

async function fetchAihot({ http, source, logger, onNotModified, limit = 20, now = () => Date.now() }, url, isTopic) {
  const state = stateBySource.get(source) ?? { etag: null, items: null, backoffUntil: 0, cacheUntil: 0 };
  if (now() < state.backoffUntil) throw Object.assign(new Error("AIHOT 请求间隔限制生效中"), { code: "UPSTREAM_BACKOFF" });
  if (state.items && now() < state.cacheUntil) return state.items.slice(0, limit);
  let response;
  try {
    response = await http(url, {
      timeoutMs: source.timeoutMs,
      allowNotModified: true,
      retryOn429: false,
      headers: state.etag && state.items ? { "If-None-Match": state.etag } : {},
    });
  } catch (error) {
    if (error?.statusCode === 429) {
      state.backoffUntil = now() + Math.max(error.retryAfterMs ?? 60_000, 60_000);
      stateBySource.set(source, state);
    }
    throw error;
  }
  const fetchedAt = new Date(now()).toISOString();
  if (response.status === 304) {
    if (!state.items) throw new Error("AIHOT 返回 304 但没有可用快照");
    onNotModified?.();
    state.items = state.items.map((item) => ({ ...item, fetchedAt }));
    state.cacheUntil = now() + cacheTtlMs(response.headers.get("Cache-Control"));
    return state.items.slice(0, limit);
  }
  const payload = await response.json();
  if (payload?.schemaVersion !== 1 || !Array.isArray(payload.items)) throw new Error("AIHOT 返回结构异常");
  const items = payload.items.map((row, index) => mapItem(row, source, index, fetchedAt, isTopic)).filter(Boolean);
  if (items.length !== payload.items.length) logger?.warn({ sourceId: source.id, invalidCount: payload.items.length - items.length }, "AIHOT 跳过无效条目");
  if (items.length === 0) throw new Error("AIHOT 上游返回空数据或无有效条目");
  state.items = items;
  state.etag = response.headers.get("ETag");
  state.cacheUntil = now() + cacheTtlMs(response.headers.get("Cache-Control"));
  stateBySource.set(source, state);
  return items.slice(0, limit);
}

export const fetchAihotSelected = (context) => fetchAihot(context, selectedUrl, false);
export const fetchAihotTopics = (context) => fetchAihot(context, topicsUrl, true);
