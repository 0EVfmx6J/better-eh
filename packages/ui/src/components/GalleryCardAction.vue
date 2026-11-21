<script setup lang="ts">
import { Bookmark, Trash2 } from '@lucide/vue'

withDefaults(defineProps<{ label: string; title: string; busy: boolean; destructive?: boolean; pressed?: boolean }>(), {
  pressed: undefined,
})
</script>

<template>
  <button
    class="card-hover-action"
    :class="{ 'action-button-danger-subtle': destructive }"
    type="button"
    :aria-label="label + '：' + title"
    :aria-pressed="pressed"
    :aria-haspopup="destructive ? 'dialog' : undefined"
    :aria-disabled="pressed !== undefined ? busy : undefined"
    :disabled="pressed === undefined && busy"
  >
    <Trash2 v-if="destructive" :size="18" aria-hidden="true" />
    <Bookmark v-else :size="18" aria-hidden="true" />
    <span class="card-hover-action-label" aria-hidden="true"><slot>{{ label }}</slot></span>
  </button>
</template>
