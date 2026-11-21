<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { useReaderVirtualizer, type ReaderVirtualizerProps } from '../composables/useReaderVirtualizer'
import { usePreferencesStore } from '../stores/preferences'

const props = defineProps<
  ReaderVirtualizerProps & {
    title?: string
    busy: boolean
    nativeLink?: (href: string) => string
  }
>()
const emit = defineEmits<{
  retryPrevious: []
  imageError: [href: string]
  retryImage: [href: string]
  showPage: [chapter: number, index: number]
}>()
const preferences = usePreferencesStore()
const framesElement = useTemplateRef<HTMLElement>('framesElement')
const heightProbe = useTemplateRef<HTMLElement>('heightProbe')
const fitWidth = computed(() => preferences.readerFit === 'width')
const { rendered, totalHeight, endSpace, focusedPage, recordImageSize, scrollToPage } = useReaderVirtualizer(
  props,
  framesElement,
  heightProbe,
  fitWidth,
  (chapter, index) => emit('showPage', chapter, index),
)
defineExpose({ scrollToPage })
</script>

<template>
  <h1 class="sr-only">{{ title }}</h1>
  <div
    class="reader-surface mx-auto block w-[min(100%,1000px)] [touch-action:pan-y_pinch-zoom] overflow-visible bg-transparent"
    :class="{ 'fit-width': fitWidth }"
    :style="endSpace ? { paddingBottom: endSpace + 'px' } : undefined"
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
      <article
        v-for="{ frame, position, top, width, height, pageHeight } in rendered"
        :key="frame.href"
        class="reader-frame absolute inset-x-0 top-0"
        :style="{
          transform: 'translateY(' + top + 'px)',
          height: pageHeight + 'px',
        }"
        :data-index="position"
        :data-reader-href="frame.href"
        :data-reader-chapter="frame.chapter"
        :data-reader-index="frame.index"
        @focusin="focusedPage = frame.href"
      >
        <img
          v-if="!brokenImages.has(frame.href)"
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
          @load="recordImageSize(position, frame.image, $event)"
          @error="emit('imageError', frame.href)"
        />
        <div v-else class="empty frame-error m-6">
          <p>图片加载失败。</p>
          <button class="pill" type="button" @click="emit('retryImage', frame.href)">重试图片</button>
          <a v-if="nativeLink" class="pill" :href="nativeLink(frame.href)">打开原站</a>
        </div>
        <span
          class="reader-page-label absolute right-2.5 bottom-2.5 rounded-md bg-[#101010d9] px-[7px] py-[3px] text-[11px] text-white tabular-nums"
          >{{ frame.index }}</span
        >
      </article>
    </div>
  </div>
</template>
