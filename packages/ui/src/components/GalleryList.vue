<script
  setup
  lang="ts"
  generic="
    Item extends ReadingGallery & { category?: string; posted?: string; recordedAt?: number; progressIndex?: number }
  "
>
import { Grid2X2, Image, List } from '@lucide/vue'
import { useEventListener, usePreferredReducedMotion } from '@vueuse/core'
import { MotionComponent } from '@vueuse/motion'
import { storeToRefs } from 'pinia'
import { computed, inject, nextTick, provide, shallowRef, useId, useTemplateRef, watch } from 'vue'
import type { ReadingGallery } from '@better-eh/core'
import { usePreferencesStore } from '../stores/preferences'
import { galleryResizePositionKey, galleryViewportKey, type GalleryResizePosition } from '../utils/gallery-scroll'
import ActionButton from './ActionButton.vue'
import GalleryRows from './GalleryRows.vue'

const props = defineProps<{
  title: string
  query?: string
  items: readonly Item[]
  itemsTitle?: string
  featured?: { title: string; items: readonly Item[] }
  listKey: string
  bulkAction: 'save' | 'delete'
  selectionBusy: boolean
}>()
const { layout } = storeToRefs(usePreferencesStore())
const selecting = defineModel<boolean>('selecting', { required: true })
const emit = defineEmits<{
  navigate: [event: MouseEvent, href: string]
  applySelection: [items: Item[], event: MouseEvent]
}>()
defineSlots<{
  controls?: () => unknown
  filters?: () => unknown
  notice?: () => unknown
  empty: () => unknown
  quickAction?: (props: { item: Item }) => unknown
}>()
const headingId = useId()
const motion = usePreferredReducedMotion()
const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })
const selectionStart = useTemplateRef<HTMLButtonElement>('selectionStart')
const selectionExit = useTemplateRef<HTMLButtonElement>('selectionExit')
const selectedHrefs = shallowRef(new Set<string>())
const viewport = inject(galleryViewportKey)?.viewport
const resizePosition = shallowRef<GalleryResizePosition>()
provide(galleryResizePositionKey, resizePosition)
useEventListener(
  () => viewport?.value,
  'scroll',
  () => {
    const scroll = viewport?.value
    const top = resizePosition.value?.scrollTop
    if (!scroll || top === undefined || Math.abs(scroll.scrollTop - top) <= 1) return
    // A taller viewport can clamp scrollTop at the end before the resize is applied.
    const clampedTop = Math.min(top, Math.max(0, scroll.scrollHeight - scroll.clientHeight))
    if (Math.abs(scroll.scrollTop - clampedTop) > 1) resizePosition.value = undefined
  },
  { passive: true },
)
const groups = computed(() => {
  const main = { id: 'main', title: props.itemsTitle, items: props.items }
  return props.featured ? [{ id: 'featured', ...props.featured }, main] : [main]
})
const allItems = computed(() => {
  if (!props.featured) return props.items
  const unique = new Map(props.featured.items.map((item) => [item.href, item]))
  for (const item of props.items) unique.set(item.href, item)
  return [...unique.values()]
})
const selectedItems = computed(() => allItems.value.filter((item) => selectedHrefs.value.has(item.href)))
const allSelected = computed(() => allItems.value.length > 0 && selectedItems.value.length === allItems.value.length)

watch(selecting, (active) => {
  if (!active) selectedHrefs.value = new Set()
})

async function toggleSelection(): Promise<void> {
  selecting.value = !selecting.value
  await nextTick()
  const target = selecting.value ? selectionExit.value : selectionStart.value
  target?.focus()
}

function changeSelection(href: string, event: Event): void {
  if (!(event.target instanceof HTMLInputElement)) return
  const next = new Set(selectedHrefs.value)
  if (event.target.checked) next.add(href)
  else next.delete(href)
  selectedHrefs.value = next
}

function toggleAll(): void {
  selectedHrefs.value = new Set(allSelected.value ? [] : allItems.value.map((item) => item.href))
}
</script>

<template>
  <section :aria-labelledby="headingId">
    <div class="catalog-title flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 :id="headingId" tabindex="-1">{{ title }}</h1>
        <p v-if="query" class="query">{{ query }}</p>
      </div>
      <div class="catalog-controls">
        <span class="count">{{ allItems.length }} 个画廊</span>
        <slot name="controls" />
        <button
          v-if="allItems.length && !selecting"
          ref="selectionStart"
          type="button"
          class="pill action-button"
          :disabled="selectionBusy"
          @click="toggleSelection"
        >
          多选
        </button>
        <div class="view-switch flex" role="group" aria-label="浏览布局">
          <button
            class="icon-button"
            type="button"
            aria-label="网格视图"
            :aria-pressed="layout !== 'list'"
            @click="layout = 'grid'"
          >
            <Grid2X2 :size="17" aria-hidden="true" />
          </button>
          <button
            class="icon-button"
            type="button"
            aria-label="列表视图"
            :aria-pressed="layout === 'list'"
            @click="layout = 'list'"
          >
            <List :size="18" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
    <slot name="filters" />
    <slot name="notice" />
    <div v-if="selecting" class="gallery-selection-bar" role="group" aria-label="批量操作">
      <button
        ref="selectionExit"
        type="button"
        class="pill action-button"
        :disabled="selectionBusy"
        @click="toggleSelection"
      >
        退出多选
      </button>
      <ActionButton :disabled="selectionBusy || !allItems.length" @click="toggleAll">
        {{ allSelected ? '取消全选' : '全选' }}
      </ActionButton>
      <span class="count grow" role="status">已选 {{ selectedItems.length }} 项</span>
      <ActionButton
        :variant="bulkAction === 'delete' ? 'danger-subtle' : 'primary'"
        :disabled="selectionBusy || !selectedItems.length"
        :aria-haspopup="bulkAction === 'delete' ? 'dialog' : undefined"
        @click="emit('applySelection', selectedItems, $event)"
      >
        {{ bulkAction === 'save' ? '批量加入稍后阅读' : '批量删除' }}
      </ActionButton>
    </div>

    <template v-for="group in groups" :key="group.id">
      <h2
        v-if="group.title && group.items.length"
        :id="headingId + '-' + group.id"
        class="mt-8 border-b border-(--line) pb-3 text-xl font-semibold"
      >
        {{ group.title }}
      </h2>
      <MotionComponent
        v-if="group.items.length"
        :key="listKey"
        is="div"
        :initial="{ opacity: motion === 'reduce' ? 1 : 0 }"
        :enter="{ opacity: 1, transition: { duration: motion === 'reduce' ? 0 : 230 } }"
      >
        <GalleryRows
          v-slot="{ item, position }"
          :items="group.items"
          :group="group.id"
          :list-view="layout === 'list'"
          :aria-labelledby="group.title ? headingId + '-' + group.id : headingId"
        >
          <article
            class="gallery-card"
            :class="{ 'is-selected': selecting && selectedHrefs.has(item.href) }"
            :data-gallery-href="item.href"
            :aria-posinset="position"
            :aria-setsize="group.items.length"
            role="listitem"
          >
            <label v-if="selecting" class="card-selector">
              <span class="card-selector-box">
                <input
                  type="checkbox"
                  :aria-label="'选择 ' + item.title"
                  :checked="selectedHrefs.has(item.href)"
                  :disabled="selectionBusy"
                  @change="changeSelection(item.href, $event)"
                />
              </span>
            </label>
            <component
              :is="selecting ? 'div' : 'a'"
              class="card-link"
              :href="selecting ? undefined : item.href"
              @click="!selecting && emit('navigate', $event, item.href)"
            >
              <div class="poster">
                <img v-if="item.cover" :src="item.cover" alt="" loading="lazy" decoding="async" />
                <Image v-else :size="24" class="muted" aria-hidden="true" />
                <span v-if="item.progressIndex || item.pages" class="page-count">
                  <template v-if="item.progressIndex && item.pages >= item.progressIndex">
                    {{ item.progressIndex }}/{{ item.pages }} 页
                  </template>
                  <template v-else-if="item.progressIndex">第 {{ item.progressIndex }} 页</template>
                  <template v-else>{{ item.pages }} 页</template>
                </span>
              </div>
              <div class="card-meta">
                <p v-if="item.category" class="category">{{ item.category }}</p>
                <component :is="group.title ? 'h3' : 'h2'" class="card-title">{{ item.title }}</component>
                <time
                  v-if="item.recordedAt !== undefined"
                  class="posted"
                  :datetime="new Date(item.recordedAt).toISOString()"
                >
                  {{ dateFormat.format(item.recordedAt) }}
                </time>
                <p v-else-if="item.posted" class="posted">{{ item.posted }}</p>
              </div>
            </component>
            <div v-if="!selecting && $slots.quickAction" class="card-quick-action">
              <slot name="quickAction" :item="item" />
            </div>
          </article>
        </GalleryRows>
      </MotionComponent>
    </template>
    <div v-if="!allItems.length" class="catalog-empty">
      <slot name="empty" />
    </div>
  </section>
</template>
