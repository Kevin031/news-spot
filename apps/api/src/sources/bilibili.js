import { sanitizeTitle } from "@news-spot/contracts";

export async function fetchBilibili({ http, source, limit = 20 }) {
  const payload = await (await http("https://api.bilibili.com/x/web-interface/ranking/v2?rid=0&type=all", { timeoutMs: source.timeoutMs, headers: { Referer: "https://www.bilibili.com/" } })).json();
  if (payload.code !== 0 || !Array.isArray(payload.data?.list)) throw new Error(`Bilibili 返回异常状态: ${payload.code}`);
  const fetchedAt = new Date().toISOString();
  return payload.data.list.slice(0, limit).map((item, index) => ({
    id: String(item.bvid || item.aid), sourceId: source.id, title: sanitizeTitle(item.title),
    url: `https://www.bilibili.com/video/${item.bvid || `av${item.aid}`}`, rank: index + 1,
    score: Number.isFinite(item.stat?.view) ? item.stat.view : null,
    summary: item.owner?.name ? `${item.owner.name} · ${item.stat?.danmaku ?? 0} 条弹幕` : null,
    publishedAt: item.pubdate ? new Date(item.pubdate * 1000).toISOString() : null, fetchedAt,
  }));
}
