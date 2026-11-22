<script setup lang="ts">
import { ArrowDown } from '@lucide/vue'
import { useEventListener } from '@vueuse/core'
import { useTemplateRef, watch } from 'vue'
import LoadingSpinner from './LoadingSpinner.vue'

defineProps<{ offset: number; ready: boolean; refreshing: boolean }>()

const reveal = useTemplateRef('reveal')
const visual = window.visualViewport

function positionChip(): void {
  const element = reveal.value
  if (!element || !visual) return
  if (visual.scale <= 1.01) {
    element.style.removeProperty('--pull-refresh-center')
    element.style.removeProperty('--pull-refresh-scale')
    return
  }

  const bounds = element.getBoundingClientRect()
  const left = Math.max(bounds.left, visual.offsetLeft)
  const right = Math.min(bounds.right, visual.offsetLeft + visual.width)
  element.style.setProperty('--pull-refresh-center', (left + right) / 2 - bounds.left + 'px')
  element.style.setProperty('--pull-refresh-scale', String(1 / visual.scale))
}

watch(reveal, positionChip, { flush: 'post' })
useEventListener(() => (reveal.value ? visual : null), ['resize', 'scroll'], positionChip, { passive: true })
</script>

<template>
  <div v-if="offset > 0" ref="reveal" class="pull-refresh-reveal" :style="{ height: offset + 'px' }" aria-hidden="true">
    <span class="pull-refresh-chip">
      <LoadingSpinner v-if="refreshing" :size="16" />
      <ArrowDown v-else :size="16" :class="{ 'pull-refresh-ready': ready }" />
      {{ refreshing ? '正在刷新' : ready ? '松手刷新' : '下拉刷新' }}
    </span>
  </div>
</template>
