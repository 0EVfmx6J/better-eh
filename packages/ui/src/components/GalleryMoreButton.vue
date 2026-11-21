<script setup lang="ts">
import { Ellipsis } from '@lucide/vue'

defineProps<{ title: string; expanded: boolean; busy: boolean }>()
</script>

<template>
  <button
    class="card-more"
    type="button"
    :aria-label="'画廊操作：' + title"
    aria-haspopup="dialog"
    :aria-expanded="expanded"
    :aria-disabled="busy"
  >
    <Ellipsis :size="20" aria-hidden="true" />
  </button>
</template>
