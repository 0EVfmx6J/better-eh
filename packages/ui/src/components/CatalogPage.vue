<script setup lang="ts">
import type { CatalogPage, GallerySummary } from '@better-eh/core'
import BookmarkButton from './BookmarkButton.vue'
import GalleryList from './GalleryList.vue'
import GalleryMoreButton from './GalleryMoreButton.vue'

defineProps<{
  page: CatalogPage
  items: readonly (GallerySummary & { progressIndex?: number })[]
  featured?: { title: string; items: readonly (GallerySummary & { progressIndex?: number })[] }
  listKey: string
  savedHrefs: ReadonlySet<string>
  busy: boolean
  desktop: boolean
  openActionHref?: string
}>()
const selecting = defineModel<boolean>('selecting', { required: true })
const emit = defineEmits<{
  navigate: [event: MouseEvent, href: string]
  saveSelected: [items: GallerySummary[], event: MouseEvent]
  toggleReadLater: [event: MouseEvent, gallery: GallerySummary]
  openActions: [event: MouseEvent, gallery: GallerySummary]
}>()
</script>

<template>
  <GalleryList
    v-model:selecting="selecting"
    :title="page.title"
    :query="page.query"
    :items="items"
    :items-title="page.itemsTitle"
    :featured="featured"
    :list-key="listKey"
    bulk-action="save"
    :selection-busy="busy"
    @navigate="(event, href) => emit('navigate', event, href)"
    @apply-selection="(items, event) => emit('saveSelected', items, event)"
  >
    <template #filters>
      <nav v-if="page.categories.length" class="filters flex" aria-label="画廊分类">
        <a
          v-for="category in page.categories"
          :key="category.label"
          class="pill"
          :aria-current="category.selected ? 'true' : undefined"
          :href="category.href"
          @click="emit('navigate', $event, category.href)"
          >{{ category.label }}</a
        >
      </nav>
    </template>
    <template #empty>
      <p class="empty">{{ page.emptyMessage ?? '没有找到画廊。可以试试其他关键词或分类。' }}</p>
    </template>
    <template #quickAction="{ item }">
      <BookmarkButton
        v-if="desktop"
        :catalog-title="item.title"
        :saved="savedHrefs.has(item.href)"
        :busy="busy"
        @toggle="emit('toggleReadLater', $event, item)"
      />
      <GalleryMoreButton
        v-else
        :title="item.title"
        :expanded="openActionHref === item.href"
        :busy="busy"
        @click="emit('openActions', $event, item)"
      />
    </template>
  </GalleryList>
</template>
