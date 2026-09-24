import { sanitizeTitle } from "@news-spot/contracts";

export async function fetchV2ex({ http, source, limit = 20 }) {
  const rows = await (await http("https://www.v2ex.com/api/topics/hot.json", { timeoutMs: source.timeoutMs })).json();
  const fetchedAt = new Date().toISOString();
  return rows.slice(0, limit).map((item, index) => ({
    id: String(item.id), sourceId: source.id, title: sanitizeTitle(item.title), url: item.url,
    rank: index + 1, score: Number.isFinite(item.replies) ? item.replies : null,
    summary: item.node?.title ? `${item.node.title} · ${item.replies ?? 0} 条回复` : null,
    publishedAt: item.created ? new Date(item.created * 1000).toISOString() : null, fetchedAt,
  }));
}
