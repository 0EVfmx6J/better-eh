import type { SiteAdapter } from '@better-eh/core'
import { parseCatalog } from './catalog'
import { parseGallery } from './gallery'
import { ehNavigation, ehPageCacheGroup, isNativePage } from './navigation'
import { parseReader } from './reader'
import { loadTagDirectory } from './tag-directory'
import { parseTags } from './tags'
import { canonicalGalleryUrl, galleryPath, galleryThumbnailPageUrl, readerPath, searchUrl } from './urls'

export const ehAdapter: SiteAdapter = {
  name: 'E-Hentai',
  home: (url) => new URL('/', url).href,
  pageCacheGroup: ehPageCacheGroup,
  canonicalGalleryUrl,
  galleryThumbnailPageUrl,
  navigation: ehNavigation,
  loadTagDirectory,
  search: searchUrl,
  parse(doc, url) {
    if (url.pathname.replace(/\/$/, '') === '/mytags') return parseTags(doc, url)
    if (isNativePage(url)) return undefined
    if (galleryPath.test(url.pathname)) return parseGallery(doc, url)
    if (readerPath.test(url.pathname)) return parseReader(doc, url)
    return parseCatalog(doc, url)
  },
}
