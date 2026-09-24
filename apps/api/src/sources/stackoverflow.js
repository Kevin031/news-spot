import { hotItemSchema, sanitizeTitle } from "@news-spot/contracts";
import { decodeHtmlEntities } from "../lib/rss.js";

const backoffBySource = new WeakMap();

export async function fetchStackOverflow({ http, source, limit = 20, now = () => Date.now() }) {
  const allowedAt = backoffBySource.get(source) ?? 0;
  if (now() < allowedAt) throw Object.assign(new Error("Stack Exchange API backoff 生效中"), { code: "UPSTREAM_BACKOFF" });
  const url = new URL("https://api.stackexchange.com/2.3/questions");
  url.searchParams.set("pagesize", String(Math.min(limit, 50)));
  url.searchParams.set("order", "desc");
  url.searchParams.set("sort", "hot");
  url.searchParams.set("site", "stackoverflow");
  const payload = await (await http(url, { timeoutMs: source.timeoutMs })).json();
  if (!Array.isArray(payload?.items)) throw new Error("Stack Exchange 返回结构异常");
  if (Number(payload.backoff) > 0) backoffBySource.set(source, now() + Number(payload.backoff) * 1000);
  const fetchedAt = new Date().toISOString();
  return payload.items.slice(0, limit).map((item, index) => hotItemSchema.parse({
    id: String(item.question_id),
    sourceId: source.id,
    title: sanitizeTitle(decodeHtmlEntities(item.title)),
    url: item.link,
    rank: index + 1,
    score: Number(item.score || 0) + Number(item.answer_count || 0),
    summary: null,
    publishedAt: Number.isFinite(item.creation_date) ? new Date(item.creation_date * 1000).toISOString() : null,
    fetchedAt,
  }));
}
