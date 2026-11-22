<script setup lang="ts">
import { onClickOutside, useEventListener, useResizeObserver } from '@vueuse/core'
import { onMounted, toRef, useTemplateRef } from 'vue'
import ActionButton from './ActionButton.vue'

const props = defineProps<{ anchor: HTMLElement; label: string; href: string; inSearch: boolean }>()
const emit = defineEmits<{ toggle: []; search: [event: MouseEvent]; dismiss: [restoreFocus: boolean] }>()
const panel = useTemplateRef('panel')
const toggleButton = useTemplateRef('toggleButton')

function place(): boolean {
  const popup = panel.value
  if (!popup) return false
  const anchor = props.anchor.getBoundingClientRect()
  const header = props.anchor.closest('.eh-app')?.querySelector('.masthead')
  const { width, height } = popup.getBoundingClientRect()
  const gutter = 12
  const gap = 8
  const topEdge = Math.max(gutter, header?.getBoundingClientRect().bottom ?? 0)
  const bottomEdge = window.innerHeight - gutter
  if (!props.anchor.isConnected || anchor.bottom <= topEdge || anchor.top >= bottomEdge) {
    emit('dismiss', false)
    return false
  }
  const below = anchor.bottom + gap
  const above = anchor.top - gap - height
  const top = below + height <= bottomEdge ? below : above
  popup.style.left = Math.max(gutter, Math.min(anchor.left, window.innerWidth - width - gutter)) + 'px'
  popup.style.top = Math.max(topEdge, Math.min(top, bottomEdge - height)) + 'px'
  return true
}

function onFocusout(event: FocusEvent): void {
  if (event.relatedTarget instanceof Node && !panel.value?.contains(event.relatedTarget)) emit('dismiss', false)
}

onMounted(() => {
  if (place()) toggleButton.value?.focus({ preventScroll: true })
})
onClickOutside(panel, () => emit('dismiss', false), { ignore: [toRef(props, 'anchor')] })
useEventListener(() => props.anchor.closest('.eh-app'), 'scroll', place, { passive: true })
useEventListener(window, 'resize', place)
useResizeObserver(panel, place)
</script>

<template>
  <div
    id="gallery-tag-search"
    ref="panel"
    class="tag-search-popover"
    role="dialog"
    aria-labelledby="gallery-tag-search-label"
    @keydown.esc.stop.prevent="emit('dismiss', true)"
    @focusout="onFocusout"
  >
    <p id="gallery-tag-search-label">{{ label }}</p>
    <div class="tag-search-popover-actions flex flex-wrap gap-2" @mousedown.prevent>
      <button
        ref="toggleButton"
        class="pill action-button"
        :class="{ 'action-button-danger-subtle': inSearch }"
        type="button"
        @click="emit('toggle')"
      >
        {{ inSearch ? '从搜索框移除' : '添加到搜索框' }}
      </button>
      <ActionButton variant="primary" :href="href" @click="emit('search', $event)">直接搜索</ActionButton>
    </div>
  </div>
</template>
