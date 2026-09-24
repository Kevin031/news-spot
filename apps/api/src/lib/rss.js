import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({ ignoreAttributes: false, trimValues: true, parseTagValue: false });

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return value["#text"] ?? value.__cdata ?? "";
  return "";
}

function link(value) {
  if (typeof value === "string") return value;
  const links = asArray(value);
  const preferred = links.find((item) => item?.["@_rel"] === "alternate") ?? links[0];
  return preferred?.["@_href"] ?? text(preferred);
}

export function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

export function parseRss(xml) {
  const data = parser.parse(xml);
  const items = asArray(data?.rss?.channel?.item ?? data?.feed?.entry);
  return items.map((item) => ({
    title: text(item.title),
    link: link(item.link),
    summary: text(item.description ?? item.summary ?? item["content:encoded"] ?? item.content),
    publishedAt: text(item.pubDate ?? item.published ?? item.updated),
    guid: text(item.guid ?? item.id),
  }));
}
