import { elementScroll, useVirtualizer, type Range } from '@tanstack/vue-virtual'
import { useDebounceFn, useEventListener, useResizeObserver } from '@vueuse/core'
import { computed, nextTick, onScopeDispose, shallowReactive, shallowRef, watch, type Ref } from 'vue'
import type { ReaderFrame } from '@better-eh/core'
import { afterRenderedFrame } from '../utils/after-rendered-frame'

export interface ReaderVirtualizerProps {
  viewport: HTMLElement | null
  preserveEdgePosition: () => Promise<boolean>
  frames: readonly (ReaderFrame & { chapter: number })[]
  pagesAhead: number
  pagesBehind: number
  buffer: { head: readonly string[]; tail: readonly string[] }
  scrollTop: number
  trackPosition: boolean
  returningToTop: boolean
  brokenImages: ReadonlySet<string>
  loadPreviousFailure?: string
}

type ReaderSlot = { key: string; frame: ReaderVirtualizerProps['frames'][number]; position: number } | { key: string }

interface ReaderResizeAnchor {
  href: string
  progress: number
}

export function useReaderVirtualizer(
  props: ReaderVirtualizerProps,
  framesElement: Readonly<Ref<HTMLElement | null>>,
  heightProbe: Readonly<Ref<HTMLElement | null>>,
  fitWidth: Readonly<Ref<boolean>>,
  showPage: (chapter: number, index: number) => void,
) {
  const gap = 18
  const minHeight = 180
  const geometry = shallowRef({ width: 0, maxHeight: 0, viewportHeight: 0, offset: 0, widthMode: false })
  const endSpace = shallowRef(0)
  const focusedPage = shallowRef<string>()
  const seekingPage = shallowRef<{ href: string }>()
  const restoringPage = shallowRef<ReaderResizeAnchor>()
  const prepending = shallowRef(false)
  let scrollWrite = 0
  let savedResize: { anchor: ReaderResizeAnchor; scrollTop: number } | undefined
  const imageSizes = shallowReactive(new Map<string, { width: number; height: number }>())
  const restoreAfterResize = useDebounceFn(restorePosition, 80)
  // Extend the head after the first prepend, keeping the entry page at the initial position.
  const entryPage = props.frames[0]?.href
  const headBuffer = computed(() => (props.frames[0]?.href !== entryPage ? props.buffer.head : []))
  const slots = computed<ReaderSlot[]>(() => [
    ...headBuffer.value.map((key) => ({ key })),
    ...props.frames.map((frame, position) => ({ key: `${frame.chapter}:${frame.index}`, frame, position })),
    ...props.buffer.tail.map((key) => ({ key })),
  ])

  function edgeTranslation(container: HTMLElement): number {
    const transform = container.closest('main')?.style.transform
    return transform ? new DOMMatrixReadOnly(transform).m42 : 0
  }

  function updateGeometry(): void {
    const container = framesElement.value
    const viewport = props.viewport
    const probe = heightProbe.value
    if (!container || !viewport || !probe || !container.clientWidth) return
    const bounds = container.getBoundingClientRect()
    const width = bounds.width
    const viewportHeight = viewport.clientHeight
    const maxHeight = Number.parseFloat(getComputedStyle(probe).maxHeight) || Math.max(360, viewportHeight * 0.69)
    const offset = bounds.top - viewport.getBoundingClientRect().top + viewport.scrollTop - edgeTranslation(container)
    const widthMode = fitWidth.value
    const previous = geometry.value
    const reflow =
      width !== previous.width ||
      maxHeight !== previous.maxHeight ||
      viewportHeight !== previous.viewportHeight ||
      widthMode !== previous.widthMode
    const restoring = restoringPage.value
    const anchor =
      reflow && previous.width && props.trackPosition && !props.returningToTop && !seekingPage.value
        ? (restoring ?? savedResize?.anchor ?? captureResizeAnchor(viewport))
        : undefined
    const request = anchor && { ...anchor }
    if (request) restoringPage.value = request
    if (reflow || Math.abs(offset - previous.offset) > 0.5) {
      geometry.value = { width, maxHeight, viewportHeight, offset, widthMode }
    }
    if (request) void restoreAfterResize(viewport, container, request)
  }

  function captureResizeAnchor(viewport: HTMLElement): ReaderResizeAnchor | undefined {
    if (viewport.scrollTop <= 1) return
    const line = viewport.scrollTop + Math.floor(geometry.value.viewportHeight / 3)
    const row = virtualizer.value.getVirtualItemForOffset(line)
    const slot = row && slots.value[row.index]
    const frame = slot && 'frame' in slot ? slot.frame : undefined
    if (row && frame) return { href: frame.href, progress: Math.max(0, Math.min(1, (line - row.start) / row.size)) }
  }

  useEventListener(
    () => props.viewport,
    'scroll',
    () => {
      const viewport = props.viewport
      if (!viewport || !savedResize || restoringPage.value) return
      const lastTop = savedResize.scrollTop
      const clampedTop = Math.min(lastTop, Math.max(0, viewport.scrollHeight - viewport.clientHeight))
      if (Math.abs(viewport.scrollTop - lastTop) > 1 && Math.abs(viewport.scrollTop - clampedTop) > 1) {
        savedResize = undefined
      }
    },
    { passive: true },
  )

  function dimensions(frame: ReaderFrame) {
    return imageSizes.get(frame.image) ?? frame
  }

  function estimateHeight(frame: ReaderFrame, width: number, maxHeight: number, widthMode: boolean): number {
    const size = dimensions(frame)
    const ratio = size.width && size.height ? size.height / size.width : 1.4
    const scaled = widthMode ? width * ratio : Math.min(maxHeight, Math.min(width, size.width || width) * ratio)
    return Math.max(minHeight, scaled)
  }

  const rangeExtractor = computed(() => {
    const retained = [focusedPage.value, (seekingPage.value ?? restoringPage.value)?.href]
      .filter(Boolean)
      .map((href) => slots.value.findIndex((slot) => 'frame' in slot && slot.frame.href === href))
    return ({ startIndex, endIndex, count }: Range) => {
      const start = Math.max(0, startIndex - props.pagesBehind)
      const end = Math.min(count - 1, endIndex + props.pagesAhead)
      const range = Array.from({ length: end - start + 1 }, (_, index) => start + index)
      for (const index of retained) {
        if (index >= 0 && (index < start || index > end) && !range.includes(index)) range.push(index)
      }
      return range.sort((a, b) => a - b)
    }
  })

  const virtualizer = useVirtualizer<HTMLElement, HTMLElement>(
    computed(() => {
      const rows = slots.value
      const { width, maxHeight, offset, widthMode, viewportHeight } = geometry.value
      return {
        count: rows.length,
        enabled: width > 0,
        anchorTo: prepending.value ? 'end' : 'start',
        getScrollElement: () => props.viewport,
        getItemKey: (position: number) => rows[position]?.key ?? position,
        estimateSize: (position: number) => {
          const row = rows[position]
          return row && 'frame' in row
            ? estimateHeight(row.frame, width, maxHeight, widthMode)
            : Math.max(minHeight, maxHeight / 2, viewportHeight / 2)
        },
        gap,
        paddingEnd: gap,
        scrollMargin: offset,
        scrollToFn(offset, options, instance) {
          const viewport = instance.scrollElement
          if (!viewport) return
          const write = ++scrollWrite
          const apply = () => {
            if (write !== scrollWrite || props.viewport !== viewport) return
            const before = viewport.scrollTop
            elementScroll(offset, options, instance)
            if (savedResize && Math.abs(before - savedResize.scrollTop) <= 1) savedResize.scrollTop = viewport.scrollTop
          }
          // Let Vue commit the new virtual positions before writing their scroll offset.
          if (options.behavior === undefined || options.adjustments !== undefined) {
            queueMicrotask(() => void nextTick(apply))
          } else apply()
        },
        rangeExtractor: rangeExtractor.value,
        useAnimationFrameWithResizeObserver: true,
      }
    }),
  )

  watch(
    () => slots.value[0]?.key,
    (first, previous) => {
      if (!previous || !first || !slots.value.some((slot) => slot.key === previous)) return
      const viewport = props.viewport
      const container = framesElement.value
      const main = container?.closest('main')
      if (viewport && container && main) {
        // Keep short last pages anchored by reserving the unused viewport space before insertion.
        const bottom =
          container.getBoundingClientRect().bottom -
          edgeTranslation(container) +
          endSpace.value +
          parseFloat(getComputedStyle(main).paddingBottom)
        const unused = viewport.getBoundingClientRect().bottom - bottom
        if (unused > 0) endSpace.value += Math.ceil(unused)
      }
      prepending.value = true
      void nextTick(() => (prepending.value = false))
    },
    { flush: 'sync' },
  )

  const totalHeight = computed(() => virtualizer.value.getTotalSize())
  const rendered = computed(() => {
    const { offset } = geometry.value
    return virtualizer.value.getVirtualItems().flatMap((item) => {
      const slot = slots.value[item.index]
      if (!slot || !('frame' in slot)) return []
      const { frame, position } = slot
      const size = dimensions(frame)
      return [
        {
          frame,
          position,
          top: item.start - offset,
          width: size.width,
          height: size.height,
          // Keep the rendered frame the same height as its virtual slot during reflow.
          pageHeight: item.size,
        },
      ]
    })
  })
  const renderedBuffer = computed(() =>
    virtualizer.value.getVirtualItems().flatMap((item) => {
      const slot = slots.value[item.index]
      if (!slot || 'frame' in slot) return []
      return [{ key: slot.key, top: item.start - geometry.value.offset, height: item.size }]
    }),
  )

  watch(
    [() => props.returningToTop, seekingPage, restoringPage],
    ([returning, seeking, restoring]) => {
      if (returning || seeking) savedResize = undefined
      virtualizer.value.shouldAdjustScrollPositionOnItemSizeChange =
        returning || seeking || restoring ? () => false : undefined
    },
    { immediate: true, flush: 'sync' },
  )

  watch([framesElement, () => props.viewport, () => props.loadPreviousFailure, fitWidth], updateGeometry, {
    flush: 'post',
  })
  let resizeFrame = 0
  useResizeObserver(
    () => [props.viewport, framesElement.value, framesElement.value?.closest('main')],
    () => {
      cancelAnimationFrame(resizeFrame)
      resizeFrame = requestAnimationFrame(updateGeometry)
    },
  )
  onScopeDispose(() => {
    scrollWrite += 1
    cancelAnimationFrame(resizeFrame)
    restoringPage.value = undefined
  })
  watch(
    [() => geometry.value.width, () => geometry.value.maxHeight, () => geometry.value.widthMode],
    () => {
      virtualizer.value.measure()
    },
    { flush: 'post' },
  )

  watch(
    [() => props.scrollTop, () => props.trackPosition, rendered],
    () => {
      const viewport = props.viewport
      if (!viewport || !props.trackPosition || seekingPage.value || restoringPage.value) return
      const line = Math.floor(viewport.clientHeight / 3) + viewport.scrollTop
      const items = virtualizer.value.getVirtualItems()
      const item = items.find(({ start, end }) => end > line && start < line + 24)
      const slot = item && slots.value[item.index]
      const frame = slot && 'frame' in slot ? slot.frame : undefined
      if (frame) showPage(frame.chapter, frame.index)
    },
    { flush: 'post' },
  )

  function recordImageSize(position: number, url: string, event: Event): void {
    const image = event.target
    if (!(image instanceof HTMLImageElement) || !image.naturalWidth || !image.naturalHeight) return
    const frame = props.frames[position]
    if (frame?.image !== url) return
    const previous = dimensions(frame)
    if (previous.width === image.naturalWidth && previous.height === image.naturalHeight) return
    void props.preserveEdgePosition()
    imageSizes.set(url, { width: image.naturalWidth, height: image.naturalHeight })
    const { width, maxHeight, widthMode } = geometry.value
    virtualizer.value.resizeItem(position + headBuffer.value.length, estimateHeight(frame, width, maxHeight, widthMode))
  }

  async function restorePosition(
    viewport: HTMLElement,
    container: HTMLElement,
    request: ReaderResizeAnchor,
  ): Promise<void> {
    await afterRenderedFrame()
    if (restoringPage.value !== request) return
    const index = props.frames.findIndex((frame) => frame.href === request.href)
    const target = container.querySelector<HTMLElement>(`[data-index="${index}"]`)
    if (target && props.trackPosition && !props.returningToTop && !seekingPage.value) {
      const bounds = target.getBoundingClientRect()
      const offset =
        Math.floor(viewport.clientHeight / 3) -
        Math.min(Math.max(0, bounds.height - 1), bounds.height * request.progress)
      const top = bounds.top - viewport.getBoundingClientRect().top + viewport.scrollTop - offset
      viewport.scrollTo({ top: Math.round(top), behavior: 'instant' })
      savedResize = { anchor: request, scrollTop: viewport.scrollTop }
    }
    restoringPage.value = undefined
  }

  async function scrollToPage(chapter: number, index: number, signal: AbortSignal): Promise<boolean> {
    const viewport = props.viewport
    const container = framesElement.value
    const frame = props.frames.find((frame) => frame.chapter === chapter && frame.index === index)
    if (!viewport || !container || !frame || signal.aborted) return false
    const request = { href: frame.href }
    seekingPage.value = request
    restoringPage.value = undefined
    try {
      await nextTick()
      if (signal.aborted) return false
      const target = container.querySelector<HTMLElement>(
        `[data-reader-chapter="${chapter}"][data-reader-index="${index}"]`,
      )
      if (!target) return false
      const bounds = target.getBoundingClientRect()
      const viewportBounds = viewport.getBoundingClientRect()
      const line = Math.floor(viewport.clientHeight / 3)
      const headerHeight = viewport.querySelector<HTMLElement>('.masthead')?.offsetHeight ?? 0
      const offset = Math.min(line, Math.max(headerHeight + 8, line - bounds.height / 2))
      const top = Math.max(0, Math.round(viewport.scrollTop + bounds.top - viewportBounds.top - offset))
      const extra = Math.ceil(top - (viewport.scrollHeight - viewport.clientHeight))
      if (extra > 0) {
        endSpace.value += extra
        await nextTick()
      }
      if (signal.aborted) return false
      virtualizer.value.scrollToOffset(top, { behavior: 'instant' })
      return true
    } finally {
      if (seekingPage.value === request) seekingPage.value = undefined
    }
  }

  return { rendered, renderedBuffer, totalHeight, endSpace, focusedPage, recordImageSize, scrollToPage }
}
