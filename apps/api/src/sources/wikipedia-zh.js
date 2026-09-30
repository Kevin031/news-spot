import { hotItemSchema, sanitizeTitle } from "@news-spot/contracts";

const NON_ARTICLE_PREFIX = /^(?:Wikipedia|Special|特殊|Category|分類|分类|File|檔案|文件|Template|模板|Help|幫助|帮助|Portal|主題|主题|Talk|討論|讨论|User|用户|用戶|Draft|草稿):/i;

export async function fetchWikipediaZh({ http, source, limit = 20, now = () => Date.now() }) {
  // 日榜按 UTC 日期结算，使用前日数据以避开最新日榜的生成延迟。
  const day = new Date(now() - 2 * 86_400_000).toISOString().slice(0, 10);
  const [year, month, date] = day.split("-");
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/zh.wikipedia.org/all-access/${year}/${month}/${date}`;
  const response = await http(url, {
    timeoutMs: source.timeoutMs,
    headers: { "User-Agent": "NewsSpot/0.1 (https://hot-spots.kevinlau.cn)" },
  });
  const payload = await response.json();
  const articles = payload?.items?.[0]?.articles;
  if (!Array.isArray(articles)) throw new Error("Wikimedia 日榜返回结构异常");

  const fetchedAt = new Date(now()).toISOString();
  const items = articles.filter((item) => {
    const title = String(item?.article ?? "").replaceAll("_", " ");
    return title && title !== "-" && title !== "Main Page" && title !== "首页"
      && !NON_ARTICLE_PREFIX.test(title) && Number.isFinite(item?.views) && item.views >= 0;
  }).slice(0, limit).map((item, index) => {
    const article = item.article.replaceAll(" ", "_");
    return hotItemSchema.parse({
      id: article,
      sourceId: source.id,
      title: sanitizeTitle(article.replaceAll("_", " ")),
      url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(article)}`,
      rank: index + 1,
      score: item.views,
      summary: `${day} 浏览量`,
      publishedAt: null,
      fetchedAt,
    });
  });
  if (items.length === 0) throw new Error("Wikimedia 日榜无有效词条");
  return items;
}
