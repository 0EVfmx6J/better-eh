import { useEventListener } from '@vueuse/core'
import { computed, nextTick, onMounted, onScopeDispose, ref, shallowRef, useTemplateRef, watch, type Ref } from 'vue'
import { createPageLoader, nativePageFlag } from '@better-eh/core'
import type {
  CatalogPage,
  GalleryPage,
  ReaderFrame,
  ReaderPage,
  ReadingGallery,
  SiteAdapter,
  SitePage,
  TagChange,
} from '@better-eh/core'
import type ReaderPages from '../components/ReaderPages.vue'
import { usePageCacheStore } from '../stores/page-cache'
import { usePagedHistoryStore } from '../stores/paged-history'
import { appendUnique } from '../utils/append-unique'
import { captureScrollPosition, type GalleryScrollAnchor, type GalleryScrollPosition } from '../utils/gallery-scroll'
import { firstReaderIndex, queuedReaderPage, readerFrame, readerHasNext } from '../utils/reader-frames'
import { createReaderPageResolver } from '../utils/reader-pages'
import { libraryPage, type LibraryPage } from '../utils/reading-library-route'

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

export function useNavigation(
  adapter: SiteAdapter,
  initialPage: SitePage,
  initialUrl: string,
  viewport: Readonly<Ref<HTMLElement | null>>,
  viewActive?: Readonly<Ref<boolean>>,
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
  const readerRevision = ref(0)
  const pageContent = useTemplateRef<HTMLElement>('pageContent')
  const readerPages = useTemplateRef<InstanceType<typeof ReaderPages>>('readerPages')
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
  const { firstReaderPage, readerTargetUrl, lastReaderPage, galleryThumbnails } = createReaderPageResolver(
    adapter,
    loader,
    readerGalleryUrl,
  )
  const scrollPositions = new Map<string, GalleryScrollPosition>()
  const galleryRestoration = shallowRef<GalleryScrollAnchor>()
  const pagedHistory = usePagedHistoryStore()
  let entryId = navigationState()?.entryId ?? newHistoryId()
  if (!navigationState()?.entryId) history.replaceState({ ...navigationState(), entryId }, '')
  let active: AbortController | undefined
  let appendController: AbortController | undefined
  let pageEntrance: Animation | undefined
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
    if (viewActive?.value === false) return
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

  function showPageEntrance(): void {
    pageEntrance?.cancel()
    if (viewActive?.value === false || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    pageEntrance = pageContent.value?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 230,
      easing: 'ease-in-out',
    })
  }

  async function scrollToReaderFrame(chapter: number, index: number, signal: AbortSignal): Promise<boolean> {
    if (!(await readerPages.value?.scrollToPage(chapter, index, signal))) return false
    if (!signal.aborted) {
      showReaderFrame(chapter, index)
      showPageEntrance()
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
    source?: EventTarget | null,
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

    try {
      let target = url
      if (queueChapter && queue && (await scrollToReaderFrame(queue.chapter, 1, request.signal))) return
      if (readerSeek && current && index) {
        if (await scrollToReaderFrame(readerChapter.value, index, request.signal)) return
        target = await readerTargetUrl(current, index, request.signal)
      }
      const local = localPage(target)
      const restored = mode === 'pop' ? pagedHistory.restore(navigationState()?.entryId, target) : undefined
      let entry: { url: string; page: Page } = local
        ? { url: target, page: local }
        : (restored ?? (await loader.load(target, request.signal, reload)))
      if (request.signal.aborted) return
      if (readerSeek && (entry.page.kind !== 'reader' || entry.page.index !== index)) {
        throw new Error(`找不到第 ${index} 页。`)
      }
      if (fromStart) entry = await firstReaderPage(entry, request.signal)
      if (request.signal.aborted) return
      if (push && entry.url === currentUrl.value) return

      const readerQueue = entry.page.kind === 'reader' ? nextQueue : undefined
      const previousState = navigationState()
      const nextId = push ? newHistoryId() : (previousState?.entryId ?? newHistoryId())
      const state = { ...previousState, entryId: nextId, readingQueue: readerQueue } satisfies NavigationState
      if (!reload) {
        const position = captureScrollPosition(viewport.value, source)
        if (page.value.kind === 'catalog' || page.value.kind === 'gallery') {
          pagedHistory.save(entryId, { url: currentUrl.value, page: page.value, ...position })
        } else scrollPositions.set(currentUrl.value, position)
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
      galleryRestoration.value = undefined
      currentUrl.value = entry.url
      readerRevision.value += 1
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
      const position = restored ?? (mode === 'pop' && !readerQueue ? scrollPositions.get(entry.url) : undefined)
      viewport.value?.scrollTo({ top: position?.scrollTop ?? 0, behavior: 'instant' })
      galleryRestoration.value = position?.anchor
      if (!reload) showPageEntrance()
    } catch (error) {
      if (!request.signal.aborted) {
        failure.value = { url, mode, index, queue, message: error instanceof Error ? error.message : '页面加载失败。' }
      }
    } finally {
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
    if (viewActive?.value === false || pending.value || appendController || !currentUrl.value) return
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

  async function loadReaderImage(frame: ReaderFrame, signal: AbortSignal): Promise<ReaderFrame> {
    const entry = await loader.load(frame.reloadHref ?? frame.href, signal, true)
    if (
      entry.page.kind !== 'reader' ||
      entry.page.index !== frame.index ||
      adapter.pageCacheGroup(new URL(entry.url)).key !== adapter.pageCacheGroup(new URL(frame.href)).key
    ) {
      throw new Error('原站没有返回这一页的图片。')
    }
    return entry.page.frames?.find((item) => item.index === frame.index) ?? readerFrame(entry.page, entry.url)
  }

  async function loadReaderThumbnails(chapter: number, index: number, signal: AbortSignal) {
    const section = readerSections.value.find((section) => section.chapter === chapter)
    const href = section && readerGalleryUrl(section.page)
    return href ? galleryThumbnails(new URL(href), index, signal) : []
  }

  async function commitTagChange(change: TagChange): Promise<void> {
    const current = page.value
    if (current.kind !== 'tags') return
    if (refreshing.value || savingTags.value) throw new Error('请等当前操作完成后再试。')
    savingTags.value = true
    try {
      const updated = await loader.submitTagChange(currentUrl.value, current, change)
      pagedHistory.clearCatalogs()
      if (page.value.kind === 'tags' && page.value.activeGroup === updated.activeGroup) page.value = updated
    } finally {
      savingTags.value = false
    }
  }

  const stopNavigation = () => {
    active?.abort()
    appendController?.abort()
    pageEntrance?.cancel()
  }
  onMounted(showPageEntrance)
  onScopeDispose(stopNavigation)
  if (viewActive)
    watch(viewActive, (visible) => {
      if (!visible) stopNavigation()
    })
  history.scrollRestoration = 'manual'
  useEventListener(window, 'popstate', () => {
    if (history.state?.[nativePageFlag] !== true) void navigate(location.href, 'pop')
  })
  return {
    currentUrl,
    galleryRestoration,
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
    readerRevision,
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
    loadReaderImage,
    loadReaderThumbnails,
    loadGalleryComments: loader.loadComments,
    refreshGalleryComments: loader.refreshGalleryComments,
    loadGalleryCommentTotal: adapter.galleryCommentsUrl ? loader.loadGalleryCommentTotal : undefined,
    retryLoadMore,
    commitTagChange,
  }
}
