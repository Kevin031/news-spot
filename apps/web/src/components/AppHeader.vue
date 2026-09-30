<script setup>
import AppIcon from "./AppIcon.vue";

defineProps({ search: { type: String, default: "" }, theme: { type: String, required: true }, loading: Boolean });
defineEmits(["update:search", "open-search", "open-fetch-logs", "refresh", "toggle-theme"]);
const shortcut = /Mac|iPhone|iPad/.test(window.navigator.platform) ? "⌘ K" : "Ctrl K";
</script>

<template>
  <header class="app-header">
    <div class="header-inner">
      <a class="brand" href="/" aria-label="News Spot 首页">
        <img class="brand-mark" src="/favicon.svg?v=2" alt="" width="34" height="34">
        <span><strong>News Spot</strong></span>
      </a>
      <div class="desktop-search">
        <label class="search-field">
          <span class="sr-only">搜索热点</span>
          <AppIcon name="search" />
          <input :value="search" type="search" placeholder="搜索热点资讯" @input="$emit('update:search', $event.target.value)">
          <kbd>{{ shortcut }}</kbd>
        </label>
      </div>
      <div class="header-actions">
        <button class="icon-button icon-button--square mobile-only" type="button" aria-label="打开搜索" title="搜索" @click="$emit('open-search')"><AppIcon name="search" /></button>
        <button class="icon-button" type="button" :disabled="loading" aria-label="重新加载全部来源" title="刷新全部来源" @click="$emit('refresh')"><AppIcon name="refresh" /><span class="header-action-label">{{ loading ? "加载中" : "全部刷新" }}</span></button>
        <button class="icon-button" type="button" aria-label="抓取日志" title="查看抓取日志" @click="$emit('open-fetch-logs')"><AppIcon name="logs" /><span class="header-action-label">日志</span></button>
        <a class="icon-button" href="/api/docs" aria-label="接口文档" title="查看开放接口文档"><AppIcon name="docs" /><span class="header-action-label">接口文档</span></a>
        <button class="icon-button icon-button--square" type="button" aria-label="切换主题" :title="theme === 'light' ? '切换深色主题' : '切换浅色主题'" @click="$emit('toggle-theme')"><AppIcon :name="theme === 'light' ? 'moon' : 'sun'" /></button>
      </div>
    </div>
  </header>
</template>
