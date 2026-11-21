import { catalogCacheGroup, type PageCacheGroup, type SiteNavigationItem } from '@better-eh/core'
import { galleryPath, readerPath } from './urls'

export const catalogPaginationParams = ['next', 'prev', 'seek', 'jump', 'page']

export function ehPageCacheGroup(url: URL): PageCacheGroup {
  const pathname = url.pathname.replace(/\/$/, '')
  const gallery = galleryPath.exec(url.pathname)?.[1]
  if (gallery) return { kind: 'gallery', key: new URL(pathname, url).href }
  const reader = readerPath.exec(url.pathname)?.[1]
  if (reader) return { kind: 'reader', key: new URL('/g/' + reader, url).href }
  if (pathname === '/mytags') return { kind: 'tags', key: new URL(pathname, url).href }
  return catalogCacheGroup(url, catalogPaginationParams)
}

const sections: SiteNavigationItem[] = [
  { id: 'home', label: '首页', href: '/' },
  { id: 'watched', label: '关注', href: '/watched' },
  { id: 'popular', label: '热门', href: '/popular' },
  { id: 'torrents', label: '种子', href: '/torrents.php', native: true },
  { id: 'favorites', label: '收藏夹', href: '/favorites.php' },
  { id: 'settings', label: '设置', href: '/uconfig.php', native: true },
  { id: 'uploads', label: '我的上传', href: 'https://upld.e-hentai.org/manage', native: true },
  { id: 'tags', label: '我的标签', href: '/mytags' },
]

export function ehNavigation(url: URL): SiteNavigationItem[] {
  return sections.map((section) => ({ ...section, href: new URL(section.href, url).href }))
}

export function isNativePage(url: URL): boolean {
  return sections.some((section) => section.native && new URL(section.href, url).pathname === url.pathname)
}
