import { fetchRssSource } from "./rss-source.js";

export function fetchBbc(context) {
  return fetchRssSource({ ...context, feedUrl: "https://feeds.bbci.co.uk/news/world/rss.xml" });
}
