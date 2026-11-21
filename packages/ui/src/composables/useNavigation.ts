import { computed, nextTick, ref, shallowRef, type Ref } from 'vue'
import { useEventListener } from '@vueuse/core'
import { createPageLoader } from '@better-eh/core'
import type {
  CatalogPage,
  GalleryPage,
  ReaderPage,
  ReadingGallery,
  SiteAdapter,
  SitePage,
  TagChange,
} from '@better-eh/core'
import { useCatalogHistoryStore } from '../stores/catalog-history'
import { usePageCacheStore } from '../stores/page-cache'
import { libraryPage, type LibraryPage } from '../utils/reading-library-route'
import { firstReaderIndex, queuedReaderPage, readerFrame, readerHasNext } from '../utils/reader-frames'
import { createReaderPageResolver } from '../utils/reader-pages'

type NavigationMode =
  | 'push'
  | 'pop'
  | 'replace'
  | 'refresh'
  | 'reader-start'
  | 'gallery-start'
  | 'reader-seek'
  | 'queue-start'
  | 'queue-chapter'
type Page = SitePage | LibraryPage

interface QueuePosition {
  chapters: readonly ReadingGallery[]
  chapter: number
}

interface NavigationState {
  entryId?: string
  betterEh?: boolean
  previousUrl?: string
  previousKind?: Page['kind']
  readingQueue?: QueuePosition
}

interface ReaderSection {
  chapter: number
  url: string
  page: ReaderPage
}

function appendUnique<T>(current: T[], incoming: T[], key: (item: T) => string): T[] {
  const seen = new Set(current.map(key))
  return current.concat(
    incoming.filter((item) => {
      const itemKey = key(item)
      if (seen.has(itemKey)) return false
      seen.add(itemKey)
      return true
    }),
  )
}

export function useNavigation(
  adapter: SiteAdapter,
  initialPage: SitePage,
  initialUrl: string,
  viewport: Readonly<Ref<HTMLElement | null>>,
) {
  const currentUrl = ref(initialUrl)
  function localPage(url: string): LibraryPage | undefined {
    return libraryPage(url, adapter.home(new URL(url)))
  }

  const initialQueue = initialPage.kind === 'reader' ? navigationState()?.readingQueue : undefined
  const initialChapter = initialQueue?.chapters[initialQueue.chapter]
  const page = shallowRef<Page>(
    localPage(initialUrl) ??
      (initialPage.kind === 'reader' ? queuedReaderPage(initialPage, initialChapter) : initialPage),
  )
  const pending = ref<string>()
  const failure = shallowRef<{
    url: string
    message: string
    mode: NavigationMode
    index?: number
    queue?: QueuePosition
  }>()
  const refreshing = ref(false)
  const returningToStart = ref(false)
  const seekingReader = ref(false)
  const readerIndex = ref(initialPage.kind === 'reader' ? initialPage.index : 0)
  const savingTags = ref(false)
  const loadingMore = ref(false)
  const loadMoreFailure = shallowRef<string>()
  const loadingPrevious = ref(false)
  const loadPreviousFailure = shallowRef<string>()
  const readerEndSpace = ref(0)
  const readingQueue = shallowRef(initialQueue?.chapters)
  const readerChapter = ref(initialQueue?.chapter ?? 0)
  const tailChapter = ref(readerChapter.value)
  const tailUrl = ref(initialUrl)
  const earlierSections = shallowRef<ReaderSection[]>([])
  const readerSections = computed<ReaderSection[]>(() =>
    page.value.kind === 'reader'
      ? [...earlierSections.value, { chapter: tailChapter.value, url: tailUrl.value, page: page.value }]
      : [],
  )
  const activeReader = computed(
    () => readerSections.value.find((section) => section.chapter === readerChapter.value)?.page,
  )
  const firstSection = computed(() => readerSections.value[0])
  const previousChapter = computed(() => {
    const first = firstSection.value
    return first && firstReaderIndex(first.page) === 1 ? readingQueue.value?.[first.chapter - 1] : undefined
  })
  const nextChapter = computed(() => readingQueue.value?.[tailChapter.value + 1])
  const loader = createPageLoader(
    adapter,
    page.value.kind === 'library' ? adapter.home(new URL(initialUrl)) : initialUrl,
    initialPage,
    usePageCacheStore(),
  )
  const { firstReaderPage, readerTargetUrl, lastReaderPage } = createReaderPageResolver(
    adapter,
    loader,
    readerGalleryUrl,
  )
  const scrollPositions = new Map<string, number>()
  const catalogHistory = useCatalogHistoryStore()
  let entryId = navigationState()?.entryId ?? newHistoryId()
  if (!navigationState()?.entryId) history.replaceState({ ...navigationState(), entryId }, '')
  let active: AbortController | undefined
  let appendController: AbortController | undefined
  let readerEntrance: Animation | undefined
  const hasMore = computed(() => {
    const current = page.value
    if (current.kind === 'reader') return readerHasNext(current) || Boolean(nextChapter.value)
    return 'next' in current && Boolean(current.next)
  })
  const canLoadNextPage = computed(() => {
    const current = page.value
    return current.kind === 'reader' ? readerHasNext(current) : hasMore.value
  })
  const canLoadNextChapter = computed(
    () => Boolean(nextChapter.value) && !canLoadNextPage.value && readerChapter.value === tailChapter.value,
  )
  const hasPrevious = computed(() => {
    const first = firstSection.value
    if (!first) return false
    return Boolean(
      previousChapter.value ||
      (firstReaderIndex(first.page) > 1 && (first.page.previous || (readingQueue.value && first.page.gallery))),
    )
  })

  function navigationState(): NavigationState | null {
    return history.state
  }

  function newHistoryId(): string {
    return Array.from(crypto.getRandomValues(new Uint32Array(2))).join('-')
  }

  function showReaderFrame(chapter: number, index: number): void {
    const chapters = readingQueue.value
    if (chapter !== readerChapter.value && chapters) {
      const section = readerSections.value.find((item) => item.chapter === chapter)
      if (!section) return
      const url = section.page.frames?.find((frame) => frame.index === index)?.href ?? section.url
      history.replaceState(
        { ...navigationState(), readingQueue: { chapters, chapter } } satisfies NavigationState,
        '',
        url,
      )
      currentUrl.value = url
      readerChapter.value = chapter
      document.title = section.page.title + ' · Better EH'
    }
    readerIndex.value = index
  }

  function readerGalleryUrl(current: ReaderPage): string | undefined {
    const state = navigationState()
    return current.gallery ?? (state?.previousKind === 'gallery' ? state.previousUrl : undefined)
  }

  async function scrollToReaderFrame(chapter: number, index: number, signal: AbortSignal): Promise<boolean> {
    const scroll = viewport.value
    const frame = scroll?.querySelector<HTMLElement>(
      `.reader-frame[data-reader-chapter="${chapter}"][data-reader-index="${index}"]`,
    )
    if (!scroll || !frame) return false
    const line = Math.floor(scroll.clientHeight / 3)
    const headerHeight = scroll.querySelector<HTMLElement>('.masthead')?.offsetHeight ?? 0
    const offset = Math.min(line, Math.max(headerHeight + 8, line - frame.offsetHeight / 2))
    const top = Math.max(
      0,
      scroll.scrollTop + frame.getBoundingClientRect().top - scroll.getBoundingClientRect().top - offset,
    )
    const extra = Math.ceil(top - (scroll.scrollHeight - scroll.clientHeight))
    if (extra > 0) {
      readerEndSpace.value += extra
      await nextTick()
    }
    if (!signal.aborted) {
      scroll.scrollTo({ top, behavior: 'instant' })
      showReaderFrame(chapter, index)
    }
    return true
  }

  function cancelReaderSeek(): void {
    if (!seekingReader.value) return
    active?.abort()
    active = undefined
    seekingReader.value = false
    pending.value = undefined
  }

  async function navigate(
    url: string | undefined,
    mode: NavigationMode = 'push',
    index?: number,
    queue?: QueuePosition,
  ) {
    if (!url) return
    const reload = mode === 'refresh'
    const readerStart = mode === 'reader-start'
    const galleryStart = mode === 'gallery-start'
    const readerSeek = mode === 'reader-seek'
    const queueChapter = mode === 'queue-chapter'
    const queueStart = mode === 'queue-start'
    const fromStart = readerStart || galleryStart || queueStart || queueChapter
    const push = mode === 'push' || galleryStart || queueStart
    const current = activeReader.value
    const chapters = readingQueue.value
    const preserveQueue = (readerSeek || reload || readerStart) && chapters
    const nextQueue =
      queue ??
      (mode === 'pop'
        ? navigationState()?.readingQueue
        : preserveQueue
          ? { chapters, chapter: readerChapter.value }
          : undefined)
    if (readerSeek && (!current || !index || !Number.isSafeInteger(index) || index < 1)) return
    if ((reload || readerStart) && (pending.value || savingTags.value)) return
    active?.abort()
    appendController?.abort()
    readerEntrance?.cancel()
    loadMoreFailure.value = undefined
    loadPreviousFailure.value = undefined
    refreshing.value = reload
    returningToStart.value = readerStart
    seekingReader.value = readerSeek
    if (url === currentUrl.value && !reload && !fromStart && !readerSeek && mode !== 'pop') {
      active = undefined
      pending.value = undefined
      failure.value = undefined
      return
    }
    const request = new AbortController()
    active = request
    pending.value = url
    failure.value = undefined
    let readerExit: Animation | undefined

    try {
      let target = url
      if (queueChapter && queue && (await scrollToReaderFrame(queue.chapter, 1, request.signal))) return
      if (readerSeek && current && index) {
        if (await scrollToReaderFrame(readerChapter.value, index, request.signal)) return
        target = await readerTargetUrl(current, index, request.signal)
      }
      const local = localPage(target)
      const restored = mode === 'pop' ? catalogHistory.restore(navigationState()?.entryId, target) : undefined
      let entry: { url: string; page: Page } = local
        ? { url: target, page: local }
        : (restored ?? (await loader.load(target, request.signal, reload)))
      if (request.signal.aborted) return
      if (readerSeek && (entry.page.kind !== 'reader' || entry.page.index !== index)) {
        throw new Error(`找不到第 ${index} 页。`)
      }
      let readerSurface: Element | null | undefined
      if (fromStart) {
        entry = await firstReaderPage(entry, request.signal)
        if (request.signal.aborted) return
        if (readerStart && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          readerSurface = viewport.value?.querySelector('.reader-surface')
          readerExit = readerSurface?.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(12px)' }], {
            duration: 120,
            easing: 'ease-in',
            fill: 'forwards',
          })
          if (readerExit) {
            const animation = readerExit
            const cancelExit = () => animation.cancel()
            request.signal.addEventListener('abort', cancelExit, { once: true })
            try {
              await animation.finished
            } finally {
              request.signal.removeEventListener('abort', cancelExit)
            }
          }
        }
      }
      if (request.signal.aborted) return
      if (push && entry.url === currentUrl.value) return

      const readerQueue = entry.page.kind === 'reader' ? nextQueue : undefined
      const previousState = navigationState()
      const nextId = push ? newHistoryId() : (previousState?.entryId ?? newHistoryId())
      const state = { ...previousState, entryId: nextId, readingQueue: readerQueue } satisfies NavigationState
      const scrollTop = viewport.value?.scrollTop ?? 0
      if (!reload) {
        if (page.value.kind === 'catalog') {
          catalogHistory.save(entryId, { url: currentUrl.value, page: page.value, scrollTop })
        } else scrollPositions.set(currentUrl.value, scrollTop)
      }
      if (push) {
        history.pushState(
          {
            entryId: nextId,
            betterEh: true,
            previousUrl: currentUrl.value,
            previousKind: page.value.kind,
            readingQueue: readerQueue,
          } satisfies NavigationState,
          '',
          entry.url,
        )
      } else if (
        entry.url !== location.href ||
        state.readingQueue ||
        previousState?.readingQueue ||
        !previousState?.entryId
      ) {
        history.replaceState(state, '', entry.url)
      }
      entryId = nextId
      currentUrl.value = entry.url
      readerEndSpace.value = 0
      readingQueue.value = readerQueue?.chapters
      readerChapter.value = readerQueue?.chapter ?? 0
      tailChapter.value = readerChapter.value
      tailUrl.value = entry.url
      earlierSections.value = []
      readerIndex.value = entry.page.kind === 'reader' ? entry.page.index : 0
      page.value =
        entry.page.kind === 'reader' && readerQueue
          ? queuedReaderPage(entry.page, readerQueue.chapters[readerQueue.chapter])
          : entry.page
      document.title = entry.page.title + ' · Better EH'
      await nextTick()
      if (request.signal.aborted) return
      viewport.value?.scrollTo({
        top: restored?.scrollTop ?? (mode === 'pop' && !readerQueue ? (scrollPositions.get(entry.url) ?? 0) : 0),
        behavior: 'instant',
      })
      readerExit?.cancel()
      readerEntrance = readerSurface?.animate(
        [
          { opacity: 0, transform: 'translateY(-12px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      )
    } catch (error) {
      if (!request.signal.aborted) {
        failure.value = { url, mode, index, queue, message: error instanceof Error ? error.message : '页面加载失败。' }
      }
    } finally {
      readerExit?.cancel()
      if (active === request) {
        active = undefined
        pending.value = undefined
        refreshing.value = false
        returningToStart.value = false
        seekingReader.value = false
      }
    }
  }

  function returnToReaderStart(chapter = readerChapter.value, index = readerIndex.value): Promise<void> {
    const current = activeReader.value
    if (!current) return Promise.resolve()
    if (readingQueue.value) {
      if (index === 1) return openReaderChapter(chapter - 1)
      if (chapter !== readerChapter.value) return openReaderChapter(chapter)
      return navigate(currentUrl.value, 'reader-seek', 1)
    }
    const first = current.first ?? (current.index === 2 ? current.previous : undefined)
    return navigate(first ?? readerGalleryUrl(current) ?? currentUrl.value, 'reader-start')
  }

  function startReadingQueue(chapters: readonly ReadingGallery[]): Promise<void> {
    return navigate(chapters[0]?.href, 'queue-start', undefined, { chapters, chapter: 0 })
  }

  function openReaderChapter(chapter: number): Promise<void> {
    const chapters = readingQueue.value
    const gallery = chapters?.[chapter]
    if (!chapters || !gallery) return Promise.resolve()
    return navigate(gallery.href, 'queue-chapter', undefined, { chapters, chapter })
  }

  function retryNavigation(): void {
    const request = failure.value
    if (request) void navigate(request.url, request.mode, request.index, request.queue)
  }

  async function loadMore(direction: 'next' | 'previous' = 'next'): Promise<void> {
    if (pending.value || appendController || !currentUrl.value) return
    const prepend = direction === 'previous'
    const routePage = page.value
    const leading = prepend ? firstSection.value : undefined
    const current = leading?.page ?? routePage
    if (current.kind === 'tags' || current.kind === 'library' || (prepend && current.kind !== 'reader')) return
    const chapter = prepend
      ? previousChapter.value
      : current.kind === 'reader' && !readerHasNext(current)
        ? nextChapter.value
        : undefined
    if (
      current.kind === 'reader' &&
      (prepend ? !hasPrevious.value : !canLoadNextPage.value && !canLoadNextChapter.value)
    )
      return
    const routeUrl = leading?.url ?? tailUrl.value
    const loading = prepend ? loadingPrevious : loadingMore
    const errorMessage = prepend ? loadPreviousFailure : loadMoreFailure

    const request = new AbortController()
    appendController = request
    loading.value = true
    const scroll = viewport.value
    if (prepend && scroll) {
      const content = scroll.querySelector('main')
      if (content) {
        const gap = scroll.getBoundingClientRect().bottom - content.getBoundingClientRect().bottom
        // A short reader must already be scrollable when the earlier frame is inserted.
        if (gap >= 0) readerEndSpace.value += Math.ceil(gap) + 1
      }
    }

    try {
      const targetUrl =
        chapter?.href ??
        current[direction] ??
        (prepend && current.kind === 'reader'
          ? await readerTargetUrl(current, firstReaderIndex(current) - 1, request.signal)
          : undefined)
      if (!targetUrl) return
      const entry =
        prepend && chapter
          ? await lastReaderPage(chapter, request.signal)
          : await loader.load(targetUrl, request.signal)
      if (request.signal.aborted || page.value !== routePage) return
      if (leading && entry.page.kind !== 'reader') throw new Error('无法加载上一页。')

      const anchor = prepend ? scroll?.querySelector('.reader-frame') : undefined
      const top = anchor?.getBoundingClientRect().top ?? 0
      if (chapter) {
        if (leading && entry.page.kind === 'reader') {
          earlierSections.value = [
            { chapter: leading.chapter - 1, url: entry.url, page: queuedReaderPage(entry.page, chapter) },
            ...earlierSections.value,
          ]
        } else {
          const next = await firstReaderPage(entry, request.signal)
          if (request.signal.aborted || page.value !== routePage) return
          earlierSections.value = readerSections.value
          tailChapter.value += 1
          tailUrl.value = next.url
          page.value = queuedReaderPage(next.page, chapter)
        }
      } else if (current.kind === 'catalog' && entry.page.kind === 'catalog') {
        const nextPage: CatalogPage = {
          ...current,
          items: appendUnique(current.items, entry.page.items, (item) => item.href),
          next: entry.page.next === targetUrl ? undefined : entry.page.next,
        }
        page.value = nextPage
      } else if (current.kind === 'gallery' && entry.page.kind === 'gallery') {
        const nextPage: GalleryPage = {
          ...current,
          thumbnails: appendUnique(current.thumbnails, entry.page.thumbnails, (item) => item.href),
          next: entry.page.next === targetUrl ? undefined : entry.page.next,
        }
        page.value = nextPage
      } else if (current.kind === 'reader' && entry.page.kind === 'reader') {
        const oldFrames = current.frames ?? [readerFrame(current, routeUrl)]
        const incoming = entry.page.frames ?? [readerFrame(entry.page, entry.url)]
        const firstIndex = firstReaderIndex(current)
        const lastIndex = oldFrames.at(-1)?.index ?? current.index
        const adjacentFrames = incoming.filter((frame) =>
          prepend ? frame.index < firstIndex : frame.index > lastIndex,
        )
        if (prepend && readingQueue.value && !adjacentFrames.some((frame) => frame.index === firstIndex - 1)) {
          throw new Error(`找不到第 ${firstIndex - 1} 页。`)
        }
        const frames = prepend
          ? appendUnique(adjacentFrames, oldFrames, (item) => item.href)
          : appendUnique(oldFrames, adjacentFrames, (item) => item.href)
        const nextLink = entry.page[direction]
        const boundary = nextLink === targetUrl || frames.length === oldFrames.length ? undefined : nextLink
        const nextPage: ReaderPage = {
          ...current,
          [direction]: boundary,
          frames,
        }
        if (leading && earlierSections.value.length) {
          earlierSections.value = [{ ...leading, page: nextPage }, ...earlierSections.value.slice(1)]
        } else {
          page.value = nextPage
        }
      }
      errorMessage.value = undefined
      if (anchor && scroll) {
        await nextTick()
        if (request.signal.aborted) return
        // Read the actual displacement so native scroll anchoring is not applied twice.
        const displacement = anchor.getBoundingClientRect().top - top
        if (Math.abs(displacement) > 0.5) {
          const destination = scroll.scrollTop + displacement
          scroll.scrollTo({ top: destination, behavior: 'instant' })
        }
      }
    } catch (error) {
      if (!request.signal.aborted) {
        errorMessage.value = error instanceof Error ? error.message : '加载更多失败。'
      }
    } finally {
      if (appendController === request) {
        appendController = undefined
        loading.value = false
      }
    }
  }

  async function retryLoadMore(direction: 'next' | 'previous' = 'next'): Promise<void> {
    if (pending.value || appendController) return
    if (direction === 'next') loadMoreFailure.value = undefined
    await loadMore(direction)
  }

  async function commitTagChange(change: TagChange): Promise<void> {
    const current = page.value
    if (current.kind !== 'tags') return
    if (refreshing.value || savingTags.value) throw new Error('请等当前操作完成后再试。')
    savingTags.value = true
    try {
      const updated = await loader.submitTagChange(currentUrl.value, current, change)
      catalogHistory.clear()
      if (page.value.kind === 'tags' && page.value.activeGroup === updated.activeGroup) page.value = updated
    } finally {
      savingTags.value = false
    }
  }

  history.scrollRestoration = 'manual'
  useEventListener(window, 'popstate', () => {
    void navigate(location.href, 'pop')
  })
  return {
    currentUrl,
    page,
    pending,
    failure,
    refreshing,
    returningToStart,
    seekingReader,
    readerIndex,
    readerChapter,
    readerSections,
    activeReader,
    readingQueue,
    savingTags,
    loadingMore,
    loadMoreFailure,
    loadingPrevious,
    loadPreviousFailure,
    readerEndSpace,
    hasMore,
    canLoadNextPage,
    canLoadNextChapter,
    hasPrevious,
    navigationState,
    navigate,
    retryNavigation,
    startReadingQueue,
    openReaderChapter,
    showReaderFrame,
    cancelReaderSeek,
    returnToReaderStart,
    loadMore,
    retryLoadMore,
    commitTagChange,
  }
}
