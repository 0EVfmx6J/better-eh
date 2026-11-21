export const galleryPath = /^\/g\/([1-9]\d*)\/?$/
export const readerPath = /^\/g\/([1-9]\d*)\/([1-9]\d*)\/?$/
export const tagNamespaces = [
  ['languages', 'language'],
  ['categories', 'category'],
  ['tags', 'tag'],
  ['parodies', 'parody'],
  ['characters', 'character'],
  ['artists', 'artist'],
  ['groups', 'group'],
] as const
export const tagPath = new RegExp(`^/(${tagNamespaces.map(([, type]) => type).join('|')})/[^/]+/?$`)
export const favoritesPath = '/user/favorites'

export function galleryUrl(base: URL, id: string): string {
  return new URL(`/g/${id}/`, base).href
}

export function readerUrl(base: URL, id: string, index: number): string {
  return new URL(`/g/${id}/${index}/`, base).href
}

export function searchUrl(base: URL, query: string): string {
  const target = new URL('/search/', base)
  target.searchParams.set('q', query)
  return target.href
}

export function canonicalGalleryUrl(url: URL): string {
  const id = galleryPath.exec(url.pathname)?.[1]
  return id ? galleryUrl(url, id) : url.href
}

export function readerPageUrl(gallery: URL, index: number): string | undefined {
  const id = galleryPath.exec(gallery.pathname)?.[1]
  if (id && Number.isSafeInteger(index) && index > 0) return readerUrl(gallery, id, index)
}
