<script setup lang="ts">
import { ArrowUp } from '@lucide/vue'

defineOptions({ inheritAttrs: false })
withDefaults(defineProps<{ visible: boolean; label?: string; title?: string; disabled?: boolean }>(), {
  label: '回到顶部',
})
</script>

<template>
  <Transition name="back-to-top">
    <button
      v-if="visible"
      v-bind="$attrs"
      class="icon-button back-to-top"
      type="button"
      :aria-label="label"
      :title="title ?? label"
      :disabled="disabled"
    >
      <ArrowUp :size="21" aria-hidden="true" />
    </button>
  </Transition>
</template>
