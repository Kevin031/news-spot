import { sanitizeTitle } from "@news-spot/contracts";

export async function fetchGithub({ http, source, env, limit = 20 }) {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const url = new URL("https://api.github.com/search/repositories");
  url.searchParams.set("q", `created:>${since}`);
  url.searchParams.set("sort", "stars");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", String(limit));
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  let response;
  try {
    response = await http(url, { timeoutMs: source.timeoutMs, headers });
  } catch (error) {
    if (!env.GITHUB_TOKEN || error?.statusCode !== 401) throw error;
    delete headers.Authorization;
    response = await http(url, { timeoutMs: source.timeoutMs, headers });
  }
  const payload = await response.json();
  const fetchedAt = new Date().toISOString();
  return (payload.items ?? []).slice(0, limit).map((item, index) => ({
    id: String(item.id), sourceId: source.id, title: sanitizeTitle(item.full_name), url: item.html_url,
    rank: index + 1, score: item.stargazers_count ?? null, summary: sanitizeTitle(item.description) || null,
    publishedAt: item.created_at ?? null, fetchedAt,
  }));
}
