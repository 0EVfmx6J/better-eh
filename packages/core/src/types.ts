export interface PageLinks {
  previous?: string
  next?: string
}

export interface Category {
  label: string
  href: string
  selected: boolean
}

export interface GallerySummary {
  href: string
  title: string
  cover?: string
  category: string
  pages: number
  posted: string
}

export interface Thumbnail {
  href: string
  index: number
  image?: string
  sprite?: { x: number; y: number; width: number; height: number }
}

export interface CatalogPage extends PageLinks {
  kind: 'catalog'
  title: string
  query: string
  emptyMessage?: string
  categories: Category[]
  featured?: { title: string; items: GallerySummary[] }
  itemsTitle?: string
  items: GallerySummary[]
}

export interface GalleryTag {
  label: string
  namespace?: string
  key?: string
  href?: string
  searchTerm?: string
}

export interface GalleryPage extends GallerySummary, PageLinks {
  kind: 'gallery'
  subtitle: string
  uploader: string
  language: string
  rating: string
  tags: GalleryTag[]
  thumbnails: Thumbnail[]
}

export interface ReaderFrame {
  href: string
  image: string
  width?: number
  height?: number
  index: number
}

export interface ReaderPage extends PageLinks {
  kind: 'reader'
  title: string
  image: string
  width?: number
  height?: number
  index: number
  total: number
  gallery?: string
  first?: string
  frames?: ReaderFrame[]
}

export interface TagPreferences {
  watched: boolean
  hidden: boolean
  color: string
  weight: number
}

export interface ManagedTag extends TagPreferences {
  id: string
  name: string
}

export type TagChange =
  | ({ kind: 'add'; name: string } & TagPreferences)
  | ({ kind: 'edit'; id: string } & TagPreferences)
  | { kind: 'move'; ids: string[]; target: string }
  | { kind: 'remove'; ids: string[] }

export interface TagsPage {
  kind: 'tags'
  title: string
  groups: { id: string; label: string; href: string }[]
  activeGroup: string
  groupEnabled: boolean
  defaultColor: string
  tags: ManagedTag[]
  canAdd: boolean
  canEdit: boolean
  submit: (change: TagChange) => Promise<TagsPage>
}

export type SitePage = CatalogPage | GalleryPage | ReaderPage | TagsPage

export interface PageCacheGroup {
  kind: SitePage['kind']
  key: string
}

export interface SiteNavigationItem {
  id: string
  label: string
  href: string
  native?: boolean
}

export interface TagCompletion {
  key: string
  label: string
  query: string
  caret: number
}

export type CompleteTags = (query: string, caret: number, signal: AbortSignal) => Promise<TagCompletion[]>

export interface TagDirectory {
  translate: (key: string) => string | undefined
  complete: (query: string, caret: number) => TagCompletion[]
}

export interface SiteAdapter {
  readonly name: string
  readonly home: (url: URL) => string
  pageCacheGroup: (url: URL) => PageCacheGroup
  canonicalGalleryUrl?: (url: URL) => string
  readerPageUrl?: (gallery: URL, index: number) => string | undefined
  galleryThumbnailPageUrl?: (gallery: URL, batch: number) => string
  navigation?: (url: URL) => SiteNavigationItem[]
  search: (url: URL, query: string) => string
  loadTagDirectory?: () => Promise<TagDirectory>
  completeTags?: CompleteTags
  parse: (document: Document | DocumentFragment, url: URL) => SitePage | undefined
}
