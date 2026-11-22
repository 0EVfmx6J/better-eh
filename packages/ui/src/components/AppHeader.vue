<script setup lang="ts">
import { ArrowLeft, ExternalLink, LibraryBig, Menu, Moon, RefreshCw, Search, Sun } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { useTemplateRef } from 'vue'
import { usePreferencesStore } from '../stores/preferences'
import BookmarkButton from './BookmarkButton.vue'
import LoadingSpinner from './LoadingSpinner.vue'

defineProps<{
  home: string
  back?: { href: string; label: string }
  hasNavigation: boolean
  menuOpen: boolean
  compactSearch: boolean
  searchOpen: boolean
  search: string
  wideReader: boolean
  smallReaderHeader: boolean
  isReader: boolean
  readerTitle?: string
  busy: boolean
  refreshBlocked: boolean
  refreshingContent: boolean
  nativeHref?: string
  openingNative?: boolean
  canBookmark: boolean
  savedForLater: boolean
  bookmarksBusy: boolean
}>()
const emit = defineEmits<{
  navigate: [event: MouseEvent, href: string]
  goBack: [event: MouseEvent]
  openSiteMenu: []
  openSearch: []
  refresh: []
  toggleBookmark: [event: MouseEvent]
}>()
const preferences = usePreferencesStore()
const { theme, readerFit } = storeToRefs(preferences)
const searchToggle = useTemplateRef('searchToggle')
const brand = useTemplateRef('brand')
const readerActionsTarget = useTemplateRef('readerActionsTarget')
const readerToolsTarget = useTemplateRef('readerToolsTarget')
defineExpose({
  searchIcon: () => searchToggle.value?.querySelector('svg') ?? undefined,
  focusSearchToggle: () => searchToggle.value?.focus({ preventScroll: true }),
  focusNavigation: () => (searchToggle.value ?? brand.value)?.focus({ preventScroll: true }),
})
</script>

<template>
  <header id="better-eh-masthead" class="masthead">
    <div
      class="shell header-inner"
      :inert="!compactSearch && searchOpen"
      :class="{
        'header-with-back': back,
        'header-compact-search': compactSearch,
        'reader-header': wideReader,
        invisible: !compactSearch && searchOpen,
      }"
    >
      <div class="header-brand">
        <button
          v-if="hasNavigation"
          class="icon-button site-nav-toggle"
          type="button"
          aria-label="打开站点导航"
          aria-haspopup="dialog"
          aria-controls="better-eh-site-menu"
          :aria-expanded="menuOpen"
          @click="emit('openSiteMenu')"
        >
          <Menu :size="21" aria-hidden="true" />
        </button>
        <a ref="brand" class="brand" :href="home" aria-label="Better EH 首页" @click="emit('navigate', $event, home)">
          <span class="brand-symbol"><LibraryBig :size="19" /></span>
          <strong v-if="!isReader">Better EH</strong>
        </a>
        <a
          v-if="back"
          class="icon-button header-back"
          :href="back.href"
          :aria-label="back.label"
          :title="back.label"
          @click="emit('goBack', $event)"
        >
          <ArrowLeft :size="21" aria-hidden="true" />
        </a>
        <button
          v-if="compactSearch && (isReader || back)"
          ref="searchToggle"
          class="icon-button"
          type="button"
          aria-label="搜索画廊或标签"
          title="搜索画廊或标签"
          aria-haspopup="dialog"
          :aria-controls="searchOpen ? 'better-eh-gallery-search' : undefined"
          :aria-expanded="searchOpen"
          @click="emit('openSearch')"
        >
          <Search :size="20" aria-hidden="true" />
        </button>
        <p v-if="isReader" class="reader-header-title" :title="readerTitle">{{ readerTitle }}</p>
      </div>
      <button
        v-if="!compactSearch || (!isReader && !back)"
        ref="searchToggle"
        class="search-form flex min-h-11 w-full items-center gap-2.5 rounded-xl text-left"
        type="button"
        aria-label="搜索画廊或标签"
        aria-haspopup="dialog"
        :aria-controls="searchOpen ? 'better-eh-gallery-search' : undefined"
        :aria-expanded="searchOpen"
        @click="emit('openSearch')"
      >
        <Search :size="18" class="shrink-0 text-muted" aria-hidden="true" />
        <span class="truncate" :class="{ 'text-muted': !search }">{{ search || '搜索画廊或标签' }}</span>
      </button>
      <div class="header-actions flex items-center gap-2">
        <div v-if="isReader" v-show="wideReader" ref="readerActionsTarget" class="reader-header-actions"></div>
        <Teleport :to="readerToolsTarget" :disabled="!isReader || !smallReaderHeader || !readerToolsTarget">
          <div class="header-tools flex items-center">
            <button
              class="icon-button"
              type="button"
              aria-label="刷新页面"
              title="刷新页面"
              :disabled="refreshBlocked"
              @click="emit('refresh')"
            >
              <LoadingSpinner v-if="refreshingContent" :size="18" aria-hidden="true" />
              <RefreshCw v-else :size="18" aria-hidden="true" />
            </button>
            <button
              class="icon-button theme-button"
              type="button"
              :aria-label="theme === 'dark' ? '切换白色主题' : '切换黑色主题'"
              @click="preferences.toggleTheme"
            >
              <Moon v-if="theme !== 'dark'" :size="19" />
              <Sun v-else :size="19" />
            </button>
            <a
              v-if="nativeHref"
              class="icon-button native-button"
              :href="nativeHref"
              :aria-disabled="openingNative || undefined"
              aria-label="打开原站"
              title="打开原站"
            >
              <LoadingSpinner v-if="openingNative" :size="18" aria-hidden="true" />
              <ExternalLink v-else :size="18" aria-hidden="true" />
            </a>
          </div>
        </Teleport>
      </div>
    </div>
    <slot />
    <div v-if="isReader" v-show="!wideReader" class="shell reader-controls">
      <div v-show="smallReaderHeader" ref="readerToolsTarget" class="reader-controls-tools"></div>
      <Teleport :to="readerActionsTarget" :disabled="!wideReader || !readerActionsTarget">
        <div class="reading-actions">
          <BookmarkButton
            v-if="canBookmark"
            compact
            :saved="savedForLater"
            :busy="bookmarksBusy"
            @toggle="emit('toggleBookmark', $event)"
          />
          <button class="pill library-action" type="button" @click="preferences.toggleReaderFit">
            {{ readerFit === 'screen' ? '适应宽度' : '适应屏幕' }}
          </button>
        </div>
      </Teleport>
    </div>
    <div v-if="busy" class="progress-bar" role="progressbar" aria-label="正在加载页面" />
  </header>
</template>
