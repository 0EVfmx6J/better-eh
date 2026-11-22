import { nextTick, shallowRef, useTemplateRef, watch, type Ref } from 'vue'
import { searchTokens, type GalleryTag, type SiteAdapter } from '@better-eh/core'
import type AppHeader from '../components/AppHeader.vue'
import { useSearchHistoryStore } from '../stores/search-history'
import { useTagDirectoryStore } from '../stores/tag-directory'
import { isPrimaryClick } from '../utils/is-primary-click'
import { flightCenter, useIconFlight } from './useIconFlight'
import type { useNavigation } from './useNavigation'

export function useGallerySearch(
  adapter: SiteAdapter,
  navigation: ReturnType<typeof useNavigation>,
  header: Readonly<Ref<InstanceType<typeof AppHeader> | null>>,
  compactSearch: Readonly<Ref<boolean>>,
  reducedMotion: Readonly<Ref<boolean>>,
  activate: (event: MouseEvent, url: string | undefined) => void,
) {
  const { currentUrl, page, navigate } = navigation
  const searchOpen = shallowRef(false)
  const tagFlight = useIconFlight(useTemplateRef('tagFlight'), reducedMotion)

  const search = shallowRef(page.value.kind === 'catalog' ? page.value.query : '')
  const tagSearch = shallowRef<{ tag: GalleryTag; trigger: HTMLElement; href: string; term: string }>()
  const tags = useTagDirectoryStore()
  const { remember } = useSearchHistoryStore()

  watch(currentUrl, () => {
    tagFlight.cancel()
    searchOpen.value = false
    tagSearch.value = undefined
    if (page.value.kind === 'catalog') search.value = page.value.query
  })

  watch(compactSearch, () => {
    tagFlight.cancel()
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

  function submitSearch(value = search.value) {
    searchOpen.value = false
    const query = value.trim()
    search.value = query
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
    const selection = tagSearch.value
    if (!selection) return
    const { term, trigger } = selection
    const query = search.value.trimEnd()
    const normalizedTerm = term.toLowerCase()
    const added = !searchTokens(query.toLowerCase()).some((token) => token.text === normalizedTerm)
    const start = added ? flightCenter(trigger) : undefined
    const compact = compactSearch.value
    dismissTagSearch(compact)
    if (added) {
      search.value = query ? query + ' ' + term : term
    }
    await nextTick()
    if (!compact) header.value?.focusSearchAtEnd()
    if (start) tagFlight.fly(start, header.value?.searchIcon())
  }

  function runTagSearch(event: MouseEvent): void {
    if (!isPrimaryClick(event)) return
    const selection = tagSearch.value
    dismissTagSearch(true)
    if (!selection) return
    remember(selection.term)
    activate(event, selection.href)
  }

  function openSearch(): void {
    searchOpen.value = true
  }

  async function closeSearch(): Promise<void> {
    if (!searchOpen.value) return
    searchOpen.value = false
    await nextTick()
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
    openSearch,
    closeSearch,
  }
}
