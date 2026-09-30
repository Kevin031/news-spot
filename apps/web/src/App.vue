<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import AppHeader from "./components/AppHeader.vue";
import AppIcon from "./components/AppIcon.vue";
import CategoryTabs from "./components/CategoryTabs.vue";
import SearchDialog from "./components/SearchDialog.vue";
import SourceCard from "./components/SourceCard.vue";
import SteamDeals from "./components/SteamDeals.vue";
import FetchLogsDialog from "./components/FetchLogsDialog.vue";
import CardSettingsDialog from "./components/CardSettingsDialog.vue";
import { useSources } from "./composables/useSources.js";
import { orderSourcesByAvailability } from "./utils/source-order.js";
import { arrangeCards, CARD_PREFERENCES_KEY, readCardPreferences, STEAM_CARD_ID } from "./utils/card-preferences.js";

const categories = [
  { id: "all", name: "全部" },
  { id: "china", name: "国内" },
  { id: "tech", name: "科技" },
  { id: "world", name: "国际" },
  { id: "finance", name: "财经" },
  { id: "ai", name: "AI 资讯" },
  { id: "entertainment", name: "影视" },
  { id: "games", name: "游戏优惠" },
];
const activeCategory = ref("all");
const search = ref("");
const searchOpen = ref(false);
const fetchLogsOpen = ref(false);
const cardSettingsOpen = ref(false);
const cardPreferences = ref(readCardPreferences());
const layout = ref(localStorage.getItem("news-spot-layout") || "grid");
const theme = ref(localStorage.getItem("news-spot-theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
const { sources, results, loading, load, refreshSource, refreshAll, stop } = useSources();

const allCards = computed(() => arrangeCards([
  { id: STEAM_CARD_ID, name: "Steam 游戏优惠", category: "games" },
  ...orderSourcesByAvailability(sources.value, results.value),
], cardPreferences.value.order));
const enabledCards = computed(() => allCards.value.filter((card) => !cardPreferences.value.hidden.includes(card.id)));
const visibleCards = computed(() => enabledCards.value.filter((card) => activeCategory.value === "all" || card.category === activeCategory.value));
const visibleSources = computed(() => visibleCards.value.filter((card) => card.id !== STEAM_CARD_ID));
const categoryCounts = computed(() => Object.fromEntries(categories.map((category) => [category.id, category.id === "all" ? enabledCards.value.length : enabledCards.value.filter((card) => card.category === category.id).length])));
const visibleCategories = computed(() => categories.filter((category) => category.id === "all" || categoryCounts.value[category.id] > 0));
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
function saveCardPreferences(next) {
  cardPreferences.value = next;
  localStorage.setItem(CARD_PREFERENCES_KEY, JSON.stringify(next));
}
function reorderCards(order) {
  saveCardPreferences({ ...cardPreferences.value, order });
}
function toggleCard(id) {
  const hidden = cardPreferences.value.hidden.includes(id)
    ? cardPreferences.value.hidden.filter((value) => value !== id)
    : [...cardPreferences.value.hidden, id];
  saveCardPreferences({ order: allCards.value.map((card) => card.id), hidden });
}
function onKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" || event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
    event.preventDefault(); searchOpen.value = true;
  }
}

watch(theme, (value) => { document.documentElement.dataset.theme = value; localStorage.setItem("news-spot-theme", value); }, { immediate: true });
watch(layout, (value) => localStorage.setItem("news-spot-layout", value));
watch(visibleCategories, (value) => { if (!value.some((category) => category.id === activeCategory.value)) activeCategory.value = "all"; });
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
          <button class="icon-button" type="button" aria-label="卡片设置" @click="cardSettingsOpen = true">卡片设置</button>
          <button class="icon-button layout-button" type="button" aria-label="切换布局" :aria-pressed="layout === 'compact'" @click="toggleLayout">
            <AppIcon :name="layout === 'grid' ? 'columns' : 'grid'" />{{ layout === "grid" ? "紧凑" : "标准" }}
          </button>
        </div>
      </section>

      <div :class="['source-grid', `source-grid--${layout}`]">
        <template v-for="card in allCards" :key="card.id">
          <SteamDeals v-if="card.id === STEAM_CARD_ID" v-show="visibleCards.includes(card)" :active="visibleCards.includes(card)" />
          <SourceCard v-else-if="visibleCards.includes(card)" :source="card" :result="results[card.id]" :query="search" @refresh="refreshSource(card.id)" />
        </template>
      </div>
      <div v-if="sources.length === 0 && loading && activeCategory !== 'games'" class="initial-loading" role="status"><span class="loader" />正在连接真实数据源</div>
      <div v-if="!loading && visibleCards.length === 0" class="page-empty">当前分类没有显示的卡片，可在卡片设置中开启。</div>
    </main>

    <SearchDialog v-model:open="searchOpen" v-model:query="search" :results="searchResults" />
    <FetchLogsDialog v-model:open="fetchLogsOpen" :sources="sources" />
    <CardSettingsDialog v-model:open="cardSettingsOpen" :cards="allCards" :hidden="cardPreferences.hidden" @reorder="reorderCards" @toggle="toggleCard" />
  </div>
</template>
