import { createApp, shallowRef } from 'vue'
import { createPinia, disposePinia } from 'pinia'
import { BetterEhApp } from '@better-eh/ui'
import type { SiteAdapter, SitePage } from '@better-eh/core'
import styles from '@better-eh/ui/style.css?inline'
import { createBrowserReadingLibrary } from './browser-reading-library'

export function mount(
  host: HTMLElement,
  adapter: SiteAdapter,
  initialPage: SitePage,
  url: URL,
  nativeLink?: (href: string) => string,
) {
  const viewActive = shallowRef(true)
  const openingNative = shallowRef(false)
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = styles
  const root = document.createElement('div')
  shadow.append(style, root)
  const app = createApp(BetterEhApp, {
    adapter,
    initialPage,
    initialUrl: url.href,
    nativeLink,
    viewActive,
    openingNative,
    readingLibraryRepository: createBrowserReadingLibrary(window),
  })
  const pinia = createPinia()
  app.use(pinia)
  app.onUnmount(() => disposePinia(pinia))
  app.mount(root)
  return {
    setActive(active: boolean) {
      viewActive.value = active
    },
    setOpeningNative(opening: boolean) {
      openingNative.value = opening
    },
    unmount: () => app.unmount(),
  }
}
