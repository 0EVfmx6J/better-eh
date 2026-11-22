<script setup lang="ts">
import { useEventListener, usePreferredReducedMotion, useResizeObserver, useTimeoutFn } from '@vueuse/core'
import { computed, nextTick, onScopeDispose, shallowRef, useTemplateRef, watch, type HTMLAttributes } from 'vue'
import { useScrollEdgeFeedback } from '../composables/useScrollEdgeFeedback'
import LoadMoreIndicator from './LoadMoreIndicator.vue'
import ScrollEdgeIndicator from './ScrollEdgeIndicator.vue'

type Direction = 'next' | 'previous'

const props = withDefaults(
  defineProps<{
    refresh: () => Promise<void>
    loadMore: (direction: Direction) => Promise<void>
    retryLoadMore?: (direction: Direction) => Promise<void>
    hasMore: boolean
    reachedEnd: boolean
    hasPrevious?: boolean
    loading?: boolean
    error?: string
    previousError?: string
    refreshing?: boolean
    refreshBlocked?: boolean
    loadingBlocked?: boolean
    active?: boolean
    showLoadHint?: boolean
    preloadDistance: number
    loadInterval?: number
    canPreload?: boolean
    preloadDirection?: Direction
    virtual?: boolean
    contentAs?: 'main' | 'div'
    contentAttrs?: HTMLAttributes
    endIndicatorClass?: string | Record<string, boolean>
    itemKeys?: readonly string[]
  }>(),
  { active: true, canPreload: true },
)

const viewport = useTemplateRef<HTMLElement>('viewport')
const content = useTemplateRef<HTMLElement>('content')
const motion = usePreferredReducedMotion()
const visual = window.visualViewport
const zoomed = shallowRef((visual?.scale ?? 1) > 1.01)
useEventListener(visual, 'resize', () => {
  zoomed.value = (visual?.scale ?? 1) > 1.01
})
useResizeObserver(
  () => viewport.value?.querySelector(':scope > header'),
  ([entry]) => {
    if (entry) {
      const height = entry.target.getBoundingClientRect().height + 'px'
      viewport.value?.style.setProperty('--masthead-height', height)
    }
  },
)

const refreshingPull = shallowRef(false)

async function refreshFromEdge(): Promise<void> {
  refreshingPull.value = true
  try {
    await props.refresh()
  } finally {
    refreshingPull.value = false
  }
}

const { pullReady, refreshOffset, endOffset, contentOffset, edgePreload, captureLoad, clearHandoff } =
  useScrollEdgeFeedback(
    viewport,
    content,
    computed(() => motion.value === 'reduce'),
    computed(() => !props.active || Boolean(props.refreshBlocked || props.refreshing || refreshingPull.value)),
    refreshFromEdge,
    computed(() => props.active && props.reachedEnd && !props.refreshing && !refreshingPull.value),
    computed(() => {
      const active = props.active && !props.refreshing && !refreshingPull.value
      return {
        top: active && Boolean(props.hasPrevious),
        bottom: active && (props.hasMore || Boolean(props.loading)),
      }
    }),
  )
const contentStyle = computed(() =>
  contentOffset.value ? { transform: `translateY(${contentOffset.value}px)` } : undefined,
)

async function preserveEdgePosition(direction?: Direction): Promise<boolean> {
  const handoff = captureLoad(direction)
  const element = viewport.value
  const container = content.value
  if (!handoff || !element || !container) return false

  // Keep a loaded item stationary while placeholders are replaced or an image is measured.
  let anchor = handoff.anchor
  if (!anchor || !container.contains(anchor)) {
    anchor = undefined
    const bounds = element.getBoundingClientRect()
    for (const item of container.querySelectorAll<HTMLElement>('[data-scroll-item]')) {
      const position = item.getBoundingClientRect()
      anchor = item
      if (position.bottom > bounds.top && position.top < bounds.bottom) break
    }
  }
  const anchorTop = anchor?.getBoundingClientRect().top ?? 0
  // The virtualizer can queue a scroll correction after the new positions render.
  await nextTick()
  await nextTick()
  if (content.value !== container) return false
  const shift = anchor && container.contains(anchor) ? anchor.getBoundingClientRect().top - anchorTop : 0
  return handoff.restore(anchor, shift)
}

watch(
  () => props.itemKeys,
  async (items, previous) => {
    const first = previous?.[0]
    if (!previous || first === undefined) return
    if (!items?.includes(first)) clearHandoff()
    if (!items || items.length <= previous.length) return
    const count = items.length - previous.length
    const last = previous.at(-1)
    const append = items[0] === first && items[previous.length - 1] === last
    const prepend = items[count] === first && items.at(-1) === last
    if (!append && !prepend) return
    const container = content.value
    if (!container || !(await preserveEdgePosition(append ? 'next' : 'previous'))) return
    if (content.value !== container || props.itemKeys !== items || motion.value === 'reduce') return

    const added = new Set(append ? items.slice(previous.length) : items.slice(0, count))
    for (const item of container.querySelectorAll<HTMLElement>('[data-scroll-item]')) {
      if (added.has(item.dataset.scrollItem ?? ''))
        item.animate({ opacity: [0, 1] }, { duration: 180, easing: 'ease-out' })
    }
  },
)

const canLoad = computed(
  () => props.active && !props.loadingBlocked && !props.refreshing && !refreshingPull.value && !refreshOffset.value,
)
const showFooter = computed(() => props.hasMore || props.loading || props.error)
const loadingPage = shallowRef(false)
const preloadTimer = useTimeoutFn(checkPreload, () => props.loadInterval ?? 100, { immediate: false })
let disposed = false
onScopeDispose(() => {
  disposed = true
})

async function requestMore(direction: Direction = 'next', retry = false): Promise<void> {
  if (!canLoad.value || props.loading || loadingPage.value) return
  loadingPage.value = true
  try {
    await (retry ? (props.retryLoadMore ?? props.loadMore) : props.loadMore)(direction)
  } finally {
    loadingPage.value = false
    if (!disposed) preloadTimer.start()
  }
}

function checkPreload(): void {
  const element = viewport.value
  if (!element?.clientHeight || !canLoad.value || props.loading || loadingPage.value) return
  const pulling = edgePreload.value
  const direction =
    pulling === 'previous' && props.hasPrevious && !props.previousError
      ? pulling
      : pulling === 'next' && props.hasMore && !props.error
        ? pulling
        : props.preloadDirection
  if (direction) {
    void requestMore(direction)
  } else if (
    !preloadTimer.isPending.value &&
    props.canPreload &&
    props.hasMore &&
    !props.error &&
    element.scrollHeight - element.clientHeight - element.scrollTop <= props.preloadDistance + 1
  ) {
    void requestMore()
  }
}

useEventListener(viewport, 'scroll', checkPreload, { passive: true })
useResizeObserver(() => [viewport.value, content.value], checkPreload)
watch(
  () => [
    canLoad.value,
    props.hasMore,
    props.hasPrevious,
    props.loading,
    props.error,
    props.previousError,
    props.canPreload,
    props.preloadDirection,
    edgePreload.value,
  ],
  checkPreload,
  { flush: 'post' },
)

defineExpose({ viewport, content })
type ScrollSlot = (props: { viewport: HTMLElement | null; preserveEdgePosition: () => Promise<boolean> }) => unknown
defineSlots<{
  header?: () => unknown
  default?: ScrollSlot
  virtual?: ScrollSlot
  'after-content'?: () => unknown
  after?: (props: { pullOffset: number }) => unknown
}>()
</script>

<template>
  <div ref="viewport" class="infinite-scroll" :class="{ 'is-zoomed': zoomed }">
    <slot name="header" />
    <component
      :is="contentAs ?? 'div'"
      ref="content"
      class="transition-none"
      v-bind="contentAttrs ?? {}"
      :style="contentStyle"
    >
      <slot
        v-if="virtual && $slots.virtual"
        name="virtual"
        :viewport="viewport"
        :preserve-edge-position="preserveEdgePosition"
      />
      <slot v-else :viewport="viewport" :preserve-edge-position="preserveEdgePosition" />
      <LoadMoreIndicator
        v-if="showFooter"
        :loading="Boolean(loading)"
        :error="error"
        :show-hint="Boolean(showLoadHint)"
        @load="requestMore()"
        @retry="requestMore('next', true)"
      />
      <slot name="after-content" />
    </component>
    <div class="infinite-scroll-overlay">
      <ScrollEdgeIndicator
        class="infinite-scroll-refresh"
        :offset="refreshOffset"
        :ready="pullReady"
        :refreshing="refreshing || refreshingPull"
      />
      <ScrollEdgeIndicator class="infinite-scroll-end" :class="endIndicatorClass" :offset="endOffset" edge="bottom" />
    </div>
    <slot name="after" :pull-offset="refreshOffset" />
  </div>
</template>
