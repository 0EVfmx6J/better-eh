<script setup lang="ts">
import { nextTick, useTemplateRef } from 'vue'
import { ChevronDown, ChevronUp } from '@lucide/vue'
import type { ReadingGallery } from '@better-eh/core'

const props = defineProps<{
  chapters?: readonly ReadingGallery[]
  activeChapter: number
  currentPage: number
  totalPages: number
  pending: boolean
  seekingReader: boolean
  error?: string
  openChapter: (chapter: number) => Promise<boolean>
}>()
const emit = defineEmits<{ retry: []; preview: [event: Event]; cancelPreview: [] }>()
const chaptersOpen = defineModel<boolean>('chaptersOpen', { required: true })
const chapterToggle = useTemplateRef('chapterToggle')
const chapterList = useTemplateRef('chapterList')
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
      <input
        type="range"
        min="1"
        :max="Math.max(1, totalPages)"
        :value="currentPage"
        :disabled="totalPages < 2 || (pending && !seekingReader)"
        :style="{
          '--reader-progress-value': (totalPages > 1 ? ((currentPage - 1) / (totalPages - 1)) * 100 : 0) + '%',
        }"
        aria-label="阅读进度"
        :aria-valuetext="`第 ${currentPage} 页${totalPages ? `，共 ${totalPages} 页` : ''}`"
        @input="emit('preview', $event)"
        @pointercancel="emit('cancelPreview')"
      />
      <output class="reader-count min-w-[58px] text-center whitespace-nowrap font-[650] tabular-nums"
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
