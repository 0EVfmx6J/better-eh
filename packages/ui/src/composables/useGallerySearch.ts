import { nextTick, shallowRef, watch, type Ref } from 'vue'
import { searchTokens, type GalleryTag, type SiteAdapter } from '@better-eh/core'
import type AppHeader from '../components/AppHeader.vue'
import { useSearchHistoryStore } from '../stores/search-history'
import { useTagDirectoryStore } from '../stores/tag-directory'
import { isPrimaryClick } from '../utils/is-primary-click'
import type { useNavigation } from './useNavigation'

export function useGallerySearch(
  adapter: SiteAdapter,
  navigation: ReturnType<typeof useNavigation>,
  header: Readonly<Ref<InstanceType<typeof AppHeader> | null>>,
  compactSearch: Readonly<Ref<boolean>>,
  activate: (event: MouseEvent, url: string | undefined) => void,
) {
  const { currentUrl, page, navigate } = navigation
  const searchOpen = shallowRef(false)

  const search = shallowRef(page.value.kind === 'catalog' ? page.value.query : '')
  const tagSearch = shallowRef<{ tag: GalleryTag; trigger: HTMLElement; href: string; term: string }>()
  const tags = useTagDirectoryStore()
  const { remember } = useSearchHistoryStore()

  watch(currentUrl, () => {
    searchOpen.value = false
    tagSearch.value = undefined
    if (page.value.kind === 'catalog') search.value = page.value.query
  })

  watch(compactSearch, () => {
    searchOpen.value = false
  })

  watch(
    () => page.value.kind,
    (kind) => {
      if (kind === 'gallery' || kind === 'tags') void loadTags()
    },
    { immediate: true },
  )

  function loadTags(): Promise<void> {
    return tags.load(adapter)
  }

  function submitSearch() {
    searchOpen.value = false
    const query = search.value.trim()
    remember(query)
    void navigate(adapter.search(new URL(currentUrl.value), query))
  }

  function openTagSearch(event: MouseEvent, tag: GalleryTag): void {
    if (!isPrimaryClick(event) || !tag.href) return
    if (!tag.searchTerm || !(event.currentTarget instanceof HTMLElement)) {
      activate(event, tag.href)
      return
    }
    event.preventDefault()
    const trigger = event.currentTarget
    tagSearch.value =
      tagSearch.value?.trigger === trigger ? undefined : { tag, trigger, href: tag.href, term: tag.searchTerm }
  }

  function dismissTagSearch(restoreFocus: boolean): void {
    const trigger = tagSearch.value?.trigger
    tagSearch.value = undefined
    if (restoreFocus) trigger?.focus({ preventScroll: true })
  }

  async function addTagToSearch(): Promise<void> {
    const term = tagSearch.value?.term
    if (!term) return
    dismissTagSearch(false)
    const query = search.value.trimEnd()
    const normalizedTerm = term.toLowerCase()
    if (!searchTokens(query.toLowerCase()).some((token) => token.text === normalizedTerm)) {
      search.value = query ? query + ' ' + term : term
    }
    searchOpen.value = true
    await nextTick()
    header.value?.focusSearchAtEnd()
  }

  function runTagSearch(event: MouseEvent): void {
    if (!isPrimaryClick(event)) return
    const selection = tagSearch.value
    dismissTagSearch(true)
    if (!selection) return
    remember(selection.term)
    activate(event, selection.href)
  }

  async function toggleSearch(): Promise<void> {
    searchOpen.value = !searchOpen.value
    if (searchOpen.value) {
      await nextTick()
      header.value?.focusSearch()
    }
  }

  function closeSearch(event: KeyboardEvent): void {
    if (!searchOpen.value || event.defaultPrevented || event.isComposing) return
    searchOpen.value = false
    header.value?.focusSearchToggle()
  }

  return {
    search,
    searchOpen,
    tagSearch,
    loadTags,
    submitSearch,
    openTagSearch,
    dismissTagSearch,
    addTagToSearch,
    runTagSearch,
    toggleSearch,
    closeSearch,
  }
}
