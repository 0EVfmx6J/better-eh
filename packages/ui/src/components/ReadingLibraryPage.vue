<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import type { ReadingGallery, ReadingLibraryRemoval } from '@better-eh/core'
import { useReadingLibraryStore } from '../stores/reading-library'
import { librarySections, type LibrarySection } from '../utils/reading-library-route'
import ActionButton from './ActionButton.vue'
import GalleryCardAction from './GalleryCardAction.vue'
import GalleryList from './GalleryList.vue'
import GalleryMoreButton from './GalleryMoreButton.vue'

const props = defineProps<{
  section: LibrarySection
  startingReading: boolean
  desktop: boolean
  openActionHref?: string
}>()
const emit = defineEmits<{
  navigate: [event: MouseEvent, href: string]
  remove: [change: ReadingLibraryRemoval, event: MouseEvent, title?: string]
  openActions: [event: MouseEvent, gallery: ReadingGallery, section: LibrarySection]
  readAll: []
}>()
const readingLibrary = useReadingLibraryStore()
const {
  library,
  historyByGalleryHref,
  loadingLibrary: loading,
  savingLibrary: saving,
  libraryError: error,
} = storeToRefs(readingLibrary)
const selecting = defineModel<boolean>('selecting', { required: true })
const rows = computed(() => {
  if (props.section === 'history') {
    return library.value.history.map((entry) => ({
      ...entry.gallery,
      recordedAt: entry.visitedAt,
      progressIndex: entry.progress?.index,
    }))
  }
  return library.value.later.map((entry) => {
    const history = historyByGalleryHref.value.get(entry.gallery.href)
    return {
      ...entry.gallery,
      pages: history?.gallery.pages || entry.gallery.pages,
      recordedAt: entry.savedAt,
      progressIndex: history?.progress?.index,
    }
  })
})
const removalType = computed(() => (props.section === 'history' ? 'remove-from-history' : 'remove-from-later'))
const removalLabel = computed(() => `从${librarySections[props.section]}移除`)

function removeSelected(items: readonly ReadingGallery[], event: MouseEvent): void {
  emit('remove', { type: 'remove-many', section: props.section, hrefs: items.map((item) => item.href) }, event)
}
</script>

<template>
  <GalleryList
    v-model:selecting="selecting"
    :title="librarySections[section]"
    :items="rows"
    :list-key="section"
    bulk-action="delete"
    :selection-busy="loading || saving"
    @navigate="(event, href) => emit('navigate', event, href)"
    @apply-selection="removeSelected"
  >
    <template #controls>
      <ActionButton
        v-if="section === 'later' && rows.length && !selecting"
        variant="primary"
        :disabled="loading || saving || startingReading"
        @click="emit('readAll')"
      >
        {{ startingReading ? '正在打开…' : '全部阅读' }}
      </ActionButton>
    </template>
    <template #notice>
      <div v-if="error" class="notice library-notice" role="status">
        <p>{{ error }}</p>
        <ActionButton :disabled="loading" @click="readingLibrary.readLibrary">重新读取</ActionButton>
      </div>
    </template>
    <template #empty>
      <p v-if="loading" class="empty" role="status">正在读取阅读记录…</p>
      <p v-else-if="!error" class="empty">
        {{ section === 'history' ? '浏览过的画廊会出现在这里。' : '可从画廊详情或阅读页添加稍后阅读。' }}
      </p>
    </template>
    <template #quickAction="{ item }">
      <GalleryCardAction
        v-if="desktop"
        destructive
        :label="removalLabel"
        :title="item.title"
        :busy="loading || saving"
        @click="emit('remove', { type: removalType, href: item.href }, $event, item.title)"
      />
      <GalleryMoreButton
        v-else
        :title="item.title"
        :expanded="openActionHref === item.href"
        :busy="loading || saving"
        @click="emit('openActions', $event, item, section)"
      />
    </template>
  </GalleryList>
</template>
