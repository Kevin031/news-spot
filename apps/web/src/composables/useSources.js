import { ref } from "vue";
import { newsApi } from "../services/api.js";

const BATCH_SIZE = 6;
const REFRESH_CONCURRENCY = 3;

function chunks(values, size) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

export function useSources(api = newsApi) {
  const sources = ref([]);
  const results = ref({});
  const loading = ref(false);
  let controller = null;

  function loadingResult(source) {
    return { sourceId: source.id, sourceName: source.name, status: "loading", success: false, stale: false, items: [], error: null };
  }
  async function load() {
    controller?.abort();
    const currentController = new AbortController();
    controller = currentController;
    loading.value = true;
    try {
      const payload = await api.sources(currentController.signal);
      if (currentController.signal.aborted) return;
      sources.value = payload.sources;
      results.value = Object.fromEntries(sources.value.map((source) => [source.id, loadingResult(source)]));
      for (const batchSources of chunks(sources.value, BATCH_SIZE)) {
        if (currentController.signal.aborted) return;
        try {
          const batch = await api.batch(batchSources.map((source) => source.id), 12, currentController.signal);
          if (currentController.signal.aborted) return;
          results.value = { ...results.value, ...Object.fromEntries(batch.results.map((result) => [result.sourceId, result])) };
        } catch (error) {
          if (error.name === "AbortError" || currentController.signal.aborted) return;
          const failed = Object.fromEntries(batchSources.map((source) => [source.id, { ...loadingResult(source), status: "error", error: { message: error.message } }]));
          results.value = { ...results.value, ...failed };
        }
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        results.value = Object.fromEntries(sources.value.map((source) => [source.id, { ...loadingResult(source), status: "error", error: { message: error.message } }]));
      }
    } finally {
      if (controller === currentController) loading.value = false;
    }
  }
  async function refreshSource(id) {
    const previous = results.value[id];
    results.value = { ...results.value, [id]: { ...previous, status: "loading" } };
    try { results.value = { ...results.value, [id]: await api.hot(id, { limit: 12 }) }; }
    catch (error) { results.value = { ...results.value, [id]: { ...previous, status: "error", success: false, error: { message: error.message } } }; }
  }
  async function refreshAll() {
    loading.value = true;
    let nextIndex = 0;
    async function worker() {
      while (nextIndex < sources.value.length) {
        const source = sources.value[nextIndex];
        nextIndex += 1;
        await refreshSource(source.id);
      }
    }
    await Promise.all(Array.from({ length: Math.min(REFRESH_CONCURRENCY, sources.value.length) }, worker));
    loading.value = false;
  }
  function stop() { controller?.abort(); }
  return { sources, results, loading, load, refreshSource, refreshAll, stop };
}
