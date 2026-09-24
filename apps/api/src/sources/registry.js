import { fetchBbc } from "./bbc.js";
import { fetchBilibili } from "./bilibili.js";
import { fetchGithub } from "./github.js";
import { fetchHackerNews } from "./hackernews.js";
import { fetchIthome } from "./ithome.js";
import { fetchV2ex } from "./v2ex.js";
import { fetchDevto } from "./devto.js";
import { fetchStackOverflow } from "./stackoverflow.js";
import { fetchRssSource } from "./rss-source.js";
import { fetchAihotSelected, fetchAihotTopics } from "./aihot.js";

const rss = (feedUrl) => (context) => fetchRssSource({ ...context, feedUrl });
const apiAdapters = { hackernews: fetchHackerNews, v2ex: fetchV2ex, github: fetchGithub, bilibili: fetchBilibili, devto: fetchDevto, stackoverflow: fetchStackOverflow, "aihot-selected": fetchAihotSelected, "aihot-topics": fetchAihotTopics };
const rssAdapters = {
  bbc: fetchBbc,
  ithome: fetchIthome,
  lobsters: rss("https://lobste.rs/rss"),
  sspai: rss("https://sspai.com/feed"),
  solidot: rss("https://www.solidot.org/index.rss"),
  techcrunch: rss("https://techcrunch.com/feed/"),
  "npr-world": rss("https://feeds.npr.org/1004/rss.xml"),
  marketwatch: rss("https://feeds.content.dowjones.io/public/rss/mw_topstories"),
  arstechnica: rss("https://feeds.arstechnica.com/arstechnica/index"),
};
const adapters = { ...apiAdapters, ...rssAdapters };

export function createSourceRegistry(definitions) {
  const byId = new Map(definitions.map((source) => [source.id, source]));
  return {
    list: () => definitions.filter((source) => source.enabled),
    all: () => definitions,
    get: (id) => byId.get(id) ?? null,
    adapter: (id) => adapters[id] ?? null,
  };
}
