<script setup>
defineProps({ search: { type: String, default: "" }, theme: { type: String, required: true }, layout: { type: String, required: true }, loading: Boolean });
defineEmits(["update:search", "open-search", "open-fetch-logs", "refresh", "toggle-layout", "toggle-theme"]);
</script>

<template>
  <header class="app-header">
    <div class="header-inner">
      <a class="brand" href="/" aria-label="News Spot 首页">
        <span class="brand-mark">N<span class="brand-period">.</span></span>
        <span><strong>News Spot</strong></span>
      </a>
      <div class="desktop-search">
        <label class="search-field">
          <span class="sr-only">搜索热点</span>
          <input :value="search" type="search" placeholder="搜索热点资讯" @input="$emit('update:search', $event.target.value)">
          <kbd>⌘K</kbd>
        </label>
      </div>
      <div class="header-actions">
        <button class="icon-button mobile-only" type="button" aria-label="打开搜索" @click="$emit('open-search')">搜索</button>
        <button class="icon-button" type="button" :disabled="loading" aria-label="重新加载全部来源" @click="$emit('refresh')">{{ loading ? "加载中" : "刷新" }}</button>
        <button class="icon-button" type="button" aria-label="查看抓取日志" @click="$emit('open-fetch-logs')">日志</button>
        <button class="icon-button desktop-only" type="button" aria-label="切换布局" @click="$emit('toggle-layout')">{{ layout === "grid" ? "列表" : "网格" }}</button>
        <button class="icon-button" type="button" aria-label="切换主题" @click="$emit('toggle-theme')">{{ theme === "light" ? "深色" : "浅色" }}</button>
      </div>
    </div>
  </header>
</template>
