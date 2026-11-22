<script setup lang="ts">
import { MessageSquare, RefreshCw, X } from '@lucide/vue'
import { usePreferredReducedMotion, useScroll } from '@vueuse/core'
import { computed, onBeforeUnmount, shallowRef, useId, useTemplateRef, watch } from 'vue'
import type { GalleryComments } from '@better-eh/core'
import { appendUnique } from '../utils/append-unique'
import { stopScrollMomentum } from '../utils/stop-scroll-momentum'
import BackToTopButton from './BackToTopButton.vue'
import InfiniteScroll from './InfiniteScroll.vue'
import LoadingSpinner from './LoadingSpinner.vue'

const props = defineProps<{
  galleryHref: string
  comments?: GalleryComments
  active: boolean
  loadComments: (href: string, signal: AbortSignal, refresh: boolean) => Promise<GalleryComments>
  refreshComments: (href: string, signal: AbortSignal) => Promise<GalleryComments>
  loadCommentTotal?: (href: string, signal: AbortSignal) => Promise<number | undefined>
}>()
const emit = defineEmits<{ navigate: [event: MouseEvent, href: string] }>()

const titleId = useId()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const scroll = useTemplateRef('scroll')
const viewport = computed(() => scroll.value?.viewport ?? null)
const trigger = useTemplateRef<HTMLElement>('trigger')
const open = shallowRef(false)
const loaded = shallowRef<GalleryComments>()
const comments = computed(() => loaded.value ?? props.comments)
const fetchedTotal = shallowRef<number>()
const total = computed(() => comments.value?.total ?? fetchedTotal.value)
const scrollItemKeys = computed(() => comments.value?.items.map((comment) => String(comment.id)))
const loading = shallowRef(false)
const failed = shallowRef(false)
const refreshing = shallowRef(false)
const refreshFailed = shallowRef(false)
const motion = usePreferredReducedMotion()
const reducedMotion = computed(() => motion.value === 'reduce')
const pullBlocked = computed(() => !open.value || !props.active || refreshing.value)
const reachedEnd = computed(() =>
  Boolean(comments.value?.items.length && !comments.value.moreHref && !loading.value && !failed.value),
)
const { y: scrollY, isScrolling, measure } = useScroll(viewport)
const closeButton = useTemplateRef<HTMLButtonElement>('closeButton')
let stoppingScroll = false
let request: AbortController | undefined
const scrollPositions = new Map<string, number>()

watch(
  [() => props.active, () => props.galleryHref, total],
  async ([active, href, count], _, onCleanup) => {
    if (!active || count !== undefined || !props.loadCommentTotal) return
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    try {
      const result = await props.loadCommentTotal(href, controller.signal)
      if (!controller.signal.aborted) fetchedTotal.value = result
    } catch {
      // Keep the count hidden until a comment request returns it.
    }
  },
  { immediate: true },
)

function saveScrollPosition(): void {
  if (viewport.value) scrollPositions.set(props.galleryHref, viewport.value.scrollTop)
}

function cancelRequest(): void {
  request?.abort()
  request = undefined
  loading.value = false
  failed.value = false
  refreshing.value = false
  refreshFailed.value = false
}

function close(): void {
  saveScrollPosition()
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

watch(
  dialog,
  (element) => {
    if (!element) return
    element.showModal()
    measure()
    const top = scrollPositions.get(props.galleryHref)
    if (top !== undefined) {
      requestAnimationFrame(() => viewport.value?.scrollTo({ top, behavior: 'instant' }))
    }
  },
  { flush: 'post' },
)
watch(
  () => props.comments,
  () => {
    cancelRequest()
    loaded.value = undefined
    fetchedTotal.value = undefined
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
    评论<span v-if="total !== undefined" class="tabular-nums">{{ total }}</span>
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
      <InfiniteScroll
        ref="scroll"
        class="gallery-comments-panel gallery-comments-viewport"
        :content-attrs="{ class: 'px-5 pb-[env(safe-area-inset-bottom)]' }"
        :item-keys="scrollItemKeys"
        :refresh="refresh"
        :refresh-blocked="pullBlocked"
        :refreshing="refreshing"
        :load-more="loadMore"
        :loading="loading"
        :has-more="Boolean(comments?.moreHref)"
        :error="failed ? '评论加载失败。' : undefined"
        :reached-end="reachedEnd"
        :active="open && active"
        :preload-distance="140"
        :aria-busy="loading || refreshing"
      >
        <template #header>
          <header
            class="gallery-comments-header flex items-center justify-between gap-3 border-b border-solid border-line"
          >
            <h2 :id="titleId" class="flex items-baseline gap-2 text-[18px] font-bold">
              评论
              <span v-if="total !== undefined" class="text-[13px] font-normal text-muted tabular-nums">
                {{ total }}
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
              <button
                ref="closeButton"
                class="icon-button"
                type="button"
                aria-label="关闭评论"
                autofocus
                @click="close"
              >
                <X :size="20" aria-hidden="true" />
              </button>
            </div>
          </header>
        </template>
        <template #default>
          <p v-if="refreshFailed" class="py-3 text-muted" role="status">刷新评论失败，可点击刷新按钮重试。</p>
          <ul v-if="comments?.items.length" role="list" class="m-0 list-none divide-y divide-solid divide-line p-0">
            <li
              v-for="comment in comments.items"
              :key="comment.id"
              class="py-4 wrap-anywhere"
              :data-scroll-item="comment.id"
            >
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
        </template>
        <template #after>
          <BackToTopButton :visible="scrollY > 1" label="回到评论顶部" @click="backToTop" />
        </template>
      </InfiniteScroll>
    </dialog>
  </Transition>
</template>
