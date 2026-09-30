<script setup>
import { computed, ref, watch } from "vue";

const props = defineProps({ id: { type: String, required: true }, name: { type: String, required: true } });
const iconNames = {
  hackernews: "hackernews", v2ex: "v2ex", github: "github", bbc: "bbc", ithome: "ithome",
  bilibili: "bilibili", "douban-movies": "douban", "douban-tv": "douban", devto: "devto",
  stackoverflow: "stackoverflow", "wikipedia-zh": "wikipedia-zh", lobsters: "lobsters",
  sspai: "sspai", solidot: "solidot", techcrunch: "techcrunch", "npr-world": "npr-world",
  marketwatch: "marketwatch", arstechnica: "arstechnica", "aihot-selected": "aihot",
  "aihot-topics": "aihot", "steam-deals": "steam",
};
const fallbackMarks = {
  hackernews: "HN", v2ex: "V2", github: "GH", bbc: "BBC", ithome: "IT", bilibili: "B",
  "douban-movies": "影", "douban-tv": "剧", devto: "DEV", stackoverflow: "SO", lobsters: "L",
  sspai: "SP", solidot: "SD", techcrunch: "TC", "npr-world": "NPR", marketwatch: "MW",
  arstechnica: "AR", "aihot-selected": "AI", "aihot-topics": "AI", "wikipedia-zh": "维基",
  "steam-deals": "ST",
};
const failed = ref(false);
const icon = computed(() => iconNames[props.id]);
const fallback = computed(() => fallbackMarks[props.id] || props.name.slice(0, 2).toUpperCase());
watch(icon, () => { failed.value = false; });
</script>

<template>
  <span :class="['source-mark', { 'source-mark--image': icon && !failed }]" aria-hidden="true">
    <img v-if="icon && !failed" :src="`/source-icons/${icon}.png`" alt="" width="28" height="28" @error="failed = true">
    <template v-else>{{ fallback }}</template>
  </span>
</template>
