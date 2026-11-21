import type { SiteAdapter } from '@better-eh/core'
import { parseCatalog } from './catalog'
import { galleryCommentsUrl, parseCommentsResponse } from './comments'
import { positiveInteger } from './dom'
import { parseGallery } from './gallery'
import { nhentaiNavigation, nhentaiPageCacheGroup } from './navigation'
import { parseReader } from './reader'
import { completeTags } from './tag-completion'
import { loadTagDirectory } from './tag-directory'
import { canonicalGalleryUrl, galleryPath, readerPageUrl, readerPath, searchUrl } from './urls'

export const nhentaiAdapter: SiteAdapter = {
  name: 'nHentai',
  home: (url) => new URL('/', url).href,
  pageCacheGroup: nhentaiPageCacheGroup,
  canonicalGalleryUrl,
  readerPageUrl,
  navigation: nhentaiNavigation,
  search(url, query) {
    return query ? searchUrl(url, query) : nhentaiAdapter.home(url)
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
