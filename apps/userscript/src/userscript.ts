import { nativePageFlag as nativeFlag, type SiteAdapter, type SitePage } from '@better-eh/core'
import { ehAdapter } from '@better-eh/site-eh'
import { nhAdapter } from '@better-eh/site-nh'
import { mount } from './mount'
import { createNativePull, prefersReducedMotion } from './native-pull'
import { createDocumentLock, createNativeFrame } from './native-surface'

const rootId = 'better-eh-root'
const pullId = 'better-eh-native-pull'
const frameId = 'better-eh-native-frame'
const revealFlag = 'better-eh-reveal'
const adapters = new Map([
  ['e-hentai.org', ehAdapter],
  ['exhentai.org', ehAdapter],
  ['nhentai.net', nhAdapter],
])

function nativeLink(href: string): string {
  const url = new URL(href)
  url.searchParams.set(nativeFlag, '1')
  return url.href
}

function cleanUrl(input: URL): URL {
  const url = new URL(input)
  url.searchParams.delete(nativeFlag)
  url.searchParams.delete(revealFlag)
  return url
}

function nativeMode(enabled?: boolean): boolean {
  try {
    if (enabled === true) sessionStorage.setItem(nativeFlag, '1')
    else if (enabled === false) sessionStorage.removeItem(nativeFlag)
    return sessionStorage.getItem(nativeFlag) === '1'
  } catch {
    return false
  }
}

function homeFromUploads(): string {
  return document.referrer.startsWith('https://exhentai.org/') ? 'https://exhentai.org/' : 'https://e-hentai.org/'
}

function install(): void {
  const initial = new URL(location.href)
  const adapter = adapters.get(initial.hostname)
  if (window.top !== window.self || (!adapter && initial.hostname !== 'upld.e-hentai.org')) return
  if (document.getElementById(rootId) || document.getElementById(pullId)) return

  let originalUrl = cleanUrl(initial)
  const lock = createDocumentLock(new Set([rootId, pullId, frameId]))
  const nativeFrame = createNativeFrame(frameId)
  let root: HTMLElement | undefined
  let mounted: ReturnType<typeof mount> | undefined
  let framed = false
  let busy = false
  let enhancedUrl: URL | undefined
  let openedNativeUrl: string | undefined
  let frameNotice: HTMLElement | undefined
  let enhancedState: unknown
  let enhancedTitle = ''
  let enhancedFocus: HTMLElement | undefined
  const originalTitle = document.title
  const originalScrollRestoration = history.scrollRestoration
  const pull = createNativePull(pullId, resume)

  function rememberMode(original: boolean, url?: URL): void {
    const state = { ...history.state }
    if (original) state[nativeFlag] = true
    else delete state[nativeFlag]
    nativeMode(original)
    history.replaceState(state, '', url?.href)
  }

  function focusEnhanced(): void {
    if (enhancedFocus?.getClientRects().length) enhancedFocus.focus({ preventScroll: true })
    else root?.shadowRoot?.querySelector<HTMLElement>('.eh-app')?.focus({ preventScroll: true })
  }

  function showFrameNotice(surface: HTMLElement, target: URL): void {
    const notice = document.createElement('p')
    notice.className = 'native-frame-notice'
    notice.setAttribute('role', 'status')
    const link = document.createElement('a')
    link.href = nativeLink(target.href)
    link.target = '_blank'
    link.rel = 'noopener'
    link.textContent = '在新标签页打开原站'
    notice.append('原站页面无法在这里载入。', link)
    surface.shadowRoot?.append(notice)
    frameNotice = notice
    link.focus({ preventScroll: true })
  }

  async function showEnhanced(site: SiteAdapter, page: SitePage, url: URL, animate: boolean): Promise<void> {
    const previousRoot = root
    if (!root || enhancedUrl?.href !== url.href) {
      mounted?.unmount()
      root?.remove()
      root = document.createElement('div')
      root.id = rootId
      root.style.zIndex = '2147483646'
      root.addEventListener('click', openOriginal)
      document.body.append(root)
      if (previousRoot || cleanUrl(new URL(location.href)).href !== url.href) history.replaceState({}, '', url.href)
      rememberMode(false, url)
      mounted = mount(root, site, page, url, nativeLink)
      enhancedFocus = undefined
    } else {
      history.replaceState(enhancedState, '', url.href)
      rememberMode(false)
      root.hidden = false
      document.title = enhancedTitle
      history.scrollRestoration = 'manual'
    }
    const surface = root
    mounted?.setActive(true)
    surface.inert = false
    lock.set(true, framed)
    focusEnhanced()
    await Promise.all([animateCurtain(surface, true, animate), pull.hide(animate)])
    nativeFrame.setVisible(false)
    framed = false
  }

  async function resume(): Promise<void> {
    if (busy) return
    busy = true
    try {
      const current = framed ? nativeFrame.current() : { doc: document, url: new URL(location.href) }
      if (current) {
        const url = cleanUrl(current.url)
        const resumeUrl = url.href === openedNativeUrl ? (enhancedUrl ?? url) : url
        const page = adapter?.parse(current.doc, url)
        if (adapter && page) {
          if (!framed) originalUrl = url
          await showEnhanced(adapter, page, resumeUrl, true)
          return
        }
      }

      const home = new URL(adapter?.home(originalUrl) ?? homeFromUploads())
      home.searchParams.set(revealFlag, '1')
      nativeMode(false)
      await pull.hide(true)
      location.assign(home.href)
    } finally {
      busy = false
    }
  }

  function openOriginal(event: MouseEvent): void {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return
    const link = event.composedPath().find((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement)
    if (!link?.hasAttribute('href') || (link.target && link.target !== '_self')) return
    const destination = new URL(link.href)
    if (destination.origin !== location.origin || !destination.searchParams.has(nativeFlag)) return
    event.preventDefault()
    if (!busy)
      void hideEnhanced(cleanUrl(destination)).catch(() => {
        if (root && !root.hidden) showFrameNotice(root, cleanUrl(destination))
      })
  }

  async function hideEnhanced(target: URL): Promise<void> {
    const surface = root
    const currentApp = mounted
    if (!surface || !currentApp) return
    frameNotice?.remove()
    busy = true
    const startingUrl = location.href
    try {
      const needsFrame = target.href !== originalUrl.href
      if (needsFrame) {
        currentApp.setOpeningNative(true)
        const loaded = await nativeFrame.load(target).finally(() => currentApp.setOpeningNative(false))
        if (!loaded) {
          if (location.href === startingUrl) showFrameNotice(surface, target)
          return
        }
      }
      if (location.href !== startingUrl) return
      enhancedUrl = cleanUrl(new URL(location.href))
      enhancedState = history.state
      enhancedTitle = document.title
      enhancedFocus =
        surface.shadowRoot?.activeElement instanceof HTMLElement ? surface.shadowRoot.activeElement : undefined
      framed = needsFrame
      const native = framed ? nativeFrame.current() : undefined
      const shownUrl = cleanUrl(native?.url ?? target)
      openedNativeUrl = target.href
      rememberMode(true, shownUrl)
      document.title = native?.doc.title ?? originalTitle
      surface.inert = true
      mounted?.setActive(false)
      nativeFrame.setVisible(framed)
      lock.set(false, framed)
      history.scrollRestoration = originalScrollRestoration
      await Promise.all([animateCurtain(surface, false, true), pull.show(true)])
      surface.hidden = true
      pull.focus()
    } finally {
      busy = false
    }
  }

  const reveal = initial.searchParams.has(revealFlag)
  const original =
    !reveal &&
    (initial.searchParams.has(nativeFlag) ||
      history.state?.[nativeFlag] === true ||
      (!history.state?.entryId && nativeMode()))
  const page = original ? undefined : adapter?.parse(document, originalUrl)
  if (adapter && page) {
    void showEnhanced(adapter, page, originalUrl, reveal)
  } else {
    rememberMode(original, originalUrl)
    void pull.show(false)
  }

  window.addEventListener(
    'popstate',
    () => {
      const native = history.state?.[nativeFlag] === true
      nativeMode(native)
      if (native && root && !root.hidden) {
        enhancedUrl = undefined
        mounted?.setActive(false)
        root.hidden = true
        root.inert = true
        const target = cleanUrl(new URL(location.href))
        framed = target.href !== originalUrl.href && nativeFrame.current()?.url.href === target.href
        nativeFrame.setVisible(framed)
        lock.set(false, framed)
        history.scrollRestoration = originalScrollRestoration
        void pull.show(false)
      } else if (!native && root?.hidden) {
        enhancedUrl = undefined
        mounted?.setActive(true)
        root.hidden = false
        root.inert = false
        lock.set(true)
        nativeFrame.setVisible(false)
        framed = false
        history.scrollRestoration = 'manual'
        void pull.hide(false)
      }
    },
    { capture: true },
  )
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) nativeMode(history.state?.[nativeFlag] === true)
  })
}

async function animateCurtain(surface: HTMLElement, reveal: boolean, animate: boolean): Promise<void> {
  if (!animate || prefersReducedMotion()) return
  const closed = 'inset(0 0 100% 0)'
  const open = 'inset(0 0 0 0)'
  const motion = surface.animate(
    { clipPath: reveal ? [closed, open] : [open, closed] },
    {
      duration: reveal ? 360 : 300,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'forwards',
    },
  )
  await motion.finished.catch(() => undefined)
  if (!reveal) surface.hidden = true
  motion.cancel()
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true })
else install()
