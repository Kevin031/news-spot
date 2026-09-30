<script setup>
import AppIcon from "./AppIcon.vue";

defineProps({ open: Boolean, query: { type: String, default: "" }, results: { type: Array, default: () => [] } });
defineEmits(["update:open", "update:query"]);
</script>

<template>
  <div v-if="open" class="dialog-backdrop" role="presentation" @click.self="$emit('update:open', false)">
    <section class="search-dialog" role="dialog" aria-modal="true" aria-label="搜索热点">
      <div class="dialog-search"><input autofocus :value="query" type="search" placeholder="输入热点关键词" @input="$emit('update:query', $event.target.value)"><button class="dialog-close" type="button" aria-label="关闭搜索" @click="$emit('update:open', false)"><AppIcon name="close" /></button></div>
      <div class="dialog-results">
        <p v-if="!query" class="dialog-hint">输入关键词搜索当前已经获取的真实热点。</p>
        <p v-else-if="results.length === 0" class="dialog-hint">没有找到匹配内容。</p>
        <a v-for="item in results" :key="`${item.sourceId}-${item.id}`" :href="item.url" target="_blank" rel="noopener noreferrer"><span>{{ item.sourceName }}</span><strong>{{ item.title }}</strong></a>
      </div>
    </section>
  </div>
</template>
