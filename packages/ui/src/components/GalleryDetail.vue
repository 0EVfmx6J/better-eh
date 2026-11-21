<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'
import { computed, useId } from 'vue'
import type { GalleryComments as Comments, GalleryPage, GalleryTag, ReadingProgress } from '@better-eh/core'
import { provideGalleryResizePosition } from '../composables/provideGalleryResizePosition'
import { useTagDirectoryStore } from '../stores/tag-directory'
import ActionButton from './ActionButton.vue'
import BookmarkButton from './BookmarkButton.vue'
import GalleryComments from './GalleryComments.vue'
import GalleryRows from './GalleryRows.vue'
import ThumbnailTile from './ThumbnailTile.vue'

const props = defineProps<{
  page: GalleryPage
  galleryProgress?: ReadingProgress
  galleryReadHref?: string
  savedForLater: boolean
  bookmarksBusy: boolean
  activeTag?: GalleryTag
  active: boolean
  loadComments: (href: string, signal: AbortSignal, refresh: boolean) => Promise<Comments>
  refreshComments: (href: string, signal: AbortSignal) => Promise<Comments>
}>()
const tags = useTagDirectoryStore()
const thumbnailsHeading = useId()
provideGalleryResizePosition()

function estimateThumbnailRowSize(_items: readonly unknown[], width: number): number {
  // The 4:5 image is inside a 1px border, with an 18px page number and 8px padding below it.
  return Math.max(0, width - 2) * 1.25 + 28
}

const emit = defineEmits<{
  navigate: [event: MouseEvent, href: string]
  openCommentLink: [event: MouseEvent, href: string]
  startReading: [event: MouseEvent]
  toggleBookmark: [event: MouseEvent]
  tag: [event: MouseEvent, tag: GalleryTag]
}>()
const metadata = computed(() => {
  const gallery = props.page
  return [
    { label: '语言', value: gallery.language },
    { label: '上传者', value: gallery.uploader },
    { label: '评分', value: gallery.rating },
    { label: '发布日期', value: gallery.posted },
  ].filter((item) => item.value)
})
const tagGroupLabels = new Map([
  ['language', '语言'],
  ['parody', '原作'],
  ['character', '角色'],
  ['group', '社团'],
  ['artist', '画师'],
  ['category', '分类'],
  ['tag', '标签'],
  ['cosplayer', '角色扮演者'],
  ['female', '女性'],
  ['male', '男性'],
  ['mixed', '混合'],
  ['other', '其他'],
  ['location', '地点'],
  ['reclass', '重新分类'],
  ['misc', '杂项'],
])
const galleryTagGroups = computed(() => {
  const gallery = props.page
  const groups = new Map<string | undefined, GalleryTag[]>()
  for (const tag of gallery.tags) {
    const tags = groups.get(tag.namespace)
    if (tags) tags.push(tag)
    else groups.set(tag.namespace, [tag])
  }
  return Array.from(groups, ([namespace, tags]) => ({
    namespace,
    label: namespace ? (tagGroupLabels.get(namespace) ?? namespace) : '未分类',
    tags,
  }))
})
</script>

<template>
  <section class="detail" :class="{ 'detail-with-cover': page.cover }">
    <div class="detail-copy">
      <p class="category">{{ page.category }}<span v-if="page.pages"> / {{ page.pages }} 页</span></p>
      <h1>{{ page.title }}</h1>
      <p v-if="page.subtitle && page.subtitle !== page.title" class="subtitle">{{ page.subtitle }}</p>
      <dl v-if="metadata.length" class="details-grid">
        <div v-for="item in metadata" :key="item.label">
          <dt>{{ item.label }}</dt>
          <dd>{{ item.value }}</dd>
        </div>
      </dl>
    </div>
    <div class="detail-media">
      <div v-if="page.cover" class="detail-cover"><img :src="page.cover" alt="" decoding="async" /></div>
      <div class="reading-actions detail-actions">
        <ActionButton
          v-if="galleryProgress"
          variant="primary"
          :href="galleryProgress.href"
          @click="emit('navigate', $event, galleryProgress.href)"
        >
          从第 {{ galleryProgress.index }} 页开始阅读 <ArrowRight :size="17" aria-hidden="true" />
        </ActionButton>
        <ActionButton
          v-if="galleryReadHref || galleryProgress"
          :variant="galleryProgress ? 'secondary' : 'primary'"
          :href="galleryReadHref"
          @click="emit('startReading', $event)"
        >
          {{ galleryProgress ? '从头开始阅读' : '进入阅读' }} <ArrowRight :size="17" aria-hidden="true" />
        </ActionButton>
        <BookmarkButton :saved="savedForLater" :busy="bookmarksBusy" @toggle="emit('toggleBookmark', $event)" />
      </div>
    </div>
    <dl v-if="galleryTagGroups.length" class="detail-tag-groups" aria-label="画廊标签">
      <div v-for="group in galleryTagGroups" :key="group.namespace ?? ''" class="detail-tag-group">
        <dt>{{ group.label }}</dt>
        <dd>
          <component
            :is="tag.href ? 'a' : 'span'"
            v-for="tag in group.tags"
            :key="tag.key ?? tag.href ?? tag.label"
            class="pill"
            :href="tag.href"
            :title="tag.key ?? tag.label"
            :aria-haspopup="tag.href && tag.searchTerm ? 'dialog' : undefined"
            :aria-expanded="tag.href && tag.searchTerm ? activeTag === tag : undefined"
            :aria-controls="activeTag === tag ? 'gallery-tag-search' : undefined"
            @click="emit('tag', $event, tag)"
          >
            {{ (tag.key && tags.translate?.(tag.key)) || tag.label }}
          </component>
        </dd>
      </div>
    </dl>
  </section>
  <div class="section-title flex items-center justify-between gap-2">
    <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <h2 :id="thumbnailsHeading">页面缩略图</h2>
      <span v-if="page.thumbnails.length" class="count whitespace-nowrap">
        {{ page.thumbnails[0]?.index }}–{{ page.thumbnails.at(-1)?.index }} 页
      </span>
    </div>
    <GalleryComments
      :key="page.href"
      :gallery-href="page.href"
      :comments="page.comments"
      :active="active"
      :load-comments="loadComments"
      :refresh-comments="refreshComments"
      @navigate="(event, href) => emit('openCommentLink', event, href)"
    />
  </div>
  <GalleryRows
    v-if="page.thumbnails.length"
    :key="page.href"
    v-slot="{ item: thumb, position }"
    class="thumbnails"
    group="thumbnails"
    :aria-labelledby="thumbnailsHeading"
    :items="page.thumbnails"
    :estimate-row-size="estimateThumbnailRowSize"
  >
    <div
      role="listitem"
      :aria-posinset="position"
      :aria-setsize="page.thumbnails.length"
      :data-gallery-href="thumb.href"
    >
      <a
        :href="thumb.href"
        class="thumbnail"
        :aria-label="'阅读第 ' + thumb.index + ' 页'"
        @click="emit('navigate', $event, thumb.href)"
      >
        <ThumbnailTile :thumb="thumb" />
        <span class="thumbnail-number block p-1 text-[12px] tabular-nums">{{ thumb.index }}</span>
      </a>
    </div>
  </GalleryRows>
  <p v-else class="empty">没有可用的页面缩略图。</p>
</template>
