export class UpstreamError extends Error {
  constructor(message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "UpstreamError";
    this.statusCode = options.statusCode ?? null;
    this.retryable = options.retryable ?? true;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }
}

function retryAfterMs(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

const retryableStatuses = new Set([408, 429, 500, 502, 503, 504]);

export function createHttpClient({ fetchImpl = fetch, userAgent = "NewsSpot/0.1 (+https://localhost)", retries = 2 } = {}) {
  return async function request(url, options = {}) {
    const timeoutMs = options.timeoutMs ?? 8_000;
    const retryCount = options.retryCount ?? retries;
    const allowNotModified = options.allowNotModified ?? false;
    const retryOn429 = options.retryOn429 ?? true;
    const fetchOptions = { ...options };
    delete fetchOptions.timeoutMs;
    delete fetchOptions.retryCount;
    delete fetchOptions.allowNotModified;
    delete fetchOptions.retryOn429;
    let lastError;
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, {
          ...fetchOptions,
          signal: controller.signal,
          headers: { Accept: "application/json, application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8", "User-Agent": userAgent, ...fetchOptions.headers },
        });
        if (allowNotModified && response.status === 304) return response;
        if (!response.ok) {
          const retryable = retryableStatuses.has(response.status) && (response.status !== 429 || retryOn429);
          throw new UpstreamError(`上游返回 HTTP ${response.status}`, { statusCode: response.status, retryable, retryAfterMs: response.status === 429 ? retryAfterMs(response.headers.get("Retry-After")) : null });
        }
        return response;
      } catch (error) {
        const normalized = error instanceof UpstreamError
          ? error
          : new UpstreamError(error?.name === "AbortError" ? `上游请求超时（${timeoutMs}ms）` : "上游网络请求失败", { cause: error, retryable: true });
        lastError = normalized;
        if (!normalized.retryable || attempt === retryCount) throw normalized;
        await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** attempt + Math.floor(Math.random() * 100)));
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError;
  };
}
