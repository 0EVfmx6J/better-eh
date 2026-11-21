<script setup lang="ts">
import { ArrowDown, ArrowLeft, ExternalLink, LibraryBig, Menu, Moon, RefreshCw, Search, Sun } from '@lucide/vue'
import { onClickOutside } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { useTemplateRef } from 'vue'
import type { CompleteTags } from '@better-eh/core'
import { usePreferencesStore } from '../stores/preferences'
import BookmarkButton from './BookmarkButton.vue'
import LoadingSpinner from './LoadingSpinner.vue'
import TagSearchBox from './TagSearchBox.vue'

defineProps<{
  home: string
  back?: { href: string; label: string }
  hasNavigation: boolean
  menuOpen: boolean
  compactSearch: boolean
  completeTags?: CompleteTags
  wideReader: boolean
  smallReaderHeader: boolean
  isReader: boolean
  readerTitle?: string
  busy: boolean
  refreshBlocked: boolean
  refreshingContent: boolean
  refreshing: boolean
  pullOffset: number
  pullReady: boolean
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
  toggleSearch: []
  closeSearch: [event: KeyboardEvent]
  loadTags: []
  submitSearch: []
  refresh: []
  toggleBookmark: [event: MouseEvent]
}>()
const preferences = usePreferencesStore()
const { theme, readerFit } = storeToRefs(preferences)
const search = defineModel<string>('search', { required: true })
const searchOpen = defineModel<boolean>('searchOpen', { required: true })
const masthead = useTemplateRef('masthead')
const searchBox = useTemplateRef('searchBox')
const searchToggle = useTemplateRef('searchToggle')
const brand = useTemplateRef('brand')
const readerActionsTarget = useTemplateRef('readerActionsTarget')
const readerToolsTarget = useTemplateRef('readerToolsTarget')
onClickOutside(
  () => {
    const form: unknown = searchBox.value?.$el
    return form instanceof HTMLFormElement ? form : null
  },
  () => (searchOpen.value = false),
  {
    ignore: () => {
      const root = masthead.value?.getRootNode()
      return [searchToggle, root instanceof ShadowRoot ? root.getElementById('gallery-tag-search') : null]
    },
    capture: false,
  },
)
defineExpose({
  masthead,
  focusSearch: () => searchBox.value?.focus(),
  focusSearchAtEnd: () => searchBox.value?.focusAtEnd(),
  focusSearchToggle: () => searchToggle.value?.focus({ preventScroll: true }),
  focusNavigation: () => (searchToggle.value ?? brand.value)?.focus({ preventScroll: true }),
})
</script>

<template>
  <header id="better-eh-masthead" ref="masthead" class="masthead" @keydown.esc="emit('closeSearch', $event)">
    <div
      class="shell header-inner"
      :class="{
        'header-with-back': back,
        'header-compact-search': compactSearch,
        'reader-header': wideReader,
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
          v-if="compactSearch"
          ref="searchToggle"
          class="icon-button"
          type="button"
          aria-label="搜索画廊或标签"
          title="搜索画廊或标签"
          aria-controls="header-search"
          :aria-expanded="searchOpen"
          @click="emit('toggleSearch')"
        >
          <Search :size="20" aria-hidden="true" />
        </button>
        <p v-if="isReader" class="reader-header-title" :title="readerTitle">{{ readerTitle }}</p>
      </div>
      <TagSearchBox
        v-show="!compactSearch || searchOpen"
        id="header-search"
        ref="searchBox"
        v-model="search"
        :complete-tags="completeTags"
        @load="emit('loadTags')"
        @submit="emit('submitSearch')"
      />
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
    <div v-if="pullOffset > 0" class="pull-refresh-reveal" :style="{ height: pullOffset + 'px' }" aria-hidden="true">
      <span class="pull-refresh-chip">
        <LoadingSpinner v-if="refreshing" :size="16" />
        <ArrowDown v-else :size="16" :class="{ 'pull-refresh-ready': pullReady }" />
        {{ refreshing ? '正在刷新' : pullReady ? '松手刷新' : '下拉刷新' }}
      </span>
    </div>
  </header>
</template>
