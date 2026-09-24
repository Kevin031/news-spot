import { hotItemSchema, sanitizeTitle } from "@news-spot/contracts";

export async function fetchDevto({ http, source, limit = 20 }) {
  const url = new URL("https://dev.to/api/articles");
  url.searchParams.set("top", "7");
  url.searchParams.set("per_page", String(Math.min(limit, 50)));
  const rows = await (await http(url, { timeoutMs: source.timeoutMs, retryCount: 1 })).json();
  if (!Array.isArray(rows)) throw new Error("DEV Community 返回结构异常");
  const fetchedAt = new Date().toISOString();
  return rows.slice(0, limit).map((item, index) => hotItemSchema.parse({
    id: String(item.id),
    sourceId: source.id,
    title: sanitizeTitle(item.title),
    url: item.url,
    rank: index + 1,
    score: Number(item.positive_reactions_count || 0) + Number(item.comments_count || 0),
    summary: sanitizeTitle(item.description).slice(0, 500) || null,
    publishedAt: item.published_at && !Number.isNaN(Date.parse(item.published_at)) ? new Date(item.published_at).toISOString() : null,
    fetchedAt,
  }));
}
