<script setup lang="ts">
import { useEventListener, usePreferredReducedMotion, useResizeObserver, useTimeoutFn } from '@vueuse/core'
import { computed, onScopeDispose, shallowRef, useTemplateRef, watch, type HTMLAttributes } from 'vue'
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
    loading?: boolean
    error?: string
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

const { pullOffset, pullReady, endOffset, contentOffset } = useScrollEdgeFeedback(
  viewport,
  computed(() => motion.value === 'reduce'),
  computed(() => !props.active || Boolean(props.refreshBlocked || props.refreshing || refreshingPull.value)),
  refreshFromEdge,
  computed(() => props.active && props.reachedEnd && !props.refreshing && !refreshingPull.value),
)
const contentStyle = computed(() =>
  contentOffset.value ? { transform: `translateY(${contentOffset.value}px)` } : undefined,
)
const canLoad = computed(
  () => props.active && !props.loadingBlocked && !props.refreshing && !refreshingPull.value && !pullOffset.value,
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
  if (props.preloadDirection) {
    void requestMore(props.preloadDirection)
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
  () => [canLoad.value, props.hasMore, props.loading, props.error, props.canPreload, props.preloadDirection],
  checkPreload,
  { flush: 'post' },
)

defineExpose({ viewport, content })
defineSlots<{
  header?: () => unknown
  default?: (props: { viewport: HTMLElement | null }) => unknown
  virtual?: (props: { viewport: HTMLElement | null }) => unknown
  'after-content'?: () => unknown
  after?: (props: { pullOffset: number }) => unknown
}>()
</script>

<template>
  <div ref="viewport" class="infinite-scroll" :class="{ 'is-zoomed': zoomed }">
    <slot name="header" />
    <component :is="contentAs ?? 'div'" ref="content" v-bind="contentAttrs ?? {}" :style="contentStyle">
      <slot v-if="virtual && $slots.virtual" name="virtual" :viewport="viewport" />
      <slot v-else :viewport="viewport" />
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
        :offset="pullOffset"
        :ready="pullReady"
        :refreshing="refreshing || refreshingPull"
      />
      <ScrollEdgeIndicator class="infinite-scroll-end" :class="endIndicatorClass" :offset="endOffset" edge="bottom" />
    </div>
    <slot name="after" :pull-offset="pullOffset" />
  </div>
</template>
