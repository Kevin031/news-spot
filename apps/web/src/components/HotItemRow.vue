<script setup>
defineProps({ item: { type: Object, required: true }, query: { type: String, default: "" } });

function formatScore(score) {
  if (score == null) return "";
  return new Intl.NumberFormat("zh-CN", { notation: score > 9999 ? "compact" : "standard" }).format(score);
}
</script>

<template>
  <div class="hot-row">
    <a class="hot-main-link" :href="item.url" target="_blank" rel="noopener noreferrer">
      <span :class="['rank', { 'rank--top': item.rank <= 3 }]">{{ item.rank }}</span>
      <span class="hot-copy"><strong>{{ item.title }}</strong><small v-if="item.summary">{{ item.attribution ? `AIHOT 摘要：${item.summary}` : item.summary }}</small></span>
      <span v-if="item.score != null" class="score">{{ formatScore(item.score) }}</span>
    </a>
    <div v-if="item.originalSourceName || item.attribution" class="hot-provenance">
      <span v-if="item.originalSourceName">{{ item.originalSourceName }}</span>
      <span v-if="item.sourceCount != null">{{ item.sourceCount }} 个信源</span>
      <a v-if="item.attribution" :href="item.attribution.url" target="_blank" rel="noopener noreferrer">查看 {{ item.attribution.name }}</a>
    </div>
  </div>
</template>
