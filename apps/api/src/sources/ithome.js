import { fetchRssSource } from "./rss-source.js";

export function fetchIthome(context) {
  return fetchRssSource({ ...context, feedUrl: "https://www.ithome.com/rss/" });
}
