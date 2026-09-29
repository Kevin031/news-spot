// 开发时始终走 Vite 的本地代理；生产构建默认使用部署服务的同源 API。
const API_BASE = import.meta.env.DEV ? "" : (import.meta.env.VITE_API_BASE || "");

async function request(path, { signal } = {}) {
  const response = await fetch(`${API_BASE}${path}`, { signal, headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.message || `请求失败（${response.status}）`);
    error.code = body?.code || "REQUEST_FAILED";
    throw error;
  }
  return body;
}

export const newsApi = {
  sources: (signal) => request("/api/v1/sources", { signal }),
  batch: (ids, limit = 12, signal) => request(`/api/v1/batch?sources=${encodeURIComponent(ids.join(","))}&limit=${limit}`, { signal }),
  hot: (id, { limit = 12, signal } = {}) => request(`/api/v1/hot/${encodeURIComponent(id)}?limit=${limit}`, { signal }),
  steamPrices: (ids, signal) => request(`/api/v1/steam-prices?appids=${encodeURIComponent(ids.join(","))}`, { signal }),
  fetchLogs: ({ limit = 20, cursor, sourceId, status, signal } = {}) => {
    const params = new window.URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    if (sourceId) params.set("sourceId", sourceId);
    if (status) params.set("status", status);
    return request(`/api/v1/fetch-logs?${params}`, { signal });
  },
};
