<script setup lang="ts">
import { ChevronDown, ChevronUp } from '@lucide/vue'
import { useEventListener, useTimeoutFn } from '@vueuse/core'
import { computed, nextTick, onScopeDispose, shallowReactive, shallowRef, useTemplateRef, watch } from 'vue'
import type { ReadingGallery, Thumbnail } from '@better-eh/core'
import LoadingSpinner from './LoadingSpinner.vue'
import ThumbnailTile from './ThumbnailTile.vue'

const props = defineProps<{
  chapters?: readonly ReadingGallery[]
  activeChapter: number
  currentPage: number
  totalPages: number
  visible: boolean
  galleryHref: string
  pending: boolean
  seekingReader: boolean
  error?: string
  openChapter: (chapter: number) => Promise<boolean>
  loadThumbnails: (chapter: number, index: number, signal: AbortSignal) => Promise<Thumbnail[]>
}>()
const emit = defineEmits<{ retry: []; preview: [event: Event]; cancelPreview: [] }>()
const chaptersOpen = defineModel<boolean>('chaptersOpen', { required: true })
const dragging = defineModel<boolean>('dragging', { required: true })
const chapterToggle = useTemplateRef('chapterToggle')
const chapterList = useTemplateRef('chapterList')
const pointer = shallowRef<number>()
const disabled = computed(() => props.totalPages < 2 || (props.pending && !props.seekingReader))
const previewPage = computed(() =>
  props.visible && !disabled.value && pointer.value !== undefined ? props.currentPage : undefined,
)
const progress = computed(() => (props.totalPages > 1 ? (props.currentPage - 1) / (props.totalPages - 1) : 0))
const thumbnails = shallowReactive(new Map<number, Thumbnail | undefined>())
const thumbnail = computed(() => (previewPage.value === undefined ? undefined : thumbnails.get(previewPage.value)))
const failedPage = shallowRef<number>()
const { start: scheduleThumbnail, stop: stopThumbnail } = useTimeoutFn(loadThumbnail, 100, { immediate: false })
let request: AbortController | undefined

async function loadThumbnail(): Promise<void> {
  const index = previewPage.value
  if (index === undefined || thumbnails.has(index) || failedPage.value === index || request) return
  const controller = new AbortController()
  request = controller
  try {
    const items = await props.loadThumbnails(props.activeChapter, index, controller.signal)
    if (controller.signal.aborted) return
    for (const item of items) if (item.image) thumbnails.set(item.index, item)
    if (!thumbnails.has(index)) thumbnails.set(index, undefined)
  } catch {
    if (!controller.signal.aborted) failedPage.value = index
  } finally {
    if (request === controller) {
      request = undefined
      if (previewPage.value !== undefined && previewPage.value !== index) scheduleThumbnail()
    }
  }
}

function startDrag(event: PointerEvent): void {
  if (disabled.value || !event.isPrimary || event.button !== 0) return
  chaptersOpen.value = false
  failedPage.value = undefined
  pointer.value = event.pointerId
  dragging.value = true
}

function stopDrag(): void {
  pointer.value = undefined
  dragging.value = false
  stopThumbnail()
}

useEventListener(window, ['pointerup', 'pointercancel'], (event: PointerEvent) => {
  if (event.pointerId === pointer.value) stopDrag()
})
useEventListener(window, 'blur', stopDrag)
watch(previewPage, (index) => {
  if (index !== undefined) scheduleThumbnail()
  else stopThumbnail()
})
watch([() => props.visible, disabled], ([visible, blocked]) => {
  if (!visible || blocked) stopDrag()
})
watch(
  () => props.galleryHref,
  () => {
    stopDrag()
    request?.abort()
    request = undefined
    thumbnails.clear()
  },
)
onScopeDispose(() => {
  stopDrag()
  request?.abort()
})

async function toggleChapterList(): Promise<void> {
  chaptersOpen.value = !chaptersOpen.value
  await nextTick()
  if (chaptersOpen.value) {
    const list = chapterList.value
    const active = list?.querySelector<HTMLElement>('[aria-current="true"]')
    if (active) list?.scrollTo({ top: active.offsetTop, behavior: 'instant' })
  } else {
    chapterToggle.value?.focus({ preventScroll: true })
  }
}

async function selectReaderChapter(chapter: number): Promise<void> {
  if ((await props.openChapter(chapter)) && chaptersOpen.value) await toggleChapterList()
}
</script>

<template>
  <div id="better-eh-reader-progress" class="reader-progress">
    <div v-if="error" class="reader-progress-error" role="alert">
      <span>{{ error }}</span>
      <button type="button" class="pill" @click="emit('retry')">重试</button>
    </div>
    <section
      v-if="chapters"
      v-show="chaptersOpen"
      id="better-eh-reader-chapters"
      class="reader-chapters"
      aria-labelledby="better-eh-reader-chapters-title"
      @keydown.esc.stop="toggleChapterList"
    >
      <header class="reader-chapters-header">
        <h2 id="better-eh-reader-chapters-title">章节</h2>
        <button
          class="icon-button"
          type="button"
          aria-label="收起章节列表"
          aria-controls="better-eh-reader-chapters"
          @click="toggleChapterList"
        >
          <ChevronDown :size="20" aria-hidden="true" />
        </button>
      </header>
      <ol ref="chapterList" class="reader-chapter-list">
        <li v-for="(chapter, index) in chapters" :key="chapter.href">
          <button
            type="button"
            :aria-current="index === activeChapter ? 'true' : undefined"
            :disabled="pending"
            @click="selectReaderChapter(index)"
          >
            <span class="reader-chapter-number">{{ index + 1 }}</span>
            <span>{{ chapter.title }}</span>
          </button>
        </li>
      </ol>
    </section>
    <div class="reader-progress-bar">
      <div class="relative flex min-w-0 flex-1" :style="{ '--reader-progress-ratio': progress }">
        <div
          v-if="previewPage !== undefined"
          class="reader-progress-preview pointer-events-none absolute bottom-[calc(100%+16px)] z-1 w-[108px] overflow-hidden rounded-ui border border-solid border-line bg-surface shadow-lg"
          aria-hidden="true"
        >
          <div class="grid h-[min(132px,28dvh)] place-items-center bg-panel text-muted">
            <ThumbnailTile v-if="thumbnail" :thumb="thumbnail" fill />
            <span v-else-if="failedPage === previewPage || thumbnails.has(previewPage)" class="text-xs"
              >暂无缩略图</span
            >
            <LoadingSpinner v-else :size="20" />
          </div>
          <div class="px-2 py-1 text-center text-xs font-semibold tabular-nums">
            {{ previewPage }} / {{ totalPages }} 页
          </div>
        </div>
        <input
          type="range"
          min="1"
          :max="Math.max(1, totalPages)"
          :value="currentPage"
          :disabled="disabled"
          aria-label="阅读进度"
          :aria-valuetext="`第 ${currentPage} 页${totalPages ? `，共 ${totalPages} 页` : ''}`"
          @input="emit('preview', $event)"
          @pointerdown="startDrag"
          @pointercancel="emit('cancelPreview')"
        />
      </div>
      <output class="reader-count min-w-[58px] text-center font-[650] whitespace-nowrap tabular-nums"
        >{{ currentPage }} / {{ totalPages || '—' }} 页</output
      >
      <button
        v-if="chapters"
        ref="chapterToggle"
        type="button"
        class="icon-button"
        :aria-label="chaptersOpen ? '收起章节列表' : '展开章节列表'"
        :aria-expanded="chaptersOpen"
        aria-controls="better-eh-reader-chapters"
        @click="toggleChapterList"
      >
        <ChevronDown v-if="chaptersOpen" :size="20" aria-hidden="true" />
        <ChevronUp v-else :size="20" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
