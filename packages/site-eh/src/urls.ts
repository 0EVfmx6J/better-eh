export const galleryPath = /^\/g\/(\d+)\/[^/]+\/?$/
export const readerPath = /^\/s\/[^/]+\/(\d+)-(\d+)\/?$/

export function canonicalGalleryUrl(url: URL): string {
  return new URL(url.pathname.replace(/\/$/, ''), url).href
}

export function galleryThumbnailPageUrl(gallery: URL, batch: number): string {
  const url = new URL(gallery)
  if (batch) url.searchParams.set('p', String(batch))
  else url.searchParams.delete('p')
  url.hash = ''
  return url.href
}

export function searchUrl(base: URL, query: string): string {
  const target = new URL('/', base)
  if (query) target.searchParams.set('f_search', query)
  return target.href
}
