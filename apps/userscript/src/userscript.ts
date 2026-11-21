import { ehAdapter } from '@better-eh/site-eh'
import { nhentaiAdapter } from '@better-eh/site-nhentai'
import { mount } from './mount'

const rootId = 'better-eh-root'
const nativeFlag = 'better-eh-native'
const adapters = new Map([
  ['e-hentai.org', ehAdapter],
  ['exhentai.org', ehAdapter],
  ['nhentai.net', nhentaiAdapter],
])

function nativeLink(href: string) {
  const url = new URL(href)
  url.searchParams.set(nativeFlag, '1')
  return url.href
}

function install() {
  const url = new URL(location.href)
  if (window.top !== window.self || url.searchParams.has(nativeFlag) || document.getElementById(rootId)) return
  const adapter = adapters.get(url.hostname)
  if (!adapter) return
  const page = adapter.parse(document, url)
  if (!page) return

  const host = document.createElement('div')
  host.id = rootId
  mount(host, adapter, page, url, nativeLink)
  document.body.replaceChildren(host)
  document.documentElement.style.setProperty('overscroll-behavior-y', 'none', 'important')
  for (const element of [document.documentElement, document.body]) {
    element.style.setProperty('overflow', 'hidden', 'important')
    element.style.setProperty('margin', '0', 'important')
    element.style.setProperty('padding', '0', 'important')
    element.style.setProperty('width', 'auto', 'important')
    element.style.setProperty('min-width', '0', 'important')
    element.style.setProperty('max-width', 'none', 'important')
  }

  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]') ?? document.createElement('meta')
  viewport.name = 'viewport'
  viewport.content = 'width=device-width, initial-scale=1, viewport-fit=cover'
  if (!viewport.isConnected) document.head.append(viewport)
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true })
else install()
