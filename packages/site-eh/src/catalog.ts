import {
  readText as text,
  type CatalogPage,
  type Category,
  type GallerySummary,
  type SiteDocument,
} from '@better-eh/core'
import { image, link, numeric } from './dom'
import { catalogPaginationParams, ehNavigation } from './navigation'

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

export function parseCatalog(doc: SiteDocument, base: URL): CatalogPage | undefined {
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
