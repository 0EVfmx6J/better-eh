import { useTimeoutFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, shallowRef, useTemplateRef, watch, type Ref } from 'vue'
import type { ReadingGallery, ReadingLibraryRemoval, SiteAdapter } from '@better-eh/core'
import type GalleryActionSheet from '../components/GalleryActionSheet.vue'
import { useReadingLibraryStore } from '../stores/reading-library'
import { readerPageFrames } from '../utils/reader-frames'
import { librarySections, type LibrarySection } from '../utils/reading-library-route'
import { bookmarkOrigin, useBookmarkFlight } from './useBookmarkFlight'
import type { useNavigation } from './useNavigation'

interface GalleryLibraryOptions {
  adapter: SiteAdapter
  navigation: ReturnType<typeof useNavigation>
  app: Readonly<Ref<HTMLElement | null>>
  desktop: Readonly<Ref<boolean>>
  reducedMotion: Readonly<Ref<boolean>>
}

export function useGalleryLibrary({ adapter, navigation, app, desktop, reducedMotion }: GalleryLibraryOptions) {
  const {
    activeReader: reader,
    currentUrl,
    readerGalleryUrl,
    page,
    readerChapter,
    readerIndex,
    readerSections,
    readingQueue,
    startReadingQueue,
  } = navigation
  const readingLibrary = useReadingLibraryStore()
  const { library, savingLibrary, bookmarksBusy, historyByGalleryHref, savedGalleryUrls } = storeToRefs(readingLibrary)
  const { changeLibrary } = readingLibrary
  const selectingGalleries = shallowRef(false)
  const cardActionSheet = shallowRef<{ gallery: ReadingGallery; trigger: HTMLElement; section?: LibrarySection }>()
  const cardActionDialog = useTemplateRef<InstanceType<typeof GalleryActionSheet>>('cardActionDialog')
  let cardActionTrigger: HTMLElement | undefined
  const removalMessages = {
    'remove-from-later': '已从稍后阅读移除',
    'remove-from-history': '已删除这条浏览历史',
    'remove-many': '已删除所选记录',
  } satisfies Record<ReadingLibraryRemoval['type'], string>
  const libraryNotice = shallowRef<{ text: string; saved?: boolean; failed?: boolean }>()
  const { start: startLibraryNotice, stop: stopLibraryNotice } = useTimeoutFn(
    () => (libraryNotice.value = undefined),
    4800,
    { immediate: false },
  )
  const bookmarkFlight = useBookmarkFlight(app, reducedMotion)
  const pendingRemoval = shallowRef<{ change: ReadingLibraryRemoval; trigger?: HTMLElement; title?: string }>()
  const removalFailed = shallowRef(false)
  const removalDialog = computed(() => {
    const request = pendingRemoval.value
    if (!request) return undefined
    if (request.change.type === 'remove-many') {
      const section = librarySections[request.change.section]
      return {
        title: `从${section}批量删除？`,
        message: `将从${section}移除所选的 ${request.change.hrefs.length} 条记录。`,
        confirmLabel: '确认删除',
      }
    }
    const section = request.change.type === 'remove-from-history' ? librarySections.history : librarySections.later
    return {
      title: `从${section}移除？`,
      message: `将从${section}移除《${request.title}》。`,
      confirmLabel: '确认删除',
    }
  })

  const readingGallery = computed<ReadingGallery | undefined>(() => {
    const current = page.value
    if (current.kind === 'gallery') {
      const { href, cover, pages, title } = current
      return { href: galleryKey(href), cover, pages, title }
    }
    if (reader.value) {
      const queued = readingQueue.value?.[readerChapter.value]
      if (queued) return { ...queued, pages: reader.value.total || queued.pages }
      const href = readerGalleryUrl(reader.value)
      if (href) return { href: galleryKey(href), title: reader.value.title, pages: reader.value.total }
    }
    return undefined
  })
  const galleryProgress = computed(() => {
    if (page.value.kind !== 'gallery' || !readingGallery.value) return undefined
    const progress = historyByGalleryHref.value.get(readingGallery.value.href)?.progress
    return progress && progress.index > 1 ? progress : undefined
  })

  const savedForLater = computed(() => savedGalleryUrls.value.has(readingGallery.value?.href ?? ''))
  const cardRemovalSection = computed<LibrarySection | undefined>(() => {
    const sheet = cardActionSheet.value
    if (!sheet) return undefined
    return sheet.section ?? (savedGalleryUrls.value.has(galleryKey(sheet.gallery.href)) ? 'later' : undefined)
  })
  const catalogLists = computed(() => {
    const current = page.value
    if (current.kind !== 'catalog') return { items: [] }
    const historyByHref = historyByGalleryHref.value
    const withProgress = (items: typeof current.items) => {
      if (!historyByHref.size) return items
      return items.map((item) => {
        const history = historyByHref.get(galleryKey(item.href))
        if (!history?.progress) return item
        return {
          ...item,
          pages: item.pages || history.gallery.pages,
          progressIndex: history.progress.index,
        }
      })
    }
    const featured = current.featured
    return {
      items: withProgress(current.items),
      featured: featured && { ...featured, items: withProgress(featured.items) },
    }
  })
  const savedCatalogHrefs = computed(() => {
    const saved = savedGalleryUrls.value
    if (!saved.size) return new Set<string>()
    const { items, featured } = catalogLists.value
    const galleries = featured ? [...featured.items, ...items] : items
    return new Set(galleries.filter((item) => saved.has(galleryKey(item.href))).map((item) => item.href))
  })

  watch(currentUrl, () => {
    selectingGalleries.value = false
    pendingRemoval.value = undefined
    cardActionSheet.value = undefined
    cardActionTrigger = undefined
    libraryNotice.value = undefined
    stopLibraryNotice()
    bookmarkFlight.cancel()
  })

  watch(
    [currentUrl, readerIndex],
    () => {
      const gallery = readingGallery.value
      if (!gallery) return
      const section = readerSections.value.find(({ chapter }) => chapter === readerChapter.value)
      const frames = section && readerPageFrames(section.page, section.url)
      const frame = frames?.find(({ index }) => index === readerIndex.value)
      const progress = frame ? { href: frame.href, index: frame.index } : undefined
      void changeLibrary({ type: 'visit', gallery, progress })
    },
    { immediate: true, flush: 'post' },
  )

  watch(desktop, (wide) => {
    if (wide) closeCardActionSheet()
  })

  function galleryKey(href: string): string {
    const url = new URL(href)
    return adapter.canonicalGalleryUrl?.(url) ?? url.href
  }

  function requestRemoval(change: ReadingLibraryRemoval, source: EventTarget | null, title?: string): void {
    if (savingLibrary.value || pendingRemoval.value) return
    const trigger = source instanceof HTMLElement ? source : undefined
    libraryNotice.value = undefined
    stopLibraryNotice()
    removalFailed.value = false
    pendingRemoval.value = { change, trigger, title }
  }

  async function closeRemoval(): Promise<void> {
    const trigger = pendingRemoval.value?.trigger
    const url = currentUrl.value
    pendingRemoval.value = undefined
    await nextTick()
    if (url !== currentUrl.value) return
    const focusTarget = trigger?.isConnected ? trigger : app.value?.querySelector<HTMLElement>('.catalog-title h1')
    focusTarget?.focus({ preventScroll: true })
  }

  async function confirmRemoval(): Promise<void> {
    const request = pendingRemoval.value
    if (!request || savingLibrary.value) return
    removalFailed.value = false
    const saved = await changeLibrary(request.change)
    if (pendingRemoval.value !== request) return
    if (!saved) {
      removalFailed.value = true
      return
    }
    const url = currentUrl.value
    if (request.change.type === 'remove-many') selectingGalleries.value = false
    await closeRemoval()
    if (currentUrl.value !== url) return
    libraryNotice.value = { text: removalMessages[request.change.type] }
    startLibraryNotice()
  }

  function openCardActionSheet(event: MouseEvent, gallery: ReadingGallery, section?: LibrarySection): void {
    if (bookmarksBusy.value || !(event.currentTarget instanceof HTMLElement)) return
    cardActionTrigger = event.currentTarget
    cardActionSheet.value = { gallery, trigger: cardActionTrigger, section }
  }

  function closeCardActionSheet(): void {
    cardActionSheet.value = undefined
  }

  function restoreCardActionFocus(): void {
    if (cardActionSheet.value) return
    if (!pendingRemoval.value) cardActionTrigger?.focus({ preventScroll: true })
    cardActionTrigger = undefined
  }

  function submitCardAction(event: MouseEvent): void {
    const selection = cardActionSheet.value
    if (!selection) return
    const section = cardRemovalSection.value
    closeCardActionSheet()
    if (section) {
      cardActionDialog.value?.closeDialog()
      const type = section === 'history' ? 'remove-from-history' : 'remove-from-later'
      const href = selection.section ? selection.gallery.href : galleryKey(selection.gallery.href)
      requestRemoval({ type, href }, selection.trigger, selection.gallery.title)
      return
    }
    const start = bookmarkOrigin(event.currentTarget)
    cardActionDialog.value?.closeDialog()
    void toggleReadLater(selection.trigger, selection.gallery, start)
  }

  async function showBookmarkResult(
    saved: boolean,
    start: ReturnType<typeof bookmarkOrigin>,
    options: { batch?: boolean; added?: boolean } = {},
  ): Promise<void> {
    const { batch, added = saved } = options
    const flewToSidebar = added && bookmarkFlight.fly(start, bookmarkFlight.sidebarDestination())
    if (flewToSidebar && !batch) return

    libraryNotice.value = saved
      ? { text: batch ? '所选画廊已在稍后阅读' : '已加入稍后阅读', saved: true }
      : { text: '保存失败，请重试', failed: true }
    const notice = libraryNotice.value
    startLibraryNotice()
    if (!added || flewToSidebar) return

    await nextTick()
    if (libraryNotice.value === notice) bookmarkFlight.flyToNotice(start)
  }

  async function toggleReadLater(
    source: EventTarget | null,
    gallery: ReadingGallery | undefined,
    start = bookmarkOrigin(source),
  ) {
    if (!gallery || bookmarksBusy.value) return
    const { title, cover, pages } = gallery
    const href = galleryKey(gallery.href)
    if (savedGalleryUrls.value.has(href)) {
      requestRemoval({ type: 'remove-from-later', href }, source, title)
      return
    }
    libraryNotice.value = undefined
    stopLibraryNotice()
    bookmarkFlight.cancel()
    const url = currentUrl.value
    const saved = await changeLibrary({ type: 'save-for-later', gallery: { href, title, cover, pages } })
    if (url === currentUrl.value) await showBookmarkResult(saved, start)
  }

  async function saveSelectedForLater(items: readonly ReadingGallery[], event: MouseEvent): Promise<void> {
    if (bookmarksBusy.value || !items.length) return
    const start = bookmarkOrigin(event.currentTarget)
    const url = currentUrl.value
    libraryNotice.value = undefined
    stopLibraryNotice()
    bookmarkFlight.cancel()
    const galleries = items.map(({ href, title, cover, pages }) => ({ href: galleryKey(href), title, cover, pages }))
    const hasNewGallery = galleries.some(({ href }) => !savedGalleryUrls.value.has(href))
    const saved = await changeLibrary({ type: 'save-many-for-later', galleries })
    if (url !== currentUrl.value) return
    if (saved) {
      selectingGalleries.value = false
      await nextTick()
      if (url !== currentUrl.value) return
      app.value?.querySelector<HTMLElement>('.catalog-title h1')?.focus({ preventScroll: true })
    }
    await showBookmarkResult(saved, start, { batch: true, added: saved && hasNewGallery })
  }

  function readAll(): void {
    const chapters = new Map<string, ReadingGallery>()
    for (const { gallery } of library.value.later) {
      const href = galleryKey(gallery.href)
      if (!chapters.has(href)) chapters.set(href, { ...gallery, href })
    }
    void startReadingQueue([...chapters.values()])
  }

  return {
    selectingGalleries,
    readingGallery,
    galleryProgress,
    savedForLater,
    catalogLists,
    savedCatalogHrefs,
    cardActionSheet,
    cardRemovalSection,
    closeCardActionSheet,
    restoreCardActionFocus,
    submitCardAction,
    openCardActionSheet,
    removalDialog,
    removalFailed,
    requestRemoval,
    closeRemoval,
    confirmRemoval,
    libraryNotice,
    stopLibraryNotice,
    startLibraryNotice,
    toggleReadLater,
    saveSelectedForLater,
    readAll,
  }
}
