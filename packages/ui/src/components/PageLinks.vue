<script setup lang="ts">
import { ArrowLeft, ArrowRight } from '@lucide/vue'

defineProps<{ previous?: string; next?: string }>()
const emit = defineEmits<{ navigate: [event: MouseEvent, href: string] }>()
</script>

<template>
  <nav class="pagination" aria-label="分页">
    <a v-if="previous" class="pill" :href="previous" @click="emit('navigate', $event, previous)">
      <ArrowLeft :size="16" aria-hidden="true" /> 上一页
    </a>
    <a v-if="next" class="pill next" :href="next" @click="emit('navigate', $event, next)">
      下一页 <ArrowRight :size="16" aria-hidden="true" />
    </a>
  </nav>
</template>
