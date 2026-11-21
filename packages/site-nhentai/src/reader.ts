import {
  readImageUrl as imageUrl,
  readLocalLink as localLink,
  readText as text,
  type ReaderPage,
  type SiteDocument,
} from '@better-eh/core'
import { positiveInteger } from './dom'
import { galleryUrl, readerPath, readerUrl } from './urls'

export function parseReader(doc: SiteDocument, base: URL, id: string, index: number): ReaderPage | undefined {
  const element = doc.querySelector('#image-container img')
  const image = imageUrl(element, base)
  if (!image || !index) return undefined
  const total = positiveInteger(text(doc.querySelector('.num-pages')))
  if (total && index > total) return undefined

  const nextLink = localLink(doc.querySelector('.reader-bar a.next, .pagination a.next, #image-container a'), base)
  const nextRoute = nextLink && readerPath.exec(nextLink.pathname)
  const hasNext = total ? index < total : nextRoute?.[1] === id && positiveInteger(nextRoute[2]) === index + 1
  const heading = doc.querySelector('h1 a[href*="/g/"], h2 a[href*="/g/"]') ?? doc.querySelector('h1, h2')
  const documentTitle = text(doc.querySelector('title')).replace(/\s*[-|–—»]\s*nhentai.*$/i, '')
  return {
    kind: 'reader',
    title: text(heading) || documentTitle || `画廊 #${id}`,
    image,
    width: positiveInteger(element?.getAttribute('width')) || undefined,
    height: positiveInteger(element?.getAttribute('height')) || undefined,
    index,
    total,
    gallery: galleryUrl(base, id),
    first: readerUrl(base, id, 1),
    previous: index > 1 ? readerUrl(base, id, index - 1) : undefined,
    next: hasNext ? readerUrl(base, id, index + 1) : undefined,
  }
}
