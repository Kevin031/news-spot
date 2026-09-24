import { createHash } from "node:crypto";
import { hotItemSchema, sanitizeTitle } from "@news-spot/contracts";
import { decodeHtmlEntities, parseRss } from "../lib/rss.js";

function plainText(value) {
  return decodeHtmlEntities(String(value ?? "").replace(/<[^>]*>/g, " "));
}

function isHttpUrl(value) {
  try { return ["http:", "https:"].includes(new URL(value).protocol); }
  catch { return false; }
}

export async function fetchRssSource({ http, source, feedUrl, limit = 20 }) {
  const xml = await (await http(feedUrl, { timeoutMs: source.timeoutMs, headers: { Accept: "application/rss+xml, application/xml, text/xml" } })).text();
  const fetchedAt = new Date().toISOString();
  const seen = new Set();
  const items = parseRss(xml).filter((item) => {
    if (!item.title || !isHttpUrl(item.link) || seen.has(item.link)) return false;
    seen.add(item.link);
    return true;
  }).slice(0, limit);
  return items.map((item, index) => {
    const rawId = String(item.guid || item.link);
    const id = rawId.length <= 300 ? rawId : createHash("sha1").update(rawId).digest("hex");
    return hotItemSchema.parse({
    id, sourceId: source.id,
    title: sanitizeTitle(decodeHtmlEntities(item.title)), url: item.link, rank: index + 1, score: null,
    summary: sanitizeTitle(plainText(item.summary)).slice(0, 500) || null,
    publishedAt: item.publishedAt && !Number.isNaN(Date.parse(item.publishedAt)) ? new Date(item.publishedAt).toISOString() : null,
    fetchedAt,
  });
  });
}
