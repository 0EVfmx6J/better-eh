import type { GalleryPage, GalleryTag, Thumbnail } from '@better-eh/core'
import { parseComments } from './comments'
import { imageUrl, localLink, positiveInteger, text, type SiteDocument } from './dom'
import { galleryUrl, readerPath, readerUrl, searchUrl, tagPath } from './urls'

const searchTag = /^(tag|artist|character|parody|group|category|language):(?:"[^"]+"|[^"\s]+)$/i

function parseTags(doc: SiteDocument, base: URL): GalleryTag[] {
  const tags = new Map<string, GalleryTag>()
  for (const anchor of doc.querySelectorAll('#tags a.tag, #tags a.tagchip')) {
    const link = localLink(anchor, base)
    if (!link) continue
    const query = /^\/search\/?$/.test(link.pathname) ? (link.searchParams.get('q') ?? '') : ''
    const exactTerm = searchTag.exec(query)
    const namespace = tagPath.exec(link.pathname)?.[1] ?? exactTerm?.[1]?.toLowerCase()
    const label = text(anchor.querySelector('.name'))
    if (!namespace || !label) continue
    const key = `${namespace}:${label}`
    const searchTerm = exactTerm?.[0] ?? (label.includes('"') ? undefined : `${namespace}:"${label}"`)
    tags.set(key, { label, namespace, key, href: searchTerm ? searchUrl(base, searchTerm) : link.href, searchTerm })
  }
  return [...tags.values()]
}

function parseThumbnails(doc: SiteDocument, base: URL, id: string): Thumbnail[] {
  const thumbnails = new Map<number, Thumbnail>()
  for (const anchor of doc.querySelectorAll('#thumbnail-container a[href], a.gallerythumb[href]')) {
    const target = localLink(anchor, base)
    const route = target && readerPath.exec(target.pathname)
    const index = positiveInteger(route?.[2])
    if (route?.[1] === id && index) {
      thumbnails.set(index, {
        href: readerUrl(base, id, index),
        index,
        image: imageUrl(anchor.querySelector('img'), base),
      })
    }
  }
  return [...thumbnails.values()].sort((a, b) => a.index - b.index)
}

function pageCount(doc: SiteDocument, base: URL): number {
  for (const row of doc.querySelectorAll('#tags .tag-container')) {
    const count = text(row).match(/^Pages:\s*(\d[\d,]*)(?:\s|$)/i)?.[1]
    if (count) return positiveInteger(count)
    for (const anchor of row.querySelectorAll('a[href]')) {
      const target = localLink(anchor, base)
      const query = target?.searchParams.get('q') ?? ''
      const pages = /^pages:(\d+)$/i.exec(query)?.[1]
      if (pages) return positiveInteger(pages)
    }
  }
  return 0
}

export function parseGallery(doc: SiteDocument, base: URL, id: string): GalleryPage | undefined {
  const title = text(doc.querySelector('#info h1'))
  if (!title) return undefined
  const tags = parseTags(doc, base)
  const thumbnails = parseThumbnails(doc, base, id)
  const time = doc.querySelector('#tags time')
  return {
    kind: 'gallery',
    href: galleryUrl(base, id),
    title,
    cover: imageUrl(doc.querySelector('#cover img'), base),
    subtitle: text(doc.querySelector('#info h2')),
    category: tags.find((tag) => tag.namespace === 'category')?.label ?? '',
    pages: pageCount(doc, base) || (thumbnails.at(-1)?.index ?? 0),
    posted: time?.getAttribute('datetime')?.split('T')[0] || text(time),
    uploader: '',
    language: tags
      .filter((tag) => tag.namespace === 'language' && tag.label !== 'translated')
      .map((tag) => tag.label)
      .join(' / '),
    rating: '',
    tags,
    thumbnails,
    comments: parseComments(doc, base, id),
  }
}
