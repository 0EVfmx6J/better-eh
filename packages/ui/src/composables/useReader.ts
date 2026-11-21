import { useInfiniteScroll, useResizeObserver, useScroll, useTimeoutFn } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch, type Ref } from 'vue'
import type ReaderPages from '../components/ReaderPages.vue'
import { isPrimaryClick } from '../utils/is-primary-click'
import { readerFrame } from '../utils/reader-frames'
import type { useNavigation } from './useNavigation'

interface ReaderOptions {
  app: Readonly<Ref<HTMLElement | null>>
  navigation: ReturnType<typeof useNavigation>
  desktopNavigation: Readonly<Ref<boolean>>
  compactSearch: Readonly<Ref<boolean>>
  searchOpen: Ref<boolean>
  reducedMotion: Readonly<Ref<boolean>>
  focusNavigation: () => void
}

export function useReader({
  app,
  navigation,
  desktopNavigation,
  compactSearch,
  searchOpen,
  reducedMotion,
  focusNavigation,
}: ReaderOptions) {
  const {
    activeReader: reader,
    page,
    pending,
    failure,
    seekingReader,
    readerIndex,
    readerChapter,
    readerSections,
    readingQueue,
    currentUrl,
    navigate,
    cancelReaderSeek,
    openReaderChapter,
    showReaderFrame,
    returnToReaderStart,
    loadingMore,
    loadingPrevious,
    loadMoreFailure,
    loadPreviousFailure,
    loadMore,
    hasPrevious,
    canLoadNextPage,
    canLoadNextChapter,
  } = navigation
  const { y: scrollY, isScrolling } = useScroll(app)
  let stoppingScroll = false

  const brokenImages = shallowRef(new Set<string>())
  const readerPages = useTemplateRef<InstanceType<typeof ReaderPages>>('readerPages')

  const readerChrome = shallowRef(false)
  const chaptersOpen = shallowRef(false)
  const chromeVisible = computed(() => !reader.value || readerChrome.value)
  const readerPreview = shallowRef<number>()
  let readerSeekVersion = 0
  const { start: scheduleReaderSeek, stop: stopReaderSeek } = useTimeoutFn(commitReaderSeek, 350, { immediate: false })
  const readerPagesAhead = 5
  const readerPagesBehind = 3
  const readerFrames = computed(() =>
    readerSections.value.flatMap(({ chapter, url, page }) =>
      (page.frames ?? [readerFrame(page, url)]).map((frame) => ({ ...frame, chapter })),
    ),
  )
  const activeFramePosition = computed(() =>
    readerFrames.value.findIndex((frame) => frame.chapter === readerChapter.value && frame.index === readerIndex.value),
  )
  const readerStartsLater = computed(() => (reader.value?.frames?.[0]?.index ?? reader.value?.index ?? 1) > 1)
  const showBackToTop = computed(
    () =>
      chromeVisible.value &&
      (readingQueue.value
        ? readerChapter.value > 0 || readerIndex.value > 1
        : scrollY.value > 1 || readerStartsLater.value),
  )
  const backToTopTitle = computed(() => {
    if (!reader.value) return '回到顶部'
    if (!readingQueue.value) return '回到第 1 页'
    return readerIndex.value === 1 ? '回到上一章第 1 页' : '回到当前章第 1 页'
  })

  const readerDisplayIndex = computed(() => readerPreview.value ?? readerIndex.value)
  const readerSeekFailure = computed(() =>
    failure.value?.mode === 'reader-seek' || failure.value?.mode === 'queue-chapter' ? failure.value : undefined,
  )

  watch(currentUrl, () => {
    if (!seekingReader.value) clearReaderPreview()
  })
  watch(readingQueue, () => {
    chaptersOpen.value = false
  })
  watch(
    () => page.value.kind,
    (kind) => {
      if (kind !== 'reader') {
        brokenImages.value = new Set()
        readerChrome.value = false
        clearReaderPreview()
      }
    },
    { immediate: true },
  )

  function clearReaderPreview(): void {
    readerSeekVersion += 1
    stopReaderSeek()
    readerPreview.value = undefined
  }

  function previewReaderPage(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return
    readerSeekVersion += 1
    readerPreview.value = event.target.valueAsNumber
    if (readerSeekFailure.value) failure.value = undefined
    cancelReaderSeek()
    scheduleReaderSeek()
  }

  async function commitReaderSeek(): Promise<void> {
    const index = readerPreview.value
    const version = readerSeekVersion
    if (reader.value && index && index !== readerIndex.value && !pending.value) {
      await navigate(currentUrl.value, 'reader-seek', index)
    }
    if (version === readerSeekVersion) readerPreview.value = undefined
  }

  function toggleReaderChrome(): void {
    if (compactSearch.value && searchOpen.value) {
      searchOpen.value = false
      return
    }
    readerChrome.value = !readerChrome.value
    if (!readerChrome.value) {
      searchOpen.value = false
      chaptersOpen.value = false
    }
  }

  async function selectReaderChapter(chapter: number): Promise<boolean> {
    if (chapter === readerChapter.value) return false
    clearReaderPreview()
    await openReaderChapter(chapter)
    return chapter === readerChapter.value
  }

  function tapReader(event: MouseEvent): void {
    if (!reader.value || desktopNavigation.value || !isPrimaryClick(event)) return
    if (event.target instanceof Element && !event.target.closest('a, button, input, [role="alert"]'))
      toggleReaderChrome()
  }

  async function backToTop(): Promise<void> {
    const viewport = app.value
    if (!viewport || pending.value || stoppingScroll) return

    const url = currentUrl.value
    const queue = readingQueue.value
    const chapter = readerChapter.value
    const index = readerIndex.value
    if (queue) clearReaderPreview()

    if (isScrolling.value) {
      stoppingScroll = true
      // Let WebKit render a frame with scrolling disabled to stop deceleration.
      viewport.classList.add('stop-scroll')
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      viewport.classList.remove('stop-scroll')
      stoppingScroll = false
      if (app.value !== viewport || pending.value || (queue ? readingQueue.value !== queue : currentUrl.value !== url))
        return
    }

    if (queue) {
      void returnToReaderStart(chapter, index)
      return
    }
    focusNavigation()
    if (readerStartsLater.value) {
      void returnToReaderStart()
      return
    }
    viewport.scrollTo({ top: 0, behavior: reducedMotion.value ? 'instant' : 'smooth' })
  }

  function markBroken(href: string): void {
    brokenImages.value = new Set(brokenImages.value).add(href)
  }

  function retryImage(href: string): void {
    const next = new Set(brokenImages.value)
    next.delete(href)
    brokenImages.value = next
  }

  let readerObserver: IntersectionObserver | undefined
  function observeReaderFrames(): void {
    readerObserver?.disconnect()
    const viewport = app.value
    const surface = readerPages.value?.surface
    if (!surface || !viewport) return
    const height = viewport.clientHeight
    const line = Math.floor(height / 3)
    readerObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0]
        const frame = visible?.target
        if (frame instanceof HTMLElement && frame.isConnected) {
          showReaderFrame(Number(frame.dataset.readerChapter), Number(frame.dataset.readerIndex))
        }
      },
      { root: viewport, rootMargin: `-${line}px 0px -${Math.max(0, height - line - 24)}px 0px` },
    )
    surface.querySelectorAll<HTMLElement>('[data-reader-index]').forEach((element) => readerObserver?.observe(element))
  }

  const readerPreloadDirection = computed(() => {
    const position = activeFramePosition.value
    if (position < 0 || readerPreview.value || pending.value || loadingMore.value || loadingPrevious.value)
      return undefined

    const ahead = readerFrames.value.length - 1 - position
    const needPrevious = position < readerPagesBehind && hasPrevious.value && !loadPreviousFailure.value
    const needNext =
      !loadMoreFailure.value &&
      ((canLoadNextPage.value && ahead < readerPagesAhead) || (canLoadNextChapter.value && ahead === 0))

    if (needPrevious && (!needNext || position < ahead)) return 'previous'
    return needNext ? 'next' : undefined
  })

  watch(
    readerPreloadDirection,
    (direction) => {
      if (direction) void loadMore(direction)
    },
    { immediate: true, flush: 'post' },
  )

  useInfiniteScroll(app, () => loadMore(), {
    distance: 760,
    interval: 900,
    canLoadMore: () => !reader.value && canLoadNextPage.value && !pending.value && !loadMoreFailure.value,
  })

  useInfiniteScroll(app, () => loadMore(), {
    distance: 180,
    interval: 900,
    canLoadMore: () =>
      canLoadNextChapter.value &&
      !readerPreview.value &&
      !pending.value &&
      !loadingPrevious.value &&
      !loadMoreFailure.value,
  })

  useResizeObserver(app, observeReaderFrames)

  watch(readerFrames, async () => {
    await nextTick()
    observeReaderFrames()
  })
  onMounted(async () => {
    await nextTick()
    if (document.activeElement === document.body) app.value?.focus({ preventScroll: true })
    observeReaderFrames()
  })
  onBeforeUnmount(() => {
    readerObserver?.disconnect()
  })

  return {
    readerChrome,
    chromeVisible,
    chaptersOpen,
    readerFrames,
    readerDisplayIndex,
    readerSeekFailure,
    activeFramePosition,
    readerPagesAhead,
    readerPagesBehind,
    brokenImages,
    showBackToTop,
    backToTopTitle,
    toggleReaderChrome,
    tapReader,
    backToTop,
    markBroken,
    retryImage,
    clearReaderPreview,
    previewReaderPage,
    selectReaderChapter,
  }
}
