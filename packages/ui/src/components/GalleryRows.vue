<script setup lang="ts" generic="Item extends { href: string }">
import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/vue-virtual'
import { useResizeObserver } from '@vueuse/core'
import { computed, inject, nextTick, onScopeDispose, shallowRef, useTemplateRef, watch } from 'vue'
import { afterRenderedFrame } from '../utils/after-rendered-frame'
import { galleryResizePositionKey, galleryViewportKey, type GalleryScrollAnchor } from '../utils/gallery-scroll'

const props = defineProps<{
  items: readonly Item[]
  group: string
  estimateRowSize: (items: readonly Item[], itemWidth: number) => number
}>()
defineSlots<{
  default: (props: { item: Item; position: number }) => unknown
}>()

const context = inject(galleryViewportKey)
const providedResizePosition = inject(galleryResizePositionKey)
if (!context || !providedResizePosition)
  throw new Error('GalleryRows needs the parent gallery list and app scroll container.')
const resizePosition = providedResizePosition
const { viewport, restoration, returningToTop } = context
const list = useTemplateRef<HTMLElement>('list')
const geometry = shallowRef({ width: 0, columns: 1, gap: 0, offset: 0, headerHeight: 0 })
const focusedRow = shallowRef<number>()
const restoringRow = shallowRef<number>()
const resizeAnchor = shallowRef<GalleryScrollAnchor>()
const columns = computed(() => geometry.value.columns)
const count = computed(() => Math.ceil(props.items.length / columns.value))
const rowKey = computed(() => {
  const { items } = props
  const columnCount = columns.value
  return (index: number) => items[index * columnCount]?.href ?? index
})
const rangeExtractor = computed(() => {
  const retained = [focusedRow.value, restoringRow.value].filter((index): index is number => index !== undefined)
  return (range: Range) => {
    const visible = defaultRangeExtractor(range)
    for (const index of retained) {
      if (index < range.count && !visible.includes(index)) visible.push(index)
    }
    return visible.sort((a, b) => a - b)
  }
})

function updateGeometry(): void {
  const node = list.value
  const scroll = viewport.value
  if (!node || !scroll) return
  const bounds = node.getBoundingClientRect()
  const { width } = bounds
  if (!width) return
  const style = getComputedStyle(node)
  const gap = Number.parseFloat(style.getPropertyValue('--gallery-gap'))
  const minWidth = Number.parseFloat(style.getPropertyValue('--gallery-min-column-width'))
  const fixedColumns = Number(style.getPropertyValue('--gallery-fixed-columns'))
  const columns = fixedColumns || Math.max(1, Math.floor((width + gap) / (minWidth + gap)))
  const offset = Math.round(bounds.top - scroll.getBoundingClientRect().top + scroll.scrollTop)
  const headerHeight = scroll.querySelector('.masthead')?.getBoundingClientRect().height ?? 0
  const previous = geometry.value
  const resized = width !== previous.width || columns !== previous.columns || gap !== previous.gap
  if (resized && previous.width && !returningToTop.value) {
    // A card can move to another column. Keep its identity when the window changes size again.
    const anchor = resizePosition.value?.anchor ?? anchorBeforeResize(scroll.scrollTop)
    if (anchor?.group === props.group) {
      resizePosition.value = { anchor }
      resizeAnchor.value = { ...anchor }
    }
  }
  if (resized || offset !== previous.offset || headerHeight !== previous.headerHeight) {
    geometry.value = { width, columns, gap, offset, headerHeight }
  }
}

const virtualizer = useVirtualizer<HTMLElement, HTMLElement>(
  computed(() => {
    const { width, columns, gap, offset } = geometry.value
    const cardWidth = (width - (columns - 1) * gap) / columns
    const { items, estimateRowSize } = props
    return {
      count: count.value,
      enabled: width > 0,
      getScrollElement: () => viewport.value,
      getItemKey: rowKey.value,
      gap,
      scrollMargin: offset,
      overscan: 3,
      useAnimationFrameWithResizeObserver: true,
      rangeExtractor: rangeExtractor.value,
      estimateSize: (index) => estimateRowSize(items.slice(index * columns, (index + 1) * columns), cardWidth),
      measureElement(element, entry, instance) {
        const box = entry?.borderBoxSize[0]
        const bounds = box ?? element.getBoundingClientRect()
        const measuredWidth = 'inlineSize' in bounds ? bounds.inlineSize : bounds.width
        // An observer can see the new width before the cards are assigned to their new rows.
        if (Math.abs(measuredWidth - width) > 1) {
          const index = Number(element.dataset.index)
          return instance.itemSizeCache.get(instance.options.getItemKey(index)) ?? instance.options.estimateSize(index)
        }
        return 'blockSize' in bounds ? bounds.blockSize : bounds.height
      },
    }
  }),
)

const rows = computed(() =>
  virtualizer.value.getVirtualItems().map((row) => ({
    index: row.index,
    top: row.start - geometry.value.offset,
    items: props.items.slice(row.index * columns.value, (row.index + 1) * columns.value),
  })),
)

function anchorBeforeResize(scrollTop: number): GalleryScrollAnchor | undefined {
  const { columns, offset, headerHeight, gap } = geometry.value
  const visibleTop = scrollTop + headerHeight
  const instance = virtualizer.value
  if (scrollTop <= 1 || visibleTop < offset || visibleTop >= offset + instance.getTotalSize()) return

  // CSS has already resized the cards. Use the previous row positions to identify the visible card.
  const row = instance.getVirtualItemForOffset(visibleTop)
  const visibleRow = row && row.end <= visibleTop ? instance.getVirtualItemForOffset(row.end + gap + 0.01) : row
  const href = visibleRow && props.items[visibleRow.index * columns]?.href
  if (visibleRow && href) return { href, group: props.group, offset: visibleRow.start - scrollTop }
}

watch(
  [returningToTop, resizeAnchor],
  ([returning, anchor]) => {
    // Instant corrections can interrupt a smooth scroll or move the anchor during a resize.
    virtualizer.value.shouldAdjustScrollPositionOnItemSizeChange = returning || anchor ? () => false : undefined
  },
  { immediate: true, flush: 'sync' },
)

watch([list, viewport, () => props.estimateRowSize], updateGeometry, { flush: 'post' })
let geometryFrame = 0
useResizeObserver(
  () => [viewport.value, viewport.value?.querySelector('.masthead'), list.value, list.value?.closest('main')],
  () => {
    cancelAnimationFrame(geometryFrame)
    geometryFrame = requestAnimationFrame(updateGeometry)
  },
)
onScopeDispose(() => {
  cancelAnimationFrame(geometryFrame)
  if (resizePosition.value?.anchor.group === props.group) resizePosition.value = undefined
})

function measureRows(): void {
  list.value?.querySelectorAll<HTMLElement>('.gallery-row').forEach(virtualizer.value.measureElement)
}

function measureRow(element: unknown): void {
  virtualizer.value.measureElement(element instanceof HTMLElement ? element : null)
}

watch(
  [() => geometry.value.width, columns, () => props.estimateRowSize],
  async () => {
    virtualizer.value.measure()
    await nextTick()
    measureRows()
  },
  { flush: 'post' },
)

watch(
  [restoration, resizeAnchor, list, returningToTop],
  async ([historyAnchor, resized, node, returning], [previousHistory, , previousNode], onCleanup) => {
    if (returning) {
      resizePosition.value = undefined
      resizeAnchor.value = undefined
      return
    }
    const anchor = resized ?? (historyAnchor !== previousHistory || node !== previousNode ? historyAnchor : undefined)
    const scroll = viewport.value
    if (!anchor || anchor.group !== props.group || !node || !scroll) return
    const item = props.items.findIndex((item) => item.href === anchor.href)
    if (item < 0) {
      if (resized) {
        resizePosition.value = undefined
        resizeAnchor.value = undefined
      }
      return
    }

    let cancelled = false
    onCleanup(() => {
      cancelled = true
      restoringRow.value = undefined
    })
    const index = Math.floor(item / columns.value)
    restoringRow.value = index
    // An earlier group can resize after it mounts, shifting the target group's start.
    await afterRenderedFrame()
    if (cancelled) return
    updateGeometry()
    measureRows()
    await nextTick()
    if (cancelled) return

    const row = node.querySelector<HTMLElement>(`[data-index="${index}"]`)
    if (row) {
      const bounds = row.getBoundingClientRect()
      const viewportTop = scroll.getBoundingClientRect().top
      const headerBottom =
        (scroll.querySelector('.masthead')?.getBoundingClientRect().bottom ?? viewportTop) - viewportTop
      const visible = anchor.offset < scroll.clientHeight && anchor.offset + bounds.height > headerBottom
      const offset = visible ? anchor.offset : headerBottom
      const top = bounds.top - viewportTop + scroll.scrollTop - offset
      if (resized) {
        scroll.scrollTo({ top, behavior: 'instant' })
        resizePosition.value = { anchor, scrollTop: scroll.scrollTop }
      } else virtualizer.value.scrollToOffset(top)
    }
    requestAnimationFrame(() => {
      if (cancelled) return
      restoringRow.value = undefined
      if (resized) {
        if (!row) resizePosition.value = undefined
        resizeAnchor.value = undefined
      }
    })
  },
  { flush: 'post' },
)
</script>

<template>
  <div
    ref="list"
    class="gallery-rows"
    :style="{ height: virtualizer.getTotalSize() + 'px', '--gallery-columns': columns }"
    :data-gallery-group="group"
    role="list"
    @focusout="focusedRow = undefined"
  >
    <div
      v-for="row in rows"
      :key="row.items[0]?.href ?? row.index"
      :ref="measureRow"
      class="gallery-row"
      :data-index="row.index"
      :style="{ transform: `translateY(${row.top}px)` }"
      role="presentation"
      @focusin="focusedRow = row.index"
    >
      <template v-for="(item, index) in row.items" :key="item.href">
        <slot :item="item" :position="row.index * columns + index + 1" />
      </template>
    </div>
  </div>
</template>
