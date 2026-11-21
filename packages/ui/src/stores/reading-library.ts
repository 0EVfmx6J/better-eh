import { defineStore } from 'pinia'
import { computed, onScopeDispose, shallowRef } from 'vue'
import type { ReadingLibrary, ReadingLibraryChange, ReadingLibraryRepository } from '@better-eh/core'

export const useReadingLibraryStore = defineStore('reading-library', () => {
  const library = shallowRef<ReadingLibrary>({ history: [], later: [] })
  const loadingLibrary = shallowRef(false)
  const savingLibrary = shallowRef(false)
  const libraryError = shallowRef('')
  const bookmarksBusy = computed(() => loadingLibrary.value || savingLibrary.value)
  const historyByGalleryHref = computed(
    () => new Map(library.value.history.map((entry) => [entry.gallery.href, entry])),
  )
  const savedGalleryUrls = computed(() => new Set(library.value.later.map((entry) => entry.gallery.href)))
  let repository: ReadingLibraryRepository | undefined
  let unsubscribe: (() => void) | undefined
  let queue = Promise.resolve()

  function initialize(source: ReadingLibraryRepository): void {
    if (repository) return
    repository = source
    unsubscribe = source.subscribe?.(() => {
      void enqueue(() => source.read(), '无法读取浏览器中的阅读记录。')
    })
    void readLibrary()
  }

  function enqueue(read: () => Promise<ReadingLibrary>, error: string): Promise<boolean> {
    const result = queue.then(async () => {
      try {
        library.value = await read()
        return true
      } catch {
        libraryError.value = error
        return false
      }
    })
    queue = result.then(() => undefined)
    return result
  }

  async function readLibrary(): Promise<void> {
    const source = repository
    if (!source || loadingLibrary.value) return
    loadingLibrary.value = true
    libraryError.value = ''
    try {
      await enqueue(() => source.read(), '无法读取浏览器中的阅读记录。')
    } finally {
      loadingLibrary.value = false
    }
  }

  async function changeLibrary(change: ReadingLibraryChange): Promise<boolean> {
    const source = repository
    if (!source) return false
    if (change.type === 'visit') {
      return enqueue(() => source.apply(change), '无法保存浏览历史。')
    }
    if (savingLibrary.value) return false
    savingLibrary.value = true
    libraryError.value = ''
    try {
      return await enqueue(() => source.apply(change), '无法保存阅读记录，请检查浏览器存储后重试。')
    } finally {
      savingLibrary.value = false
    }
  }

  onScopeDispose(() => {
    unsubscribe?.()
    unsubscribe = undefined
    repository = undefined
  })

  return {
    library,
    libraryError,
    loadingLibrary,
    savingLibrary,
    bookmarksBusy,
    historyByGalleryHref,
    savedGalleryUrls,
    initialize,
    readLibrary,
    changeLibrary,
  }
})
