import { readText as text, type ReaderFrame, type ReaderPage, type SiteDocument } from '@better-eh/core'
import { image, link, numeric } from './dom'
import { readerPath } from './urls'

function readerReloadHref(doc: SiteDocument, base: URL): string | undefined {
  const control = doc.querySelector('#loadfail')
  const handler = control?.getAttribute('onclick') ?? ''
  const key = /^\s*(?:return\s+)?nl\(\s*(['"])([\w-]+)\1\s*\)\s*;?\s*$/.exec(handler)?.[2]
  if (!key || key === base.searchParams.get('nl')) return undefined
  const url = new URL(base)
  url.searchParams.set('nl', key)
  url.hash = ''
  return url.href
}

function readerOriginalHref(doc: SiteDocument, base: URL): string | undefined {
  const route = readerPath.exec(base.pathname)
  if (!route) return undefined

  const [, galleryId, index] = route
  for (const anchor of doc.querySelectorAll('#i6 a[href]')) {
    const href = link(anchor, base)
    if (!href) continue
    const url = new URL(href)
    const originalPath = /^\/fullimg\/(\d+)\/(\d+)(?:\/|$)/.exec(url.pathname)
    if (originalPath?.[1] === galleryId && originalPath?.[2] === index) return href
    if (
      url.pathname === '/fullimg.php' &&
      url.searchParams.get('gid') === galleryId &&
      url.searchParams.get('page') === index
    )
      return href
  }
}

export function parseReader(doc: SiteDocument, base: URL): ReaderPage | undefined {
  const element = doc.querySelector<HTMLImageElement>('img#img')
  if (!element) return undefined
  const src = image(element, base)
  if (!src) return undefined
  const counters = Array.from(doc.querySelectorAll('#i2 .sn span'), (span) => numeric(text(span)))
  const frame: ReaderFrame = {
    href: base.href,
    image: src,
    reloadHref: readerReloadHref(doc, base),
    originalHref: readerOriginalHref(doc, base),
    width: numeric(element.style.width || element.getAttribute('width') || ''),
    height: numeric(element.style.height || element.getAttribute('height') || ''),
    index: numeric(base.pathname.split('-').at(-1) ?? '') || counters[0] || 1,
  }
  const galleryLink = link(doc.querySelector('#i5 a[href*="/g/"], #i7 a[href*="/g/"], .sb a[href*="/g/"]'), base)
  const gallery = galleryLink ? new URL(galleryLink) : undefined
  gallery?.searchParams.delete('p')
  const firstPagePath = base.pathname
    .replace(/-\d+\/?$/, '-1')
    .split('/')
    .at(-1)
  const first = Array.from(doc.querySelectorAll('#first, #i2 .sn a[href], #i5 .sn a[href]'), (anchor) =>
    link(anchor, base),
  ).find((href) => {
    if (!href) return false
    const pathname = new URL(href).pathname.replace(/\/$/, '')
    return pathname.startsWith('/s/') && pathname.endsWith('/' + firstPagePath)
  })
  return {
    kind: 'reader',
    title: text(doc.querySelector('h1')) || '阅读器',
    image: src,
    width: frame.width,
    height: frame.height,
    index: frame.index,
    total: counters[1] || 0,
    gallery: gallery?.href,
    first,
    previous: link(doc.querySelector('#prev'), base),
    next: link(doc.querySelector('#next'), base),
    frames: [frame],
  }
}
