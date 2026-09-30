<script setup>
import { ref } from "vue";

defineProps({ item: { type: Object, required: true }, query: { type: String, default: "" } });
const imageBroken = ref(false);
</script>

<template>
  <div class="douban-row">
    <a class="douban-poster" :href="item.url" target="_blank" rel="noopener noreferrer" :aria-label="`查看 ${item.title}`">
      <img v-if="item.posterUrl && !imageBroken" :src="item.posterUrl" :alt="`${item.title} 海报`" loading="lazy" decoding="async" @error="imageBroken = true">
      <span v-else class="douban-poster-placeholder" role="img" :aria-label="`${item.title} 暂无海报`">暂无海报</span>
      <span class="douban-rank">{{ item.rank }}</span>
    </a>
    <div class="douban-detail">
      <a class="douban-title" :href="item.url" target="_blank" rel="noopener noreferrer">{{ item.title }}</a>
      <small v-if="item.summary">{{ item.summary }}</small>
    </div>
    <span :class="['douban-rating', { 'douban-rating--empty': item.rating == null }]" :aria-label="item.rating == null ? '暂无评分' : `豆瓣评分 ${item.rating.toFixed(1)}`">
      {{ item.rating == null ? "暂无评分" : item.rating.toFixed(1) }}
    </span>
  </div>
</template>
