<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { fetchSteamDeals } from "../services/cheapshark.js";
import SourceMark from "./SourceMark.vue";

const props = defineProps({ active: { type: Boolean, required: true } });
const items = ref([]);
const loading = ref(false);
const error = ref("");
const hasMore = ref(true);
const loaded = ref(false);
const stale = ref(false);
const fetchedAt = ref("");
const brokenImages = ref(new Set());
const listElement = ref(null);
const endElement = ref(null);
let pageNumber = 0;
let controller = null;
let observer = null;
let observerRevision = 0;
let retryTimer = null;

async function observeEnd() {
  const revision = ++observerRevision;
  observer?.disconnect();
  observer = null;
  if (!props.active || !items.value.length || !hasMore.value || error.value) return;
  await nextTick();
  if (revision !== observerRevision || !endElement.value) return;
  observer = new window.IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) loadMore();
  }, { root: window.matchMedia("(min-width: 761px)").matches ? listElement.value : null, rootMargin: "0px 0px 80px 0px" });
  observer.observe(endElement.value);
}

async function loadMore() {
  if (loading.value || !hasMore.value) return;
  window.clearTimeout(retryTimer);
  retryTimer = null;
  loading.value = true;
  error.value = "";
  controller = new AbortController();
  try {
    const result = await fetchSteamDeals(pageNumber, { signal: controller.signal });
    window.clearTimeout(retryTimer);
    retryTimer = null;
    items.value = [...items.value, ...result.items];
    hasMore.value = result.hasMore;
    stale.value = Boolean(result.stale);
    fetchedAt.value = result.fetchedAt || "";
    pageNumber += 1;
    loaded.value = true;
  } catch (cause) {
    if (cause.name !== "AbortError") {
      error.value = cause.message || "暂时无法获取优惠";
      if (cause.code === "DEALS_INITIALIZING" && props.active) {
        retryTimer = window.setTimeout(() => { retryTimer = null; if (props.active) void loadMore(); }, 5_000);
      }
    }
  } finally {
    loading.value = false;
    if (!items.value.length && hasMore.value && !error.value && props.active) void loadMore();
    else void observeEnd();
  }
}

function markImageBroken(id) {
  brokenImages.value = new Set([...brokenImages.value, id]);
}

function formatPrice(value) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(value);
}

watch(() => props.active, (active) => {
  if (active && !loaded.value && !loading.value) loadMore();
}, { immediate: true });
watch([() => items.value.length, hasMore, error, () => props.active], observeEnd);
onMounted(() => window.addEventListener("resize", observeEnd));
onBeforeUnmount(() => {
  observerRevision += 1;
  window.clearTimeout(retryTimer);
  controller?.abort();
  observer?.disconnect();
  window.removeEventListener("resize", observeEnd);
});
</script>

<template>
  <section :class="['steam-deals', { 'steam-deals--short': (error && !items.length) || (loaded && !items.length) }]" aria-label="Steam 游戏优惠">
    <header class="card-header">
      <div class="source-identity"><SourceMark id="steam-deals" name="Steam 游戏优惠" /><span class="source-label"><h2>Steam 游戏优惠</h2><small><span class="status-dot" />{{ loading && !items.length ? "正在加载" : error && !items.length ? "暂时不可用" : stale ? "最近成功快照" : "当前折扣" }}</small></span></div>
    </header>

    <div v-if="loading && !items.length" class="card-state skeleton-state" role="status"><span v-for="index in 6" :key="index" class="skeleton-line" /></div>
    <div v-else-if="error && !items.length" class="card-state" role="alert"><strong>暂时无法获取优惠</strong><p>{{ error }}</p><button type="button" @click="loadMore">重新连接</button></div>
    <div v-else-if="loaded && !items.length" class="card-state"><strong>暂无国区优惠</strong><p>当前没有查询到在 Steam 国区生效的折扣。</p></div>

    <div v-if="items.length" ref="listElement" class="steam-deal-list" tabindex="0" aria-label="Steam 优惠列表，滚动查看更多游戏">
      <div v-for="deal in items" :key="deal.id" class="steam-deal-row">
        <a class="steam-deal-image" :href="deal.url" target="_blank" rel="noopener noreferrer" :aria-label="`查看 ${deal.title} 优惠`">
          <img v-if="deal.thumbnail && !brokenImages.has(deal.id)" :src="deal.thumbnail" :alt="`${deal.title} 缩略图`" loading="lazy" decoding="async" @error="markImageBroken(deal.id)">
          <span v-else class="steam-image-placeholder" role="img" :aria-label="`${deal.title} 暂无缩略图`">暂无图片</span>
        </a>
        <div class="steam-deal-detail">
          <a class="steam-deal-title" :href="deal.url" target="_blank" rel="noopener noreferrer">{{ deal.title }}</a>
          <div class="steam-deal-prices"><strong>{{ formatPrice(deal.salePrice) }}</strong><del>{{ formatPrice(deal.normalPrice) }}</del><span class="steam-discount">-{{ deal.discount }}%</span></div>
        </div>
      </div>
      <div v-if="hasMore && !error" ref="endElement" class="steam-list-end" role="status">{{ loading ? "正在加载更多优惠…" : "向下滚动查看更多优惠" }}</div>
      <div v-if="error" class="steam-list-end" role="alert">{{ error }} <button type="button" @click="loadMore">重试</button></div>
    </div>
    <footer class="card-footer"><span>Steam 国区人民币价格 · {{ fetchedAt ? `更新于 ${new Date(fetchedAt).toLocaleString('zh-CN')}` : '实际售价以商店为准' }}</span><a href="https://www.cheapshark.com" target="_blank" rel="noopener noreferrer">优惠数据来自 CheapShark</a></footer>
  </section>
</template>
