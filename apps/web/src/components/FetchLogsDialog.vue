<script setup>
import { ref, watch } from "vue";
import { newsApi } from "../services/api.js";

const props = defineProps({ open: Boolean, sources: { type: Array, default: () => [] }, api: { type: Object, default: () => newsApi } });
const emit = defineEmits(["update:open"]);
const items = ref([]);
const latestSlot = ref(null);
const cursor = ref(null);
const sourceId = ref("");
const status = ref("");
const loading = ref(false);
const error = ref("");
let controller = null;

function formatTime(value) { return value ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "未知"; }
function sourceName(id) { return props.sources.find((source) => source.id === id)?.name || id; }
function statusName(value) { return ({ running: "进行中", success: "成功", not_modified: "未变化", failure: "失败", skipped: "跳过" })[value] || value; }
function triggerName(value) { return ({ scheduled: "定时", cold: "无数据补抓", manual: "手动运行" })[value] || value; }

async function fetchPage(append = false) {
  controller?.abort();
  const current = new AbortController();
  controller = current;
  loading.value = true;
  error.value = "";
  try {
    const result = await props.api.fetchLogs({ limit: 20, cursor: append ? cursor.value : null, sourceId: sourceId.value, status: status.value, signal: current.signal });
    if (current.signal.aborted) return;
    items.value = append ? [...items.value, ...result.items] : result.items;
    cursor.value = result.nextCursor;
    latestSlot.value = result.latestSlot;
  } catch (reason) {
    if (!current.signal.aborted) error.value = reason.message || "日志加载失败";
  } finally {
    if (controller === current) loading.value = false;
  }
}
function close() { emit("update:open", false); }
function onKeydown(event) { if (event.key === "Escape") close(); }
watch(() => props.open, (open) => {
  if (open) fetchPage();
  else { controller?.abort(); loading.value = false; }
});
watch([sourceId, status], () => { if (props.open) fetchPage(); });
</script>

<template>
  <div v-if="open" class="dialog-backdrop" role="presentation" @click.self="close" @keydown="onKeydown">
    <section class="fetch-dialog" role="dialog" aria-modal="true" aria-labelledby="fetch-logs-title">
      <header class="fetch-dialog-header"><div><h2 id="fetch-logs-title">抓取日志</h2><p>仅记录实际抓取；页面重新加载只读取已保存数据。</p></div><button type="button" aria-label="关闭抓取日志" @click="close">关闭</button></header>
      <div class="fetch-dialog-body">
        <div v-if="latestSlot" class="fetch-slot">最近时段 {{ latestSlot.key }} · {{ latestSlot.status === "completed" ? "已完成" : "进行中" }} · 成功 {{ latestSlot.success }} / {{ latestSlot.total }} · 失败 {{ latestSlot.failed }}</div>
        <div v-else class="fetch-slot">尚无定时抓取记录</div>
        <div class="fetch-filters">
          <label>来源 <select v-model="sourceId"><option value="">全部来源</option><option v-for="source in sources" :key="source.id" :value="source.id">{{ source.name }}</option></select></label>
          <label>结果 <select v-model="status"><option value="">全部结果</option><option value="success">成功</option><option value="not_modified">未变化</option><option value="failure">失败</option><option value="skipped">跳过</option><option value="running">进行中</option></select></label>
          <button type="button" :disabled="loading" @click="fetchPage()">重新加载日志</button>
        </div>
        <p v-if="error" class="fetch-message" role="alert">{{ error }} <button type="button" @click="fetchPage()">重试</button></p>
        <p v-else-if="loading && items.length === 0" class="fetch-message" role="status">正在加载日志</p>
        <p v-else-if="items.length === 0" class="fetch-message">暂无符合条件的抓取日志</p>
        <ol v-else class="fetch-log-list">
          <li v-for="entry in items" :key="entry.id" class="fetch-log-entry">
            <div><strong>{{ sourceName(entry.sourceId) }}</strong><span :class="['fetch-log-status', `fetch-log-status--${entry.status}`]">{{ statusName(entry.status) }}</span></div>
            <p>{{ triggerName(entry.trigger) }} · {{ formatTime(entry.startedAt) }} · {{ entry.itemCount }} 条<span v-if="entry.finishedAt"> · {{ Math.max(0, Math.round((new Date(entry.finishedAt) - new Date(entry.startedAt)) / 1000)) }} 秒</span></p>
            <small v-if="entry.errorCode">错误码：{{ entry.errorCode }}</small>
          </li>
        </ol>
        <button v-if="cursor" class="fetch-more" type="button" :disabled="loading" @click="fetchPage(true)">{{ loading ? "加载中" : "加载更多" }}</button>
      </div>
    </section>
  </div>
</template>
