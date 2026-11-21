import type {
  CatalogPage,
  Category,
  GalleryPage,
  GallerySummary,
  PageLinks,
  ReaderFrame,
  ReaderPage,
  SiteAdapter,
  Thumbnail,
} from '@better-eh/core'
import { parseComments } from './comments'
import { catalogPaginationParams, ehNavigation, ehPageCacheGroup, isNativePage } from './navigation'
import { exactTagTerm, loadTagDirectory } from './tag-directory'
import { parseTags } from './tags'

type SiteDocument = Document | DocumentFragment

const text = (element: Element | null | undefined) => element?.textContent?.trim().replace(/\s+/g, ' ') ?? ''
const numeric = (value: string) => Number(value.match(/\d[\d,]*/)?.[0].replace(/,/g, '')) || 0
const background = (style: CSSStyleDeclaration | undefined) =>
  style?.backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1]

function absolute(value: string | null | undefined, base: URL): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value, base)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
  } catch {
    return undefined
  }
}

function link(element: Element | null | undefined, base: URL): string | undefined {
  const href = element?.getAttribute('href')
  if (!href || href.startsWith('#')) return undefined
  const url = absolute(href, base)
  return url && new URL(url).origin === base.origin && url !== base.href ? url : undefined
}

function image(element: Element, base: URL): string | undefined {
  const img = element.matches('img') ? element : element.querySelector('img[data-src], img')
  return absolute(img?.getAttribute('data-src') || img?.getAttribute('src'), base)
}

function thumbnail(anchor: HTMLAnchorElement, base: URL): Thumbnail | undefined {
  const href = link(anchor, base)
  if (!href) return undefined
  const index = numeric(new URL(href).pathname.split('-').at(-1) ?? '')
  const tile = anchor.querySelector<HTMLElement>('[style*="background"]')
  const sprite = absolute(background(tile?.style), base)
  const width = numeric(tile?.style.width ?? '')
  const height = numeric(tile?.style.height ?? '')
  if (!sprite || !width || !height) return { href, index, image: image(anchor, base) }
  const [x = '0', y = '0'] = (tile?.style.backgroundPosition || '0 0').split(' ')
  return {
    href,
    index,
    image: sprite,
    sprite: { width, height, x: Number.parseFloat(x) || 0, y: Number.parseFloat(y) || 0 },
  }
}

function gallerySummary(row: Element, anchor: HTMLAnchorElement, base: URL): GallerySummary | undefined {
  const href = link(anchor, base)
  const title = text(anchor.querySelector('.glink') ?? anchor)
  if (!href || !title) return undefined
  const coverArea = row.querySelector('.glthumb, .gl1e, .gl1t, .gl2c, .gl2m')
  const posted = text(row.querySelector('[id^="posted_"], [id^="postedpop_"]'))
  const count = Array.from(row.querySelectorAll('div,span')).find((element) => /^\d[\d,]* pages?$/i.test(text(element)))
  return {
    href,
    title,
    posted,
    cover: coverArea ? image(coverArea, base) : image(row, base),
    category: text(row.querySelector('.cn, .cs')),
    pages: numeric(text(count)),
  }
}

function categories(doc: SiteDocument, base: URL): Category[] {
  const mask = numeric(base.searchParams.get('f_cats') ?? '')
  return Array.from(doc.querySelectorAll('[id^="cat_"]')).flatMap((element) => {
    const bit = numeric(element.id)
    const label = text(element)
    if (!bit || !label) return []
    const target = new URL(base)
    for (const key of catalogPaginationParams) target.searchParams.delete(key)
    const filter = (mask ? mask : 1023 ^ bit) ^ (mask ? bit : 0)
    if (filter && filter !== 1023) target.searchParams.set('f_cats', String(filter))
    else target.searchParams.delete('f_cats')
    return [{ href: target.href, label, selected: Boolean(mask && !(mask & bit)) }]
  })
}

function parseCatalog(doc: SiteDocument, base: URL): CatalogPage | undefined {
  if (!doc.querySelector('.itg, #f_search, .searchnav, .ip')) return undefined
  const entries = new Map<string, GallerySummary>()
  for (const anchor of doc.querySelectorAll<HTMLAnchorElement>('.itg a[href*="/g/"]')) {
    if (!anchor.querySelector('.glink') && !anchor.matches('.glink')) continue
    const row = anchor.closest('tr, .gl1t, .gl1e, .gl1m') ?? anchor.parentElement
    if (!row) continue
    const gallery = gallerySummary(row, anchor, base)
    if (gallery) entries.set(gallery.href, gallery)
  }
  const query = base.searchParams.get('f_search') ?? ''
  const section = ehNavigation(base).find((item) => item.id !== 'home' && new URL(item.href).pathname === base.pathname)
  return {
    kind: 'catalog',
    title: base.pathname === '/favorites.php' ? '收藏夹' : query ? '搜索结果' : (section?.label ?? '画廊索引'),
    query,
    items: [...entries.values()],
    categories: categories(doc, base),
    previous: link(doc.querySelector('#uprev, #dprev'), base),
    next: link(doc.querySelector('#unext, #dnext'), base),
  }
}

function thumbnailLinks(doc: SiteDocument, base: URL): PageLinks {
  const current = doc.querySelector('.ptt .ptds, .ptb .ptds')
  return {
    previous: link(current?.previousElementSibling?.querySelector('a'), base),
    next: link(current?.nextElementSibling?.querySelector('a'), base),
  }
}

function parseGallery(doc: SiteDocument, base: URL): GalleryPage | undefined {
  const title = text(doc.querySelector('#gn')) || text(doc.querySelector('#gj'))
  if (!title) return undefined
  const info = new Map(
    Array.from(doc.querySelectorAll('#gdd tr'), (row) => [
      text(row.querySelector('.gdt1')).replace(/:$/, ''),
      text(row.querySelector('.gdt2')),
    ]),
  )
  const cover = doc.querySelector<HTMLElement>('#gd1 [style*="background"]')
  const coverUrl = absolute(background(cover?.style), base) ?? (cover && image(cover, base)) ?? undefined
  return {
    kind: 'gallery',
    href: base.href,
    title,
    cover: coverUrl,
    subtitle: text(doc.querySelector('#gj')),
    category: text(doc.querySelector('#gdc .cs, #gdc .cn, #gdc')),
    pages: numeric(info.get('Length') ?? ''),
    posted: info.get('Posted') ?? '',
    uploader: text(doc.querySelector('#gdn a')),
    language: info.get('Language') ?? '',
    rating: text(doc.querySelector('#rating_label')).replace(/^Average:\s*/i, ''),
    tags: Array.from(doc.querySelectorAll('#taglist a')).flatMap((anchor) => {
      const label = text(anchor)
      if (!label) return []
      const namespace = text(anchor.closest('tr')?.querySelector('.tc')).replace(/:$/, '').trim()
      const key = namespace ? namespace + ':' + label : label
      const searchTerm = exactTagTerm(key)
      return [{ label, namespace: namespace || undefined, key, searchTerm, href: ehAdapter.search(base, searchTerm) }]
    }),
    thumbnails: Array.from(doc.querySelectorAll<HTMLAnchorElement>('#gdt a[href*="/s/"]')).flatMap(
      (anchor) => thumbnail(anchor, base) ?? [],
    ),
    comments: parseComments(doc, base),
    ...thumbnailLinks(doc, base),
  }
}

function parseReader(doc: SiteDocument, base: URL): ReaderPage | undefined {
  const element = doc.querySelector<HTMLImageElement>('img#img')
  if (!element) return undefined
  const src = image(element, base)
  if (!src) return undefined
  const counters = Array.from(doc.querySelectorAll('#i2 .sn span'), (span) => numeric(text(span)))
  const frame: ReaderFrame = {
    href: base.href,
    image: src,
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

export const ehAdapter: SiteAdapter = {
  name: 'E-Hentai',
  home: (url) => new URL('/', url).href,
  pageCacheGroup: ehPageCacheGroup,
  canonicalGalleryUrl: (url) => new URL(url.pathname.replace(/\/$/, ''), url).href,
  galleryThumbnailPageUrl(gallery, batch) {
    const url = new URL(gallery)
    if (batch) url.searchParams.set('p', String(batch))
    else url.searchParams.delete('p')
    url.hash = ''
    return url.href
  },
  navigation: ehNavigation,
  loadTagDirectory,
  search(url, query) {
    const target = new URL('/', url)
    if (query) target.searchParams.set('f_search', query)
    return target.href
  },
  parse(doc, url) {
    if (url.pathname.replace(/\/$/, '') === '/mytags') return parseTags(doc, url)
    if (isNativePage(url)) return undefined
    if (/^\/g\/\d+\/[^/]+\/?$/.test(url.pathname)) return parseGallery(doc, url)
    if (/^\/s\/[^/]+\/\d+-\d+\/?$/.test(url.pathname)) return parseReader(doc, url)
    return parseCatalog(doc, url)
  },
}
