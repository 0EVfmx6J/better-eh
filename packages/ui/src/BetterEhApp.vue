<script setup lang="ts">
import { Bookmark, Check, Menu, Tag, X } from '@lucide/vue'
import { useMediaQuery, usePreferredReducedMotion } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, provide, shallowRef, useTemplateRef, watch, type ShallowRef } from 'vue'
import type { ReadingLibraryRepository, SiteAdapter, SiteNavigationItem, SitePage } from '@better-eh/core'
import AppHeader from './components/AppHeader.vue'
import BackToTopButton from './components/BackToTopButton.vue'
import CatalogPage from './components/CatalogPage.vue'
import ConfirmationDialog from './components/ConfirmationDialog.vue'
import GalleryActionSheet from './components/GalleryActionSheet.vue'
import GalleryDetail from './components/GalleryDetail.vue'
import InfiniteScroll from './components/InfiniteScroll.vue'
import LoadingSpinner from './components/LoadingSpinner.vue'
import MobileSearchDialog from './components/MobileSearchDialog.vue'
import PageLinks from './components/PageLinks.vue'
import ReaderPages from './components/ReaderPages.vue'
import ReaderProgress from './components/ReaderProgress.vue'
import ReadingLibraryPage from './components/ReadingLibraryPage.vue'
import SiteMenu from './components/SiteMenu.vue'
import SiteNavLinks from './components/SiteNavLinks.vue'
import TagSearchPopover from './components/TagSearchPopover.vue'
import TagsPanel from './components/TagsPanel.vue'
import { useGalleryLibrary } from './composables/useGalleryLibrary'
import { useGallerySearch } from './composables/useGallerySearch'
import { useNavigation } from './composables/useNavigation'
import { useReader } from './composables/useReader'
import { usePreferencesStore } from './stores/preferences'
import { useReadingLibraryStore } from './stores/reading-library'
import { useTagDirectoryStore } from './stores/tag-directory'
import { galleryViewportKey } from './utils/gallery-scroll'
import { isPrimaryClick } from './utils/is-primary-click'
import { librarySections, libraryUrl } from './utils/reading-library-route'

const props = defineProps<{
  adapter: SiteAdapter
  initialPage: SitePage
  initialUrl: string
  nativeLink?: (href: string) => string
  viewActive?: ShallowRef<boolean>
  openingNative?: ShallowRef<boolean>
  readingLibraryRepository: ReadingLibraryRepository
}>()
const scroll = useTemplateRef('scroll')
const app = computed(() => scroll.value?.viewport ?? null)
const header = useTemplateRef('header')
const siteMenu = useTemplateRef('siteMenu')
const menuOpen = shallowRef(false)
const navigation = useNavigation(
  props.adapter,
  props.initialPage,
  props.initialUrl,
  app,
  computed(() => scroll.value?.content ?? null),
  props.viewActive,
)
const {
  page,
  navigate,
  navigationState,
  currentUrl,
  pending,
  failure,
  refreshing,
  returningToStart,
  seekingReader,
  readerChapter,
  activeReader: reader,
  readingQueue,
  savingTags,
  loadingMore,
  loadMoreFailure,
  loadingPrevious,
  loadPreviousFailure,
  readerRevision,
  hasMore,
  reachedEnd,
  hasPrevious,
  loadMore,
  retryNavigation,
  retryLoadMore,
  commitTagChange,
} = navigation
const { theme, desktopNavigation } = storeToRefs(usePreferencesStore())
const readingLibrary = useReadingLibraryStore()
readingLibrary.initialize(props.readingLibraryRepository)
const { libraryError, loadingLibrary, savingLibrary, bookmarksBusy, historyByGalleryHref } = storeToRefs(readingLibrary)
const { readLibrary } = readingLibrary
const tags = useTagDirectoryStore()
const motion = usePreferredReducedMotion()
const reducedMotion = computed(() => motion.value === 'reduce')
const compactSearch = computed(() => !desktopNavigation.value)
const busy = computed(() => Boolean(pending.value || loadingMore.value || loadingPrevious.value))
const wideReader = computed(() => Boolean(reader.value && desktopNavigation.value))
const smallReaderHeader = useMediaQuery('(max-width: 480px)')

const {
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
} = useGalleryLibrary({
  adapter: props.adapter,
  navigation,
  app,
  desktop: desktopNavigation,
  reducedMotion,
})
const {
  search,
  searchOpen,
  tagSearch,
  tagInSearch,
  loadTags,
  submitSearch,
  openTagSearch,
  dismissTagSearch,
  toggleTagInSearch,
  runTagSearch,
  openSearch,
  closeSearch,
} = useGallerySearch(props.adapter, navigation, header, compactSearch, reducedMotion, activate)
const {
  readerChrome,
  chromeVisible,
  chaptersOpen,
  readerFrames,
  readerDisplayIndex,
  readerSeekFailure,
  activeFramePosition,
  readerPagesAhead,
  readerPagesBehind,
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
} = useReader({
  app,
  navigation,
  viewActive: props.viewActive,
  desktopNavigation,
  reducedMotion,
  focusNavigation: () => header.value?.focusNavigation(),
})
provide(galleryViewportKey, { viewport: app, restoration: navigation.galleryRestoration, returningToTop })
const refreshBlocked = computed(() => Boolean(pending.value || savingTags.value))
const pullRefreshBlocked = computed(() => refreshBlocked.value || hasPrevious.value || loadingPrevious.value)
const virtual = computed(() => page.value.kind !== 'tags')
const contentAttrs = computed(() => ({
  class: { 'shell main': true, 'reader-main': Boolean(reader.value) },
  'aria-busy': busy.value,
  tabindex: reader.value && !desktopNavigation.value ? 0 : undefined,
  'aria-label': reader.value && !desktopNavigation.value ? '阅读内容，按回车切换菜单' : undefined,
  onClick: tapReader,
  onKeydown: (event: KeyboardEvent) => {
    if (event.key === 'Enter' && event.target === event.currentTarget && reader.value && !desktopNavigation.value)
      toggleReaderChrome()
  },
}))
const activeUrl = computed(() => new URL(currentUrl.value))
const home = computed(() => props.adapter.home(activeUrl.value))
const nativeHref = computed(() =>
  page.value.kind === 'library'
    ? undefined
    : props.nativeLink?.(readerFrames.value[activeFramePosition.value]?.href ?? currentUrl.value),
)
const navigationItems = computed<SiteNavigationItem[]>(() => [
  ...(props.adapter.navigation?.(activeUrl.value) ?? []).map((item) =>
    item.native && props.nativeLink && new URL(item.href).origin === activeUrl.value.origin
      ? { ...item, href: props.nativeLink(item.href) }
      : item,
  ),
  { id: 'history', label: librarySections.history, href: libraryUrl(home.value, 'history') },
  { id: 'later', label: librarySections.later, href: libraryUrl(home.value, 'later') },
])
const galleryReadHref = computed(() => {
  const current = page.value
  if (current.kind !== 'gallery') return undefined
  const thumbnails = current.thumbnails
  return (
    props.adapter.readerPageUrl?.(new URL(current.href), 1) ??
    (galleryProgress.value ? thumbnails.find((thumb) => thumb.index === 1)?.href : thumbnails[0]?.href)
  )
})
const readerTotal = computed(() => {
  if (!reader.value) return 0
  const href = readingGallery.value?.href
  return (
    reader.value.total ||
    readingGallery.value?.pages ||
    (href && historyByGalleryHref.value.get(href)?.gallery.pages) ||
    0
  )
})
const back = computed(() => {
  const current = page.value
  if (current.kind !== 'reader' && current.kind !== 'gallery') return undefined

  const state = navigationState()
  const previous = state?.previousUrl
  if (current.kind === 'gallery') {
    return { href: previous ?? home.value, label: '返回', useHistory: Boolean(state?.betterEh) }
  }

  if (readingQueue.value) {
    return {
      href: libraryUrl(home.value, 'later'),
      label: '返回稍后阅读',
      useHistory: state?.previousKind === 'library',
    }
  }
  const gallery = reader.value?.gallery
  if (previous && state?.previousKind === 'gallery') {
    const previousGallery = new URL(previous)
    const galleryUrl = gallery && new URL(gallery)
    if (
      !galleryUrl ||
      (previousGallery.origin === galleryUrl.origin &&
        previousGallery.pathname.replace(/\/$/, '') === galleryUrl.pathname.replace(/\/$/, ''))
    ) {
      return { href: previous, label: '返回画廊', useHistory: true }
    }
  }
  return { href: gallery ?? home.value, label: gallery ? '返回画廊' : '返回首页', useHistory: false }
})

watch(
  () => page.value.kind,
  (kind) => {
    if (kind === 'reader') closeSiteMenu()
  },
  { immediate: true },
)
watch(desktopNavigation, (wide) => {
  if (wide) closeSiteMenu()
})

function refreshPage(): Promise<void> {
  if (page.value.kind === 'library') return readLibrary()
  return navigate(currentUrl.value, 'refresh')
}

function refreshFromTop(): Promise<void> {
  const first = readerFrames.value[0]
  if (!reader.value || !first) return refreshPage()
  const chapters = readingQueue.value
  return navigate(first.href, 'refresh', undefined, chapters && { chapters, chapter: first.chapter })
}

function activate(event: MouseEvent, url: string | undefined) {
  if (!url || !isPrimaryClick(event)) return
  event.preventDefault()
  void navigate(url, 'push', undefined, undefined, event.currentTarget)
}

function openCommentLink(event: MouseEvent, href: string): void {
  const url = new URL(href)
  const { kind } = props.adapter.pageCacheGroup(url)
  if (!url.hash && (kind === 'gallery' || kind === 'reader')) activate(event, href)
}

function startGalleryReading(event: MouseEvent): void {
  if (galleryReadHref.value) activate(event, galleryReadHref.value)
  else void navigate(readingGallery.value?.href, 'gallery-start')
}

function openSiteMenu(): void {
  const dialog = siteMenu.value?.dialog
  if (!dialog || dialog.open) return
  dialog.showModal()
  menuOpen.value = true
}

function closeSiteMenu(): void {
  siteMenu.value?.dialog?.close()
  menuOpen.value = false
}

function selectSection(event: MouseEvent, item: SiteNavigationItem): void {
  if (!isPrimaryClick(event)) return
  closeSiteMenu()
  if (!item.native) activate(event, item.href)
}

function goBack(event: MouseEvent) {
  const destination = back.value
  if (!destination || !isPrimaryClick(event)) return
  event.preventDefault()
  if (location.href !== currentUrl.value) return
  if (destination.useHistory) history.back()
  else void navigate(destination.href, 'replace')
}
</script>

<template>
  <InfiniteScroll
    ref="scroll"
    class="eh-app"
    :class="{ 'has-site-nav': !reader && navigationItems.length, 'is-reader': reader }"
    :content-attrs="contentAttrs"
    content-as="main"
    :virtual="virtual"
    :refresh="refreshFromTop"
    :refresh-blocked="searchOpen || pullRefreshBlocked || (page.kind === 'library' && loadingLibrary)"
    :refreshing="refreshing || (page.kind === 'library' && loadingLibrary)"
    :load-more="loadMore"
    :retry-load-more="retryLoadMore"
    :loading-blocked="Boolean(pending || loadingPrevious)"
    :loading="loadingMore"
    :has-more="hasMore"
    :error="loadMoreFailure"
    :reached-end="reachedEnd"
    :active="viewActive?.value !== false"
    :show-load-hint="page.kind !== 'reader'"
    :preload-distance="reader ? 180 : 760"
    :load-interval="900"
    :can-preload="canPreloadAtBottom"
    :preload-direction="readerPreloadDirection"
    :end-indicator-class="{ 'reader-end-reveal': Boolean(reader && chromeVisible) }"
    :data-theme="theme"
    lang="zh-CN"
    role="region"
    aria-label="Better EH"
    tabindex="0"
  >
    <template #header>
      <AppHeader
        v-show="chromeVisible"
        ref="header"
        v-model:search="search"
        :search-open="searchOpen"
        :home="home"
        :back="back"
        :has-navigation="navigationItems.length > 0"
        :menu-open="menuOpen"
        :compact-search="compactSearch"
        :complete-tags="adapter.completeTags"
        :wide-reader="wideReader"
        :small-reader-header="smallReaderHeader"
        :is-reader="Boolean(reader)"
        :reader-title="reader?.title"
        :busy="busy"
        :refresh-blocked="refreshBlocked || (page.kind === 'library' && loadingLibrary)"
        :refreshing-content="refreshing || (page.kind === 'library' && loadingLibrary)"
        :native-href="nativeHref"
        :opening-native="openingNative?.value"
        :can-bookmark="Boolean(readingGallery)"
        :saved-for-later="savedForLater"
        :bookmarks-busy="bookmarksBusy"
        @navigate="activate"
        @go-back="goBack"
        @open-site-menu="openSiteMenu"
        @open-search="openSearch()"
        @load-tags="loadTags"
        @submit-search="submitSearch"
        @refresh="refreshPage"
        @toggle-bookmark="toggleReadLater($event.currentTarget, readingGallery)"
      />

      <MobileSearchDialog
        v-if="compactSearch && searchOpen"
        :query="search"
        :complete-tags="adapter.completeTags"
        @close="closeSearch"
        @load-tags="loadTags"
        @search="submitSearch"
      />

      <aside v-if="navigationItems.length" v-show="chromeVisible" class="site-sidebar">
        <SiteNavLinks :items="navigationItems" :current-url="activeUrl" @select="selectSection" />
      </aside>

      <SiteMenu
        v-if="navigationItems.length"
        ref="siteMenu"
        :items="navigationItems"
        :current-url="activeUrl"
        @close="closeSiteMenu"
        @select="selectSection"
      />
    </template>

    <template #[virtual?'virtual':'default']="{ viewport }">
      <div v-if="failure && !readerSeekFailure" class="notice flex flex-wrap items-center gap-3" role="alert">
        <span class="grow">{{ failure.message }}</span>
        <button type="button" class="pill" @click="retryNavigation">重试</button>
        <a v-if="nativeLink" class="pill" :href="nativeLink(failure.url)">打开原站</a>
      </div>
      <p v-if="(page.kind === 'catalog' || readingGallery) && libraryError" class="notice" role="status">
        {{ libraryError }}
      </p>

      <CatalogPage
        v-if="page.kind === 'catalog'"
        v-model:selecting="selectingGalleries"
        :page="page"
        :items="catalogLists.items"
        :featured="catalogLists.featured"
        :list-key="currentUrl"
        :saved-hrefs="savedCatalogHrefs"
        :busy="bookmarksBusy"
        :desktop="desktopNavigation"
        :open-action-href="cardActionSheet?.gallery.href"
        @navigate="activate"
        @save-selected="saveSelectedForLater"
        @toggle-read-later="(event, gallery) => toggleReadLater(event.currentTarget, gallery)"
        @open-actions="openCardActionSheet"
      />
      <GalleryDetail
        v-else-if="page.kind === 'gallery'"
        :page="page"
        :gallery-progress="galleryProgress"
        :gallery-read-href="galleryReadHref"
        :saved-for-later="savedForLater"
        :bookmarks-busy="bookmarksBusy"
        :active-tag="tagSearch?.tag"
        :active="viewActive?.value !== false"
        :load-comments="navigation.loadGalleryComments"
        :refresh-comments="navigation.refreshGalleryComments"
        :load-comment-total="navigation.loadGalleryCommentTotal"
        @navigate="activate"
        @open-comment-link="openCommentLink"
        @start-reading="startGalleryReading"
        @toggle-bookmark="toggleReadLater($event.currentTarget, readingGallery)"
        @tag="openTagSearch"
      />
      <TagsPanel
        v-else-if="page.kind === 'tags'"
        :key="currentUrl"
        :page="page"
        :commit="commitTagChange"
        @navigate="activate"
      />

      <ReadingLibraryPage
        v-else-if="page.kind === 'library'"
        :key="page.section"
        v-model:selecting="selectingGalleries"
        :section="page.section"
        :starting-reading="Boolean(pending)"
        :desktop="desktopNavigation"
        :open-action-href="cardActionSheet?.gallery.href"
        @navigate="activate"
        @open-actions="openCardActionSheet"
        @remove="(change, event, title) => requestRemoval(change, event.currentTarget, title)"
        @read-all="readAll"
      />

      <ReaderPages
        v-else
        :key="readerRevision"
        ref="readerPages"
        :title="reader?.title"
        :frames="readerFrames"
        :viewport="viewport"
        :active="viewActive?.value !== false"
        :load-thumbnails="navigation.loadReaderThumbnails"
        :scroll-top="scrollY"
        :track-position="!pending"
        :returning-to-top="returningToTop"
        :pages-ahead="readerPagesAhead"
        :pages-behind="readerPagesBehind"
        :busy="busy"
        :broken-images="brokenImages"
        :image-retry-errors="imageRetryErrors"
        :retrying-images="retryingImages"
        :load-previous-failure="loadPreviousFailure"
        :native-link="nativeLink"
        @retry-previous="retryLoadMore('previous')"
        @image-error="markBroken"
        @image-load="rememberImage"
        @retry-image="retryImage"
        @load-original-image="loadOriginalImage"
        @show-page="navigation.showReaderFrame"
      />
    </template>
    <template #after-content>
      <PageLinks
        v-if="(page.kind === 'catalog' || page.kind === 'gallery') && (page.previous || page.next)"
        :previous="page.previous"
        :next="page.next"
        @navigate="activate"
      />
    </template>
    <template #after="{ pullOffset }">
      <button
        v-if="reader && desktopNavigation"
        class="icon-button reader-menu-toggle"
        type="button"
        :aria-label="readerChrome ? '隐藏阅读菜单' : '显示阅读菜单'"
        :aria-expanded="readerChrome"
        aria-controls="better-eh-masthead better-eh-reader-progress"
        @click="toggleReaderChrome"
      >
        <X v-if="readerChrome" :size="21" aria-hidden="true" />
        <Menu v-else :size="21" aria-hidden="true" />
      </button>
      <ReaderProgress
        v-if="reader"
        v-show="chromeVisible"
        v-model:chapters-open="chaptersOpen"
        :chapters="readingQueue"
        :active-chapter="readerChapter"
        :current-page="readerDisplayIndex"
        :total-pages="readerTotal"
        :pending="Boolean(pending)"
        :seeking-reader="seekingReader"
        :error="readerSeekFailure?.message"
        :open-chapter="selectReaderChapter"
        @retry="retryNavigation"
        @preview="previewReaderPage"
        @cancel-preview="clearReaderPreview"
      />
      <TagSearchPopover
        v-if="tagSearch"
        :key="tagSearch.href"
        :anchor="tagSearch.trigger"
        :label="(tagSearch.tag.key && tags.translate?.(tagSearch.tag.key)) || tagSearch.tag.label"
        :href="tagSearch.href"
        :in-search="tagInSearch"
        @toggle="toggleTagInSearch"
        @search="runTagSearch"
        @dismiss="dismissTagSearch"
      />
      <Transition name="card-action-sheet" @after-leave="restoreCardActionFocus">
        <GalleryActionSheet
          v-if="cardActionSheet"
          ref="cardActionDialog"
          :title="cardActionSheet.gallery.title"
          :busy="bookmarksBusy"
          :removal-section="cardRemovalSection"
          @close="closeCardActionSheet"
          @submit="submitCardAction"
        />
      </Transition>
      <ConfirmationDialog
        v-if="removalDialog"
        v-bind="removalDialog"
        :busy="savingLibrary"
        :error="removalFailed ? libraryError : ''"
        @confirm="confirmRemoval"
        @cancel="closeRemoval"
      />
      <span ref="tagFlight" class="icon-flight" aria-hidden="true"><Tag :size="17" /></span>
      <span ref="bookmarkFlight" class="icon-flight" aria-hidden="true">
        <Bookmark :size="17" />
      </span>
      <Transition name="bookmark-notice">
        <div v-if="libraryNotice" class="bookmark-notice" @focusin="stopLibraryNotice" @focusout="startLibraryNotice">
          <p role="status">
            <Check v-if="!libraryNotice.failed" :size="18" aria-hidden="true" />
            {{ libraryNotice.text }}
          </p>
          <a
            v-if="libraryNotice.saved"
            ref="bookmarkNoticeDestination"
            :href="libraryUrl(home, 'later')"
            @click="activate($event, libraryUrl(home, 'later'))"
          >
            去看看
          </a>
        </div>
      </Transition>
      <div
        v-if="openingNative?.value || pending"
        :class="!openingNative?.value && refreshing && pullOffset > 0 ? 'sr-only' : 'loading-note'"
        role="status"
      >
        <LoadingSpinner :size="17" aria-hidden="true" />
        {{
          openingNative?.value
            ? '正在打开原站…'
            : seekingReader
              ? '正在跳页'
              : returningToStart
                ? '正在返回第 1 页'
                : refreshing
                  ? '正在刷新'
                  : '正在加载'
        }}
      </div>
    </template>
  </InfiniteScroll>
  <!-- A tap inside the scroller may only stop momentum on iOS, without sending a click. -->
  <BackToTopButton
    :visible="showBackToTop"
    :class="{ 'is-reader': reader }"
    :data-theme="theme"
    lang="zh-CN"
    :title="backToTopTitle"
    :disabled="Boolean(pending)"
    @click="backToTop"
  />
</template>
