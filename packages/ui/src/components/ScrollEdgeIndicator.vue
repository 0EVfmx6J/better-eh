<script setup lang="ts">
import { ArrowDown } from '@lucide/vue'
import { useEventListener } from '@vueuse/core'
import { useTemplateRef, watch } from 'vue'
import LoadingSpinner from './LoadingSpinner.vue'

defineProps<{ offset: number; ready?: boolean; refreshing?: boolean; edge?: 'bottom' }>()

const reveal = useTemplateRef('reveal')
const visual = window.visualViewport

function positionChip(): void {
  const element = reveal.value
  if (!element || !visual) return
  if (visual.scale <= 1.01) {
    element.style.removeProperty('--scroll-edge-center')
    element.style.removeProperty('--scroll-edge-scale')
    return
  }

  const bounds = element.getBoundingClientRect()
  const left = Math.max(bounds.left, visual.offsetLeft)
  const right = Math.min(bounds.right, visual.offsetLeft + visual.width)
  element.style.setProperty('--scroll-edge-center', (left + right) / 2 - bounds.left + 'px')
  element.style.setProperty('--scroll-edge-scale', String(1 / visual.scale))
}

watch(reveal, positionChip, { flush: 'post' })
useEventListener(() => (reveal.value ? visual : null), ['resize', 'scroll'], positionChip, { passive: true })
</script>

<template>
  <div
    v-if="offset > 0"
    ref="reveal"
    class="scroll-edge-reveal"
    :style="{ height: offset + 'px' }"
    :aria-hidden="edge ? undefined : true"
    :role="edge ? 'status' : undefined"
  >
    <span v-if="edge === 'bottom'" class="scroll-edge-chip">已经到底了</span>
    <span v-else class="scroll-edge-chip pull-refresh-chip">
      <LoadingSpinner v-if="refreshing" :size="16" />
      <ArrowDown v-else :size="16" :class="{ 'pull-refresh-ready': ready }" />
      {{ refreshing ? '正在刷新' : ready ? '松手刷新' : '下拉刷新' }}
    </span>
  </div>
</template>
