import type { GallerySummary } from './types'

export type ReadingGallery = Pick<GallerySummary, 'href' | 'title' | 'cover' | 'pages'>

export interface ReadingProgress {
  href: string
  index: number
}

export interface ReadingHistoryEntry {
  gallery: ReadingGallery
  visitedAt: number
  progress?: ReadingProgress
}

export interface ReadLaterEntry {
  gallery: ReadingGallery
  savedAt: number
}

export interface ReadingLibrary {
  history: ReadingHistoryEntry[]
  later: ReadLaterEntry[]
}

export type ReadingLibraryRemoval =
  | { type: 'remove-from-later'; href: string }
  | { type: 'remove-from-history'; href: string }
  | { type: 'remove-many'; section: 'history' | 'later'; hrefs: readonly string[] }

export type ReadingLibraryChange =
  | { type: 'visit'; gallery: ReadingGallery; progress?: ReadingProgress }
  | { type: 'save-for-later'; gallery: ReadingGallery }
  | { type: 'save-many-for-later'; galleries: readonly ReadingGallery[] }
  | ReadingLibraryRemoval

export interface ReadingLibraryRepository {
  read(): Promise<ReadingLibrary>
  apply(change: ReadingLibraryChange): Promise<ReadingLibrary>
  subscribe?(onChange: () => void): () => void
}
