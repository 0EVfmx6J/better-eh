import { catalogCacheGroup, type PageCacheGroup, type SiteNavigationItem } from '@better-eh/core'
import { favoritesPath, galleryPath, galleryUrl, readerPath } from './urls'

export function nhPageCacheGroup(url: URL): PageCacheGroup {
  const reader = readerPath.exec(url.pathname)?.[1]
  if (reader) return { kind: 'reader', key: galleryUrl(url, reader) }
  const gallery = galleryPath.exec(url.pathname)?.[1]
  if (gallery) return { kind: 'gallery', key: galleryUrl(url, gallery) }
  return catalogCacheGroup(url, ['page'])
}

export function nhNavigation(url: URL): SiteNavigationItem[] {
  return [
    { id: 'home', label: '首页', href: new URL('/', url).href },
    { id: 'favorites', label: '收藏夹', href: new URL(favoritesPath, url).href },
    { id: 'tags', label: '标签目录', href: new URL('/tags/', url).href, native: true },
  ]
}
