import {
  readImageUrl as imageUrl,
  readLocalLink as localLink,
  readText as text,
  type CatalogPage,
  type GallerySummary,
  type SiteDocument,
} from '@better-eh/core'
import { positiveInteger } from './dom'
import { favoritesPath, galleryPath, galleryUrl, tagPath } from './urls'

const searchPath = /^\/search(?:\/popular(?:-(?:today|week|month))?)?\/?$/

function catalogTitle(doc: SiteDocument, url: URL): string | undefined {
  const path = url.pathname.replace(/\/$/, '')
  if (path === '') return '画廊索引'
  if (path === favoritesPath) return '收藏夹'
  if (searchPath.test(path)) return '搜索结果'
  const section = path.replace(/\/popular(?:-(?:today|week|month))?$/, '')
  if (tagPath.test(path) || tagPath.test(section)) {
    return text(doc.querySelector('#content h1, .index-container h1')) || '标签画廊'
  }
}

function parseCard(card: Element, base: URL): GallerySummary | undefined {
  const anchor = card.querySelector('a.cover[href]') ?? card.querySelector('a[href^="/g/"]')
  const target = localLink(anchor, base)
  const id = target && galleryPath.exec(target.pathname)?.[1]
  const caption = card.querySelector('.caption')
  const image = anchor?.querySelector('img')
  const title = text(caption) || caption?.getAttribute('title')?.trim() || image?.getAttribute('alt')?.trim()
  if (!id || !title) return undefined

  const pageCount = text(card.querySelector('.page-count')).match(/^(\d[\d,]*)(?:\s+pages?)?$/i)?.[1]
  const time = card.querySelector('time')
  return {
    href: galleryUrl(base, id),
    title,
    cover: imageUrl(image, base),
    category: text(card.querySelector('.category')),
    pages: positiveInteger(card.getAttribute('data-num-pages')) || positiveInteger(pageCount),
    posted: time?.getAttribute('datetime') || text(time),
  }
}

function paginationLink(doc: SiteDocument, base: URL, selector: string): string | undefined {
  const target = localLink(doc.querySelector(selector), base)
  if (
    target &&
    target.pathname.replace(/\/$/, '') === base.pathname.replace(/\/$/, '') &&
    target.search !== base.search
  ) {
    return target.href
  }
}

export function parseCatalog(doc: SiteDocument, base: URL): CatalogPage | undefined {
  const title = catalogTitle(doc, base)
  if (!title) return undefined
  const home = base.pathname === '/'
  const favorites = base.pathname.replace(/\/$/, '') === favoritesPath
  const cards = doc.querySelectorAll('.index-container .gallery, #content .gallery')
  if (!cards.length && !doc.querySelector(favorites ? '#favcontainer, .index-container' : '.index-container')) {
    if (!searchPath.test(base.pathname) || !doc.querySelector('#content .no-results')) return undefined
  }
  const entries = new Map<string, GallerySummary>()
  const featured = new Map<string, GallerySummary>()
  for (const card of cards) {
    const gallery = parseCard(card, base)
    if (!gallery) continue
    const group = home && card.closest('.index-popular') ? featured : entries
    if (!group.has(gallery.href)) group.set(gallery.href, gallery)
  }
  if (cards.length && !entries.size && !featured.size) return undefined

  const query = base.searchParams.get('q') ?? ''
  return {
    kind: 'catalog',
    title,
    query,
    emptyMessage: favorites && !query ? '收藏夹暂无画廊。' : undefined,
    featured: featured.size ? { title: '当前热门', items: [...featured.values()] } : undefined,
    itemsTitle: home ? '最新上传' : undefined,
    items: [...entries.values()],
    categories: [],
    previous: paginationLink(doc, base, '.pagination a.previous, .pagination a[rel~="prev"]'),
    next: paginationLink(doc, base, '.pagination a.next, .pagination a[rel~="next"]'),
  }
}
