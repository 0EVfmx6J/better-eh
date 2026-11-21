<script setup lang="ts">
import { useTemplateRef } from 'vue'
import type { ReaderFrame } from '@better-eh/core'
import { usePreferencesStore } from '../stores/preferences'

defineProps<{
  title?: string
  frames: readonly (ReaderFrame & { chapter: number })[]
  activePosition: number
  pagesAhead: number
  pagesBehind: number
  endSpace: number
  busy: boolean
  brokenImages: ReadonlySet<string>
  loadPreviousFailure?: string
  nativeLink?: (href: string) => string
}>()
const emit = defineEmits<{ retryPrevious: []; imageError: [href: string]; retryImage: [href: string] }>()
const preferences = usePreferencesStore()
const surface = useTemplateRef('surface')
defineExpose({ surface })
</script>

<template>
  <h1 class="sr-only">{{ title }}</h1>
  <div
    ref="surface"
    class="reader-surface mx-auto block w-[min(100%,1000px)] overflow-visible bg-transparent [touch-action:pan-y_pinch-zoom]"
    :class="{ 'fit-width': preferences.readerFit === 'width' }"
    :style="endSpace ? { paddingBottom: endSpace + 'px' } : undefined"
  >
    <div v-if="loadPreviousFailure" class="reader-previous-error infinite-error" role="status">
      <span>{{ loadPreviousFailure }}</span>
      <button class="pill" type="button" :disabled="busy" @click="emit('retryPrevious')">重试加载前一张</button>
    </div>
    <article
      v-for="(frame, position) in frames"
      :key="frame.href"
      class="reader-frame"
      :data-reader-chapter="frame.chapter"
      :data-reader-index="frame.index"
    >
      <img
        v-if="!brokenImages.has(frame.href)"
        :src="frame.image"
        :width="frame.width || undefined"
        :height="frame.height || undefined"
        :style="
          frame.width && frame.height
            ? { '--reader-image-width': frame.width + 'px', '--reader-image-ratio': frame.width / frame.height }
            : undefined
        "
        :alt="'第 ' + frame.index + ' 页'"
        :loading="
          position >= activePosition - pagesBehind && position <= activePosition + pagesAhead ? 'eager' : 'lazy'
        "
        decoding="async"
        draggable="false"
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
</template>
