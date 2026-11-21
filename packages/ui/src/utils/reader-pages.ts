import type { createPageLoader, GalleryPage, ReaderPage, ReadingGallery, SiteAdapter, SitePage } from '@better-eh/core'
import { firstReaderIndex } from './reader-frames'
import type { LibraryPage } from './reading-library-route'

export function createReaderPageResolver(
  adapter: SiteAdapter,
  loader: Pick<ReturnType<typeof createPageLoader>, 'load'>,
  readerGalleryUrl: (current: ReaderPage) => string | undefined,
) {
  async function firstReaderPage(entry: { url: string; page: SitePage | LibraryPage }, signal: AbortSignal) {
    const gallery = entry.page.kind === 'gallery' ? entry.page : undefined
    const first =
      gallery &&
      (adapter.readerPageUrl?.(new URL(gallery.href), 1) ??
        gallery.thumbnails.find((thumbnail) => thumbnail.index === 1)?.href)
    const result = first ? await loader.load(first, signal) : entry
    if (result.page.kind !== 'reader' || result.page.index !== 1) throw new Error('找不到第 1 页。')
    return { url: result.url, page: result.page }
  }

  async function readerTargetUrl(current: ReaderPage, index: number, signal: AbortSignal): Promise<string> {
    const first = firstReaderIndex(current)
    const last = current.frames?.at(-1)?.index ?? current.index
    const known =
      current.frames?.find((frame) => frame.index === index)?.href ??
      (index === first - 1 ? current.previous : index === last + 1 ? current.next : undefined) ??
      (index === 1 ? current.first : undefined)
    if (known) return known

    const href = readerGalleryUrl(current)
    if (!href) throw new Error(`找不到第 ${index} 页。`)
    return galleryReaderUrl(new URL(href), index, signal)
  }

  async function galleryReaderUrl(
    gallery: URL,
    index: number,
    signal: AbortSignal,
    firstPage?: GalleryPage,
  ): Promise<string> {
    const direct = adapter.readerPageUrl?.(gallery, index)
    if (direct) return direct
    const missing = `找不到第 ${index} 页。`
    const batchUrl = adapter.galleryThumbnailPageUrl
    const page = firstPage ?? (await loader.load(batchUrl?.(gallery, 0) ?? gallery.href, signal)).page
    if (page.kind !== 'gallery') throw new Error(missing)
    const thumbnails = page.thumbnails
    const target = thumbnails.find((thumbnail) => thumbnail.index === index)
    if (target) return target.href

    // The first thumbnail page reflects the site's current thumbnail page size setting.
    const pageSize = thumbnails.at(-1)?.index ?? 0
    if (!batchUrl || !pageSize || thumbnails[0]?.index !== 1 || index <= pageSize) throw new Error(missing)
    const batch = await loader.load(batchUrl(gallery, Math.floor((index - 1) / pageSize)), signal)
    const thumbnail =
      batch.page.kind === 'gallery' ? batch.page.thumbnails.find((item) => item.index === index) : undefined
    if (!thumbnail) throw new Error(missing)
    return thumbnail.href
  }

  async function lastReaderPage(gallery: ReadingGallery, signal: AbortSignal) {
    const url = new URL(gallery.href)
    const entry = await loader.load(adapter.galleryThumbnailPageUrl?.(url, 0) ?? url.href, signal)
    if (entry.page.kind !== 'gallery') throw new Error('无法打开上一章。')

    let total = entry.page.pages || gallery.pages
    if (!total) {
      const first = await firstReaderPage(entry, signal)
      if (first.page.total === 1 || (!first.page.total && !first.page.next)) return first
      total = first.page.total
    }
    if (!total) throw new Error('找不到上一章的最后一页。')

    const href = await galleryReaderUrl(url, total, signal, entry.page)
    const last = await loader.load(href, signal)
    if (last.page.kind !== 'reader' || last.page.index !== total) throw new Error('找不到上一章的最后一页。')
    return { url: last.url, page: last.page }
  }

  return { firstReaderPage, readerTargetUrl, lastReaderPage }
}
