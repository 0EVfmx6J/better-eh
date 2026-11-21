import type {
  ReadingGallery,
  ReadingHistoryEntry,
  ReadingLibrary,
  ReadingLibraryChange,
  ReadingLibraryRepository,
  ReadingProgress,
  ReadLaterEntry,
} from '@better-eh/core'

const storageKey = 'better-eh-reading-library-v1'
const historyLimit = 500

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUrl(value: unknown, origin?: string): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return /^https?:$/.test(url.protocol) && (!origin || url.origin === origin)
  } catch {
    return false
  }
}

function isDate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(new Date(value).getTime())
}

function isGallery(value: unknown, origin: string): value is ReadingGallery {
  return (
    isRecord(value) &&
    isUrl(value.href, origin) &&
    typeof value.title === 'string' &&
    typeof value.pages === 'number' &&
    Number.isSafeInteger(value.pages) &&
    value.pages >= 0 &&
    (value.cover === undefined || isUrl(value.cover))
  )
}

function isProgress(value: unknown, origin: string): value is ReadingProgress {
  return (
    isRecord(value) &&
    isUrl(value.href, origin) &&
    typeof value.index === 'number' &&
    Number.isSafeInteger(value.index) &&
    value.index > 0
  )
}

function mergeGallery(gallery: ReadingGallery, previous?: ReadingGallery): ReadingGallery {
  return {
    ...gallery,
    cover: gallery.cover ?? previous?.cover,
    pages: gallery.pages || previous?.pages || 0,
  }
}

function applyChange(library: ReadingLibrary, change: ReadingLibraryChange): ReadingLibrary {
  switch (change.type) {
    case 'visit': {
      const href = change.gallery.href
      const old = library.history.find((entry) => entry.gallery.href === href)
      const recent = {
        gallery: mergeGallery(change.gallery, old?.gallery),
        visitedAt: Date.now(),
        progress: change.progress ?? old?.progress,
      }
      return {
        ...library,
        history: [recent, ...library.history.filter((entry) => entry.gallery.href !== href)].slice(0, historyLimit),
      }
    }
    case 'save-for-later':
    case 'save-many-for-later': {
      const galleries = change.type === 'save-for-later' ? [change.gallery] : change.galleries
      const savedHrefs = new Set(library.later.map((entry) => entry.gallery.href))
      const historyByHref = new Map(library.history.map((entry) => [entry.gallery.href, entry.gallery]))
      const savedAt = Date.now()
      const added: ReadLaterEntry[] = []
      for (const gallery of galleries) {
        if (savedHrefs.has(gallery.href)) continue
        savedHrefs.add(gallery.href)
        added.push({ gallery: mergeGallery(gallery, historyByHref.get(gallery.href)), savedAt })
      }
      return added.length ? { ...library, later: added.concat(library.later) } : library
    }
    case 'remove-from-later':
    case 'remove-from-history':
    case 'remove-many': {
      const section =
        change.type === 'remove-many' ? change.section : change.type === 'remove-from-history' ? 'history' : 'later'
      const hrefs = new Set(change.type === 'remove-many' ? change.hrefs : [change.href])
      return { ...library, [section]: library[section].filter((entry) => !hrefs.has(entry.gallery.href)) }
    }
  }
}

export function createBrowserReadingLibrary(browser: Window): ReadingLibraryRepository {
  function read(): ReadingLibrary {
    const stored = browser.localStorage.getItem(storageKey)
    if (stored === null) return { history: [], later: [] }
    const value: unknown = JSON.parse(stored)
    if (!isRecord(value) || !Array.isArray(value.history) || !Array.isArray(value.later)) {
      throw new Error('阅读记录格式有误。')
    }
    const origin = browser.location.origin
    const history = (value.history as unknown[]).filter(
      (entry): entry is ReadingHistoryEntry =>
        isRecord(entry) &&
        isGallery(entry.gallery, origin) &&
        isDate(entry.visitedAt) &&
        (entry.progress === undefined || isProgress(entry.progress, origin)),
    )
    const later = (value.later as unknown[]).filter(
      (entry): entry is ReadLaterEntry => isRecord(entry) && isGallery(entry.gallery, origin) && isDate(entry.savedAt),
    )
    return { history, later }
  }

  return {
    async read() {
      return read()
    },
    async apply(change) {
      function mutate(): ReadingLibrary {
        const library = read()
        const updated = applyChange(library, change)
        if (updated !== library) browser.localStorage.setItem(storageKey, JSON.stringify(updated))
        return updated
      }
      return browser.navigator.locks ? browser.navigator.locks.request(storageKey, mutate) : mutate()
    },
    subscribe(onChange) {
      const listener = (event: StorageEvent) => {
        if (event.key === storageKey || event.key === null) onChange()
      }
      browser.addEventListener('storage', listener)
      return () => browser.removeEventListener('storage', listener)
    },
  }
}
