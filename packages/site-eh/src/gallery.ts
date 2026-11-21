import {
  readText as text,
  resolveHttpUrl,
  type GalleryPage,
  type PageLinks,
  type SiteDocument,
  type Thumbnail,
} from '@better-eh/core'
import { parseComments } from './comments'
import { background, image, link, numeric } from './dom'
import { exactTagTerm } from './tag-directory'
import { searchUrl } from './urls'

function thumbnail(anchor: HTMLAnchorElement, base: URL): Thumbnail | undefined {
  const href = link(anchor, base)
  if (!href) return undefined
  const index = numeric(new URL(href).pathname.split('-').at(-1) ?? '')
  const tile = anchor.querySelector<HTMLElement>('[style*="background"]')
  const sprite = resolveHttpUrl(background(tile?.style), base)?.href
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

function thumbnailLinks(doc: SiteDocument, base: URL): PageLinks {
  const current = doc.querySelector('.ptt .ptds, .ptb .ptds')
  return {
    previous: link(current?.previousElementSibling?.querySelector('a'), base),
    next: link(current?.nextElementSibling?.querySelector('a'), base),
  }
}

export function parseGallery(doc: SiteDocument, base: URL): GalleryPage | undefined {
  const title = text(doc.querySelector('#gn')) || text(doc.querySelector('#gj'))
  if (!title) return undefined
  const info = new Map(
    Array.from(doc.querySelectorAll('#gdd tr'), (row) => [
      text(row.querySelector('.gdt1')).replace(/:$/, ''),
      text(row.querySelector('.gdt2')),
    ]),
  )
  const cover = doc.querySelector<HTMLElement>('#gd1 [style*="background"]')
  const coverUrl = resolveHttpUrl(background(cover?.style), base)?.href ?? (cover && image(cover, base)) ?? undefined
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
      return [{ label, namespace: namespace || undefined, key, searchTerm, href: searchUrl(base, searchTerm) }]
    }),
    thumbnails: Array.from(doc.querySelectorAll<HTMLAnchorElement>('#gdt a[href*="/s/"]')).flatMap(
      (anchor) => thumbnail(anchor, base) ?? [],
    ),
    comments: parseComments(doc, base),
    ...thumbnailLinks(doc, base),
  }
}
