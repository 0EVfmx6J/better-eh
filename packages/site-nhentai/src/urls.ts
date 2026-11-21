export const galleryPath = /^\/g\/([1-9]\d*)\/?$/
export const readerPath = /^\/g\/([1-9]\d*)\/([1-9]\d*)\/?$/
export const tagPath = /^\/(tag|artist|character|parody|group|category|language)\/[^/]+\/?$/
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
