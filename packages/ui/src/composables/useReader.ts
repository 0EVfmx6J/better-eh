import { useScroll, useTimeoutFn } from '@vueuse/core'
import { computed, nextTick, onMounted, shallowRef, watch, type Ref } from 'vue'
import { isPrimaryClick } from '../utils/is-primary-click'
import { readerPageFrames } from '../utils/reader-frames'
import { stopScrollMomentum } from '../utils/stop-scroll-momentum'
import type { useNavigation } from './useNavigation'
import { useReaderImages } from './useReaderImages'

interface ReaderOptions {
  app: Readonly<Ref<HTMLElement | null>>
  navigation: ReturnType<typeof useNavigation>
  desktopNavigation: Readonly<Ref<boolean>>
  reducedMotion: Readonly<Ref<boolean>>
  viewActive?: Readonly<Ref<boolean>>
  focusNavigation: () => void
}

export function useReader({
  app,
  navigation,
  desktopNavigation,
  reducedMotion,
  viewActive,
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
    returnToReaderStart,
    loadingMore,
    loadingPrevious,
    loadMoreFailure,
    loadPreviousFailure,
    hasPrevious,
    hasMore,
    canLoadNextPage,
    canLoadNextChapter,
  } = navigation
  const returningToTop = shallowRef(false)
  const { start: scheduleReturnToTopEnd } = useTimeoutFn(() => (returningToTop.value = false), 200, {
    immediate: false,
  })
  const { y: scrollY, isScrolling } = useScroll(app, {
    onScroll: () => {
      if (returningToTop.value) scheduleReturnToTopEnd()
    },
  })
  let stoppingScroll = false

  const readerChrome = shallowRef(false)
  const chaptersOpen = shallowRef(false)
  const readerProgressDragging = shallowRef(false)
  watch(
    readerProgressDragging,
    (dragging) => {
      if (dragging) navigation.cancelLoadMore()
    },
    { flush: 'sync' },
  )
  const chromeVisible = computed(() => !reader.value || readerChrome.value)
  const readerPreview = shallowRef<number>()
  let readerSeekVersion = 0
  const { start: scheduleReaderSeek, stop: stopReaderSeek } = useTimeoutFn(commitReaderSeek, 350, { immediate: false })
  const readerPagesAhead = 5
  const readerPagesBehind = 3
  const frames = computed(() =>
    readerSections.value.flatMap(({ chapter, url, page }) =>
      readerPageFrames(page, url).map((frame) => ({ ...frame, chapter })),
    ),
  )
  const {
    readerFrames,
    brokenImages,
    imageRetryErrors,
    retryingImages,
    markBroken,
    rememberImage,
    retryImage,
    loadOriginalImage,
  } = useReaderImages(frames, navigation.readerRevision, navigation.loadReaderImage, viewActive)
  const activeFramePosition = computed(() =>
    readerFrames.value.findIndex((frame) => frame.chapter === readerChapter.value && frame.index === readerIndex.value),
  )
  const scrollDirection = shallowRef<'next' | 'previous'>()
  watch(navigation.readerRevision, () => (scrollDirection.value = undefined), { flush: 'post' })
  watch([readerChapter, readerIndex], ([chapter, index], [previousChapter, previousIndex]) => {
    if (chapter !== previousChapter) scrollDirection.value = chapter < previousChapter ? 'previous' : 'next'
    else if (index !== previousIndex) scrollDirection.value = index < previousIndex ? 'previous' : 'next'
  })
  const readerBuffer = computed(() => {
    const first = readerFrames.value[0]
    const last = readerFrames.value.at(-1)
    const chapters = readingQueue.value
    const head: string[] = []
    const tail: string[] = []
    if (first && hasPrevious.value && !loadPreviousFailure.value) {
      const chapter = first.index > 1 ? first.chapter : first.chapter - 1
      const index = first.index > 1 ? first.index - 1 : chapters?.[chapter]?.pages || 0
      head.push(`${chapter}:${index}`)
      if (index > 1) head.unshift(`${chapter}:${index - 1}`)
    }
    if (last && hasMore.value && !loadMoreFailure.value) {
      if (canLoadNextPage.value) {
        const total = readerSections.value.at(-1)?.page.total
        tail.push(`${last.chapter}:${last.index + 1}`)
        if (!total || last.index + 2 <= total) tail.push(`${last.chapter}:${last.index + 2}`)
      } else tail.push(`${last.chapter + 1}:1`)
    }
    return { head, tail }
  })
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
    returningToTop.value = false
    if (!seekingReader.value) clearReaderPreview()
  })
  watch(readingQueue, () => {
    chaptersOpen.value = false
  })
  watch(
    () => page.value.kind,
    (kind) => {
      if (kind !== 'reader') {
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
    readerChrome.value = !readerChrome.value
    if (!readerChrome.value) chaptersOpen.value = false
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
      await stopScrollMomentum(viewport)
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
    if (!reducedMotion.value) {
      returningToTop.value = true
      scheduleReturnToTopEnd()
    }
    viewport.scrollTo({ top: 0, behavior: reducedMotion.value ? 'instant' : 'smooth' })
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

    if (needPrevious && needNext && scrollDirection.value) return scrollDirection.value
    if (needPrevious && (!needNext || position < ahead)) return 'previous'
    return needNext ? 'next' : undefined
  })

  const canPreloadAtBottom = computed(
    () => !reader.value || (canLoadNextChapter.value && !readerPreview.value && !loadingPrevious.value),
  )

  onMounted(async () => {
    await nextTick()
    if (document.activeElement === document.body) app.value?.focus({ preventScroll: true })
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
    readerBuffer,
    readerProgressDragging,
    readerPreloadDirection,
    canPreloadAtBottom,
    scrollY,
    brokenImages,
    imageRetryErrors,
    retryingImages,
    showBackToTop,
    returningToTop,
    backToTopTitle,
    toggleReaderChrome,
    tapReader,
    backToTop,
    markBroken,
    rememberImage,
    retryImage,
    loadOriginalImage,
    clearReaderPreview,
    previewReaderPage,
    selectReaderChapter,
  }
}
