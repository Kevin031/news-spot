<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import AppHeader from "./components/AppHeader.vue";
import AppIcon from "./components/AppIcon.vue";
import CategoryTabs from "./components/CategoryTabs.vue";
import SearchDialog from "./components/SearchDialog.vue";
import SourceCard from "./components/SourceCard.vue";
import FetchLogsDialog from "./components/FetchLogsDialog.vue";
import { useSources } from "./composables/useSources.js";
import { orderSourcesByAvailability } from "./utils/source-order.js";

const categories = [
  { id: "all", name: "全部" },
  { id: "china", name: "国内" },
  { id: "tech", name: "科技" },
  { id: "world", name: "国际" },
  { id: "finance", name: "财经" },
  { id: "ai", name: "AI 资讯" },
];
const activeCategory = ref("all");
const search = ref("");
const searchOpen = ref(false);
const fetchLogsOpen = ref(false);
const layout = ref(localStorage.getItem("news-spot-layout") || "grid");
const theme = ref(localStorage.getItem("news-spot-theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
const { sources, results, loading, load, refreshSource, refreshAll, stop } = useSources();

const categoryCounts = computed(() => Object.fromEntries(categories.map((category) => [category.id, category.id === "all" ? sources.value.length : sources.value.filter((source) => source.category === category.id).length])));
const visibleCategories = computed(() => categories.filter((category) => category.id !== "ai" || categoryCounts.value.ai > 0));
const visibleSources = computed(() => orderSourcesByAvailability(
  sources.value.filter((source) => activeCategory.value === "all" || source.category === activeCategory.value),
  results.value,
));
const searchResults = computed(() => {
  const keyword = search.value.trim().toLocaleLowerCase();
  if (!keyword) return [];
  return visibleSources.value.flatMap((source) => (results.value[source.id]?.items || [])
    .filter((item) => item.title.toLocaleLowerCase().includes(keyword))
    .map((item) => ({ ...item, sourceName: source.name })));
});
const onlineCount = computed(() => sources.value.filter((source) => ["fresh", "stale"].includes(results.value[source.id]?.status || source.status)).length);

function toggleTheme() {
  theme.value = theme.value === "light" ? "dark" : "light";
}
function toggleLayout() {
  layout.value = layout.value === "grid" ? "compact" : "grid";
}
function onKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" || event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
    event.preventDefault(); searchOpen.value = true;
  }
}

watch(theme, (value) => { document.documentElement.dataset.theme = value; localStorage.setItem("news-spot-theme", value); }, { immediate: true });
watch(layout, (value) => localStorage.setItem("news-spot-layout", value));
onMounted(() => { window.addEventListener("keydown", onKeydown); load(); });
onBeforeUnmount(() => { window.removeEventListener("keydown", onKeydown); stop(); });
</script>

<template>
  <div class="app-shell">
    <AppHeader
      v-model:search="search"
      :theme="theme"
      :loading="loading"
      @open-search="searchOpen = true"
      @open-fetch-logs="fetchLogsOpen = true"
      @refresh="refreshAll"
      @toggle-theme="toggleTheme"
    />

    <main class="page-content">
      <section class="toolbar" aria-label="内容筛选">
        <CategoryTabs v-model="activeCategory" :categories="visibleCategories" :counts="categoryCounts" />
        <div class="toolbar-actions">
          <span class="toolbar-status"><span class="status-dot" :class="{ 'status-dot--busy': loading }" />{{ onlineCount }} 个来源可用</span>
          <button class="icon-button layout-button" type="button" aria-label="切换布局" :aria-pressed="layout === 'compact'" @click="toggleLayout">
            <AppIcon :name="layout === 'grid' ? 'columns' : 'grid'" />{{ layout === "grid" ? "紧凑" : "标准" }}
          </button>
        </div>
      </section>

      <div v-if="sources.length === 0 && loading" class="initial-loading" role="status">
        <span class="loader" />
        正在连接真实数据源
      </div>
      <div v-else :class="['source-grid', `source-grid--${layout}`]">
        <SourceCard
          v-for="source in visibleSources"
          :key="source.id"
          :source="source"
          :result="results[source.id]"
          :query="search"
          @refresh="refreshSource(source.id)"
        />
      </div>
      <div v-if="!loading && visibleSources.length === 0" class="page-empty">当前分类还没有已启用的数据源。</div>
    </main>

    <SearchDialog v-model:open="searchOpen" v-model:query="search" :results="searchResults" />
    <FetchLogsDialog v-model:open="fetchLogsOpen" :sources="sources" />
  </div>
</template>
