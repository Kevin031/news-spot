import { URL, URLSearchParams } from "node:url";
import { sanitizeTitle } from "@news-spot/contracts";

const BASE_URL = "https://movie.douban.com";

function posterUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "doubanio.com" || url.hostname.endsWith(".doubanio.com")) ? url.href : null;
  } catch {
    return null;
  }
}

async function fetchDouban({ http, source, limit = 20 }, type) {
  const params = new URLSearchParams({ type, tag: "热门", sort: "recommend", page_limit: String(Math.min(limit, 50)), page_start: "0" });
  const response = await http(`${BASE_URL}/j/search_subjects?${params}`, {
    timeoutMs: source.timeoutMs,
    retryOn429: false,
    headers: { Referer: `${BASE_URL}/`, Accept: "application/json" },
  });
  const payload = await response.json();
  if (!Array.isArray(payload?.subjects)) throw new Error("豆瓣热门列表结构异常");
  const fetchedAt = new Date().toISOString();
  const seen = new Set();
  const items = payload.subjects.flatMap((subject) => {
    const id = String(subject?.id ?? "");
    const title = sanitizeTitle(subject?.title);
    if (!/^\d+$/.test(id) || !title || seen.has(id)) return [];
    seen.add(id);
    const rate = Number(subject.rate);
    const rating = subject.rate !== "" && Number.isFinite(rate) && rate > 0 && rate <= 10 ? rate : null;
    const details = [];
    if (type === "tv") {
      const episodes = sanitizeTitle(subject.episodes_info);
      if (episodes) details.push(episodes);
    }
    return [{
      id, sourceId: source.id, title,
      url: `${BASE_URL}/subject/${id}/`, rank: seen.size, score: null,
      posterUrl: posterUrl(subject.cover), rating,
      summary: details.join(" · ") || null, publishedAt: null, fetchedAt,
    }];
  });
  if (items.length === 0) throw new Error("豆瓣热门列表无有效条目");
  return items.slice(0, limit);
}

export const fetchDoubanMovies = (context) => fetchDouban(context, "movie");
export const fetchDoubanTv = (context) => fetchDouban(context, "tv");
