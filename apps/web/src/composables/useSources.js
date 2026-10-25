import { ref } from "vue";
import { newsApi } from "../services/api.js";

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
      const payload = await api.feed(12, currentController.signal);
      if (currentController.signal.aborted) return;
      sources.value = payload.sources;
      results.value = Object.fromEntries(payload.results.map((result) => [result.sourceId, result]));
    } catch (error) {
      if (error.name !== "AbortError" && !currentController.signal.aborted) {
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
    await load();
  }
  function stop() { controller?.abort(); }
  return { sources, results, loading, load, refreshSource, refreshAll, stop };
}
