import { sanitizeTitle } from "@news-spot/contracts";

export async function fetchHackerNews({ http, source, limit = 20 }) {
  const ids = await (await http("https://hacker-news.firebaseio.com/v0/topstories.json", { timeoutMs: source.timeoutMs, retryCount: 0 })).json();
  const selected = ids.slice(0, Math.min(limit * 2, 50));
  const rows = [];
  for (let offset = 0; offset < selected.length && rows.length < limit; offset += 8) {
    const batch = await Promise.all(selected.slice(offset, offset + 8).map(async (id) => {
      const response = await http(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { timeoutMs: source.timeoutMs, retryCount: 0 });
      return response.json();
    }));
    rows.push(...batch.filter((item) => item && !item.deleted && item.title));
  }
  const fetchedAt = new Date().toISOString();
  return rows.slice(0, limit).map((item, index) => ({
    id: String(item.id), sourceId: source.id, title: sanitizeTitle(item.title),
    url: item.url || `https://news.ycombinator.com/item?id=${item.id}`, rank: index + 1,
    score: Number.isFinite(item.score) ? item.score : null, summary: item.descendants == null ? null : `${item.descendants} 条评论`,
    publishedAt: item.time ? new Date(item.time * 1000).toISOString() : null, fetchedAt,
  }));
}
