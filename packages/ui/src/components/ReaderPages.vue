<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import type { ReaderFrame, Thumbnail } from '@better-eh/core'
import { useReaderPreviews } from '../composables/useReaderPreviews'
import { useReaderVirtualizer, type ReaderVirtualizerProps } from '../composables/useReaderVirtualizer'
import { usePreferencesStore } from '../stores/preferences'
import LoadingSpinner from './LoadingSpinner.vue'
import ThumbnailTile from './ThumbnailTile.vue'

const props = defineProps<
  ReaderVirtualizerProps & {
    title?: string
    busy: boolean
    active: boolean
    nativeLink?: (href: string) => string
    loadThumbnails: (chapter: number, index: number, signal: AbortSignal) => Promise<Thumbnail[]>
    imageRetryErrors: ReadonlyMap<string, string>
    retryingImages: ReadonlyMap<string, unknown>
  }
>()
const emit = defineEmits<{
  retryPrevious: []
  imageError: [frame: ReaderFrame]
  imageLoad: [frame: ReaderFrame, size: { width: number; height: number }]
  retryImage: [frame: ReaderFrame]
  loadOriginalImage: [frame: ReaderFrame]
  showPage: [chapter: number, index: number]
}>()
const preferences = usePreferencesStore()
const framesElement = useTemplateRef<HTMLElement>('framesElement')
const heightProbe = useTemplateRef<HTMLElement>('heightProbe')
const fitWidth = computed(() => preferences.readerFit === 'width')
const { rendered, renderedBuffer, totalHeight, endSpace, focusedPage, recordImageSize, scrollToPage } =
  useReaderVirtualizer(props, framesElement, heightProbe, fitWidth, (chapter, index) =>
    emit('showPage', chapter, index),
  )
const previewFrames = computed(() => rendered.value.map(({ frame }) => frame))
const previewsActive = computed(() => props.active && props.trackPosition && !props.preloadPaused)
const { isLoaded, previewFor, markLoaded, markFailed } = useReaderPreviews(
  previewFrames,
  previewsActive,
  props.loadThumbnails,
)
const renderedPages = computed(() =>
  rendered.value.map((page) => {
    const { frame } = page
    const broken = props.brokenImages.has(frame.href)
    const loading = props.retryingImages.has(frame.href) || (!broken && !isLoaded(frame))
    return { ...page, broken, loading, preview: previewFor(frame) }
  }),
)

function imageLoaded(frame: ReaderFrame & { chapter: number }, position: number, event: Event): void {
  const image = event.currentTarget
  if (!(image instanceof HTMLImageElement) || !image.naturalWidth || !image.naturalHeight) return
  markLoaded(frame)
  recordImageSize(position, frame.image, event)
  emit('imageLoad', frame, { width: image.naturalWidth, height: image.naturalHeight })
}

defineExpose({ scrollToPage })
</script>

<template>
  <h1 class="sr-only">{{ title }}</h1>
  <div
    class="reader-surface mx-auto block w-[min(100%,1000px)] overflow-visible bg-transparent"
    :class="{ 'fit-width': fitWidth }"
  >
    <div v-if="loadPreviousFailure" class="reader-previous-error infinite-error" role="status">
      <span>{{ loadPreviousFailure }}</span>
      <button class="pill" type="button" :disabled="busy" @click="emit('retryPrevious')">重试加载前一张</button>
    </div>
    <div
      ref="framesElement"
      class="reader-frames relative"
      :style="{ height: totalHeight + 'px' }"
      @focusout="focusedPage = undefined"
    >
      <span ref="heightProbe" class="reader-height-probe" aria-hidden="true" />
      <div
        v-for="{ key, top, height } in renderedBuffer"
        :key="key"
        class="reader-buffer absolute inset-x-0 top-0"
        :style="{ transform: 'translateY(' + top + 'px)', height: height + 'px' }"
        aria-hidden="true"
      >
        <LoadingSpinner :size="24" />
      </div>
      <article
        v-for="{ frame, position, top, width, height, pageHeight, preview, broken, loading } in renderedPages"
        :key="frame.href"
        class="reader-frame absolute inset-x-0 top-0"
        :style="{
          transform: 'translateY(' + top + 'px)',
          height: pageHeight + 'px',
        }"
        :data-index="position"
        :data-reader-href="frame.href"
        :data-scroll-item="frame.href"
        :data-reader-chapter="frame.chapter"
        :data-reader-index="frame.index"
        @focusin="focusedPage = frame.href"
      >
        <ThumbnailTile
          v-if="preview"
          :thumb="preview"
          class="reader-frame-preview pointer-events-none absolute inset-0 opacity-70"
          fill
          aria-hidden="true"
        />
        <img
          v-if="!broken"
          :key="frame.image"
          class="reader-page-image relative"
          :src="frame.image"
          :width="width"
          :height="height"
          :style="
            width && height
              ? { '--reader-image-width': width + 'px', '--reader-image-ratio': width / height }
              : undefined
          "
          :alt="'第 ' + frame.index + ' 页'"
          loading="eager"
          decoding="async"
          draggable="false"
          @load="imageLoaded(frame, position, $event)"
          @error="
            () => {
              markFailed(frame)
              emit('imageError', frame)
            }
          "
        />
        <div v-else-if="!loading" class="empty frame-error relative mx-4 mt-4 self-start">
          <p role="status">{{ imageRetryErrors.get(frame.href) ?? '图片加载失败。' }}</p>
          <div class="flex flex-wrap gap-x-2">
            <button class="pill" type="button" @click="emit('retryImage', frame)">重试图片</button>
            <button v-if="frame.originalHref" class="pill" type="button" @click="emit('loadOriginalImage', frame)">
              加载原图
            </button>
            <a v-if="nativeLink" class="pill" :href="nativeLink(frame.href)">打开原站</a>
          </div>
        </div>
        <div
          v-if="active && loading"
          class="pointer-events-none absolute top-2.5 right-2.5 grid size-8 place-items-center rounded-full bg-surface text-ink shadow-sm"
          role="status"
        >
          <LoadingSpinner :size="20" aria-hidden="true" />
          <span class="sr-only">正在加载第 {{ frame.index }} 页图片</span>
        </div>
        <span
          class="reader-page-label absolute right-2.5 bottom-2.5 rounded-md bg-[#101010d9] px-[7px] py-[3px] text-[11px] text-white tabular-nums"
          >{{ frame.index }}</span
        >
      </article>
    </div>
    <div v-if="endSpace" :style="{ height: endSpace + 'px' }" aria-hidden="true" />
  </div>
</template>
