<script setup>
import { computed } from "vue";
import HotItemRow from "./HotItemRow.vue";

const props = defineProps({ source: { type: Object, required: true }, result: { type: Object, default: null }, query: { type: String, default: "" } });
defineEmits(["refresh"]);
const filteredItems = computed(() => {
  const items = props.result?.items || [];
  const keyword = props.query.trim().toLocaleLowerCase();
  return keyword ? items.filter((item) => item.title.toLocaleLowerCase().includes(keyword)) : items;
});
const state = computed(() => props.result?.status || "loading");
const statusText = computed(() => ({ loading: "正在加载", fresh: "已保存数据", stale: "最近成功快照", error: "暂时不可用" }[state.value] || "等待加载"));
function formatTime(value) { return value ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "未知"; }
</script>

<template>
  <article :class="['source-card', `source-card--${state}`]">
    <header class="card-header">
      <div class="source-identity"><span class="source-mark">{{ source.name.slice(0, 1).toUpperCase() }}</span><span><h2>{{ source.name }}</h2><small><span class="status-dot" />{{ statusText }}</small></span></div>
      <button class="card-refresh" type="button" :disabled="state === 'loading'" :aria-label="`重新加载 ${source.name}`" @click="$emit('refresh')">重新加载</button>
    </header>
    <div v-if="state === 'loading'" class="card-state skeleton-state" role="status"><span v-for="index in 6" :key="index" class="skeleton-line" /></div>
    <div v-else-if="state === 'error'" class="card-state"><strong>暂时无法获取数据</strong><p>{{ result?.error?.message || "请稍后重试" }}</p><button type="button" @click="$emit('refresh')">重新连接</button></div>
    <div v-else-if="filteredItems.length === 0" class="card-state"><strong>{{ query ? "没有匹配的热点" : "上游暂时没有内容" }}</strong><p>{{ query ? "尝试更换搜索关键词" : "数据源已连接，但当前返回空列表" }}</p></div>
    <div v-else class="hot-list"><HotItemRow v-for="item in filteredItems" :key="item.id" :item="item" :query="query" /></div>
    <footer class="card-footer"><span><span v-if="state === 'stale'">{{ result?.staleReason || "最近计划时段尚未更新" }} · </span>显示 {{ filteredItems.length }} 条<span v-if="result?.lastSuccessAt"> · 更新于 {{ formatTime(result.lastSuccessAt) }}</span></span><a :href="source.homeUrl" target="_blank" rel="noopener noreferrer">访问来源</a></footer>
  </article>
</template>
