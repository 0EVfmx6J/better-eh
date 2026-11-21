<script setup lang="ts">
import { ArrowUp, MessageSquare, RefreshCw, X } from '@lucide/vue'
import { useInfiniteScroll, usePreferredReducedMotion, useScroll } from '@vueuse/core'
import { computed, onBeforeUnmount, shallowRef, useId, useTemplateRef, watch } from 'vue'
import type { GalleryComments } from '@better-eh/core'
import { usePullToRefresh } from '../composables/usePullToRefresh'
import { appendUnique } from '../utils/append-unique'
import { stopScrollMomentum } from '../utils/stop-scroll-momentum'
import LoadingSpinner from './LoadingSpinner.vue'
import LoadMoreIndicator from './LoadMoreIndicator.vue'
import PullRefreshIndicator from './PullRefreshIndicator.vue'

const props = defineProps<{
  galleryHref: string
  comments?: GalleryComments
  active: boolean
  loadComments: (href: string, signal: AbortSignal, refresh: boolean) => Promise<GalleryComments>
  refreshComments: (href: string, signal: AbortSignal) => Promise<GalleryComments>
}>()
const emit = defineEmits<{ navigate: [event: MouseEvent, href: string] }>()

const titleId = useId()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const viewport = useTemplateRef<HTMLElement>('viewport')
const trigger = useTemplateRef<HTMLElement>('trigger')
const open = shallowRef(false)
const loaded = shallowRef<GalleryComments>()
const comments = computed(() => loaded.value ?? props.comments)
const loading = shallowRef(false)
const failed = shallowRef(false)
const refreshing = shallowRef(false)
const refreshFailed = shallowRef(false)
const motion = usePreferredReducedMotion()
const reducedMotion = computed(() => motion.value === 'reduce')
const pullBlocked = computed(() => !open.value || !props.active || refreshing.value)
const { offset: pullOffset, ready: pullReady } = usePullToRefresh(viewport, pullBlocked, reducedMotion, refresh)
const { y: scrollY, isScrolling, measure } = useScroll(viewport)
const closeButton = useTemplateRef<HTMLButtonElement>('closeButton')
let stoppingScroll = false
let request: AbortController | undefined

function cancelRequest(): void {
  request?.abort()
  request = undefined
  loading.value = false
  failed.value = false
  refreshing.value = false
  refreshFailed.value = false
}

function close(): void {
  open.value = false
  cancelRequest()
}

function openLink(event: MouseEvent, href: string): void {
  emit('navigate', event, href)
  if (event.defaultPrevented) close()
}

async function loadMore(): Promise<void> {
  const current = comments.value
  if (!open.value || !current?.moreHref || request) return
  const controller = new AbortController()
  request = controller
  const refresh = failed.value
  loading.value = true
  failed.value = false
  try {
    const result = await props.loadComments(current.moreHref, controller.signal, refresh)
    if (!controller.signal.aborted) {
      loaded.value = {
        items: appendUnique(current.items, result.items, (comment) => comment.id),
        total: result.total ?? current.total,
        moreHref: result.moreHref,
      }
    }
  } catch {
    if (!controller.signal.aborted) failed.value = true
  } finally {
    if (request === controller) {
      request = undefined
      loading.value = false
    }
  }
}

async function refresh(): Promise<void> {
  if (pullBlocked.value) return
  request?.abort()
  const controller = new AbortController()
  request = controller
  loading.value = false
  refreshing.value = true
  refreshFailed.value = false
  try {
    const result = await props.refreshComments(props.galleryHref, controller.signal)
    if (controller.signal.aborted) return
    loaded.value = result
    failed.value = false
    viewport.value?.scrollTo({ top: 0, behavior: 'instant' })
  } catch {
    if (!controller.signal.aborted) refreshFailed.value = true
  } finally {
    if (request === controller) {
      request = undefined
      refreshing.value = false
    }
  }
}

async function backToTop(): Promise<void> {
  const element = viewport.value
  if (!element || stoppingScroll) return
  if (isScrolling.value) {
    stoppingScroll = true
    await stopScrollMomentum(element)
    stoppingScroll = false
    if (!open.value || viewport.value !== element) return
  }
  closeButton.value?.focus({ preventScroll: true })
  element.scrollTo({ top: 0, behavior: reducedMotion.value ? 'instant' : 'smooth' })
}

useInfiniteScroll(viewport, loadMore, {
  distance: 140,
  canLoadMore: () =>
    open.value &&
    props.active &&
    Boolean(comments.value?.moreHref) &&
    !failed.value &&
    !loading.value &&
    !refreshing.value &&
    pullOffset.value === 0,
})

watch(
  dialog,
  (element) => {
    if (!element) return
    element.showModal()
    measure()
  },
  { flush: 'post' },
)
watch(
  () => props.comments,
  () => {
    cancelRequest()
    loaded.value = undefined
  },
)
watch(
  () => props.active,
  (active) => {
    if (!active) {
      dialog.value?.close()
      close()
    }
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => {
  dialog.value?.close()
  cancelRequest()
})

function restoreFocus(): void {
  if (!open.value && props.active) trigger.value?.focus({ preventScroll: true })
}
</script>

<template>
  <button
    ref="trigger"
    class="pill shrink-0 whitespace-nowrap max-[960px]:min-h-[44px]!"
    type="button"
    aria-haspopup="dialog"
    @click="open = true"
  >
    <MessageSquare :size="15" aria-hidden="true" />
    评论<span v-if="comments?.total !== undefined" class="tabular-nums">{{ comments.total }}</span>
  </button>

  <Transition name="gallery-comments-drawer" @after-leave="restoreFocus">
    <dialog
      v-if="open"
      ref="dialog"
      class="gallery-comments-drawer"
      :aria-labelledby="titleId"
      @cancel.prevent="close"
      @click.self="close"
      @wheel.self.prevent
      @touchmove.self.prevent
    >
      <div class="gallery-comments-panel">
        <header
          class="gallery-comments-header flex items-center justify-between gap-3 border-b border-solid border-line"
        >
          <h2 :id="titleId" class="flex items-baseline gap-2 text-[18px] font-bold">
            评论
            <span v-if="comments?.total !== undefined" class="text-[13px] font-normal text-muted tabular-nums">
              {{ comments.total }}
            </span>
          </h2>
          <div class="flex items-center gap-1">
            <button
              class="icon-button"
              type="button"
              aria-label="刷新评论"
              title="刷新评论"
              :disabled="refreshing"
              @click="refresh"
            >
              <LoadingSpinner v-if="refreshing" :size="18" />
              <RefreshCw v-else :size="18" aria-hidden="true" />
            </button>
            <button ref="closeButton" class="icon-button" type="button" aria-label="关闭评论" autofocus @click="close">
              <X :size="20" aria-hidden="true" />
            </button>
          </div>
          <PullRefreshIndicator :offset="pullOffset" :ready="pullReady" :refreshing="refreshing" />
        </header>
        <div
          ref="viewport"
          class="min-h-0 overflow-y-auto overscroll-contain px-5 pb-[env(safe-area-inset-bottom)]"
          :aria-busy="loading || refreshing"
        >
          <div :style="pullOffset > 0 ? { transform: 'translateY(' + pullOffset + 'px)' } : undefined">
            <p v-if="refreshFailed" class="py-3 text-muted" role="status">刷新评论失败，可点击刷新按钮重试。</p>
            <ul v-if="comments?.items.length" role="list" class="m-0 list-none divide-y divide-solid divide-line p-0">
              <li v-for="comment in comments.items" :key="comment.id" class="py-4 wrap-anywhere">
                <div class="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                  <span class="font-semibold">{{ comment.author || '未知作者' }}</span>
                  <span v-if="comment.posted" class="text-[12px] text-muted">{{ comment.posted }}</span>
                  <span
                    v-if="comment.score !== undefined"
                    class="ml-auto text-[12px] whitespace-nowrap text-muted tabular-nums"
                  >
                    评分 {{ comment.score }}
                  </span>
                </div>
                <p class="mt-1.5 leading-relaxed whitespace-pre-wrap">
                  <template v-for="(part, index) in comment.body" :key="index">
                    <a
                      v-if="part.href"
                      class="gallery-comment-link"
                      :href="part.href"
                      @click="openLink($event, part.href)"
                      >{{ part.text }}</a
                    >
                    <template v-else>{{ part.text }}</template>
                  </template>
                </p>
              </li>
            </ul>
            <p v-else-if="!comments?.moreHref" class="py-5 text-muted">
              {{ comments ? '暂无评论' : '无法读取评论。' }}
            </p>
            <LoadMoreIndicator
              v-if="comments?.moreHref"
              :loading="loading"
              :error="failed ? '评论加载失败。' : undefined"
              :show-hint="false"
              @retry="loadMore"
            />
          </div>
        </div>
        <Transition name="back-to-top">
          <button
            v-if="scrollY > 1"
            class="icon-button back-to-top"
            type="button"
            title="回到评论顶部"
            aria-label="回到评论顶部"
            @click="backToTop"
          >
            <ArrowUp :size="21" aria-hidden="true" />
          </button>
        </Transition>
      </div>
    </dialog>
  </Transition>
</template>
