<script setup>
import { ref, watch } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import AppIcon from "./AppIcon.vue";
import Switch from "./ui/Switch.vue";

const props = defineProps({ open: Boolean, cards: { type: Array, default: () => [] }, hidden: { type: Array, default: () => [] } });
const emit = defineEmits(["update:open", "reorder", "toggle"]);
const orderedCards = ref([...props.cards]);
watch(() => props.cards, (cards) => { orderedCards.value = [...cards]; });

function close() { emit("update:open", false); }
function onKeydown(event) { if (event.key === "Escape") close(); }
function onReorder(cards) { emit("reorder", cards.map((card) => card.id)); }
</script>

<template>
  <div v-if="open" class="dialog-backdrop" role="presentation" @click.self="close" @keydown="onKeydown">
    <section class="card-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="card-settings-title">
      <header class="fetch-dialog-header"><div><h2 id="card-settings-title">卡片设置</h2><p>拖动排序；开关控制卡片显示。修改会自动保存。</p></div><button class="dialog-close" type="button" aria-label="关闭卡片设置" @click="close"><AppIcon name="close" /></button></header>
      <VueDraggable v-model="orderedCards" tag="ol" class="card-settings-list" handle=".card-settings-handle" :animation="150" @update:model-value="onReorder">
        <li v-for="card in orderedCards" :key="card.id" :class="['card-settings-item', { 'card-settings-item--hidden': hidden.includes(card.id) }]">
          <span class="card-settings-handle" :aria-label="`拖动 ${card.name} 排序`" title="拖动排序"><AppIcon name="drag" /></span>
          <span class="card-settings-name">{{ card.name }}</span>
          <div class="card-settings-actions">
            <Switch :id="`card-visible-${card.id}`" :model-value="!hidden.includes(card.id)" :aria-label="`显示 ${card.name}`" @update:model-value="emit('toggle', card.id)" />
            <label :for="`card-visible-${card.id}`">显示</label>
          </div>
        </li>
      </VueDraggable>
    </section>
  </div>
</template>
