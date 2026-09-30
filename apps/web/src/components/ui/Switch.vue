<script setup>
import { SwitchRoot, SwitchThumb } from "reka-ui";

defineProps({ modelValue: { type: Boolean, default: false } });
defineEmits(["update:modelValue"]);
</script>

<template>
  <SwitchRoot class="ui-switch" :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <SwitchThumb class="ui-switch-thumb" />
  </SwitchRoot>
</template>
