<script setup>
defineProps({ modelValue: { type: String, required: true }, categories: { type: Array, required: true }, counts: { type: Object, required: true } });
defineEmits(["update:modelValue"]);
</script>

<template>
  <div class="category-tabs" role="tablist" aria-label="热点分类">
    <button v-for="category in categories" :key="category.id" type="button" role="tab" :aria-selected="modelValue === category.id" :class="['category-tab', { 'category-tab--active': modelValue === category.id }]" @click="$emit('update:modelValue', category.id)">
      {{ category.name }} <span>{{ counts[category.id] || 0 }}</span>
    </button>
  </div>
</template>
