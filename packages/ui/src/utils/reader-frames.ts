import type { ReaderFrame, ReaderPage, ReadingGallery } from '@better-eh/core'

export function readerFrame(page: ReaderPage, href: string): ReaderFrame {
  return {
    href,
    image: page.image,
    width: page.width,
    height: page.height,
    index: page.index,
  }
}

export function readerPageFrames(page: ReaderPage, href: string): ReaderFrame[] {
  return page.frames ?? [readerFrame(page, href)]
}

export function readerHasNext(page: ReaderPage): boolean {
  const last = page.frames?.at(-1)?.index ?? page.index
  return Boolean(page.next && (!page.total || last < page.total))
}

export function firstReaderIndex(page: ReaderPage): number {
  return page.frames?.[0]?.index ?? page.index
}

export function queuedReaderPage(page: ReaderPage, gallery: ReadingGallery | undefined): ReaderPage {
  return gallery ? { ...page, gallery: page.gallery ?? gallery.href, total: page.total || gallery.pages } : page
}
