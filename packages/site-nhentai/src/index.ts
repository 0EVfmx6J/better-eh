import { catalogCacheGroup, type SiteAdapter } from '@better-eh/core'
import { parseCatalog } from './catalog'
import { galleryCommentsUrl, parseCommentsResponse } from './comments'
import { positiveInteger } from './dom'
import { parseGallery } from './gallery'
import { parseReader } from './reader'
import { completeTags } from './tag-completion'
import { loadTagDirectory } from './tag-directory'
import { favoritesPath, galleryPath, galleryUrl, readerPath, readerUrl, searchUrl } from './urls'

export const nhentaiAdapter: SiteAdapter = {
  name: 'nHentai',
  home: (url) => new URL('/', url).href,
  pageCacheGroup(url) {
    const reader = readerPath.exec(url.pathname)?.[1]
    if (reader) return { kind: 'reader', key: galleryUrl(url, reader) }
    const gallery = galleryPath.exec(url.pathname)?.[1]
    if (gallery) return { kind: 'gallery', key: galleryUrl(url, gallery) }
    return catalogCacheGroup(url, ['page'])
  },
  canonicalGalleryUrl(url) {
    const id = galleryPath.exec(url.pathname)?.[1]
    return id ? galleryUrl(url, id) : url.href
  },
  readerPageUrl(gallery, index) {
    const id = galleryPath.exec(gallery.pathname)?.[1]
    if (id && Number.isSafeInteger(index) && index > 0) return readerUrl(gallery, id, index)
  },
  navigation(url) {
    return [
      { id: 'home', label: '首页', href: new URL('/', url).href },
      { id: 'favorites', label: '收藏夹', href: new URL(favoritesPath, url).href },
      { id: 'tags', label: '标签目录', href: new URL('/tags/', url).href, native: true },
    ]
  },
  search(url, query) {
    return query ? searchUrl(url, query) : new URL('/', url).href
  },
  completeTags,
  parseCommentsResponse,
  galleryCommentsUrl,
  loadTagDirectory,
  parse(doc, url) {
    const reader = readerPath.exec(url.pathname)
    if (reader?.[1]) return parseReader(doc, url, reader[1], positiveInteger(reader[2]))
    const id = galleryPath.exec(url.pathname)?.[1]
    if (id) return parseGallery(doc, url, id)
    return parseCatalog(doc, url)
  },
}
