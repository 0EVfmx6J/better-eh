import { defineStore } from 'pinia'
import { shallowRef, triggerRef } from 'vue'
import type { CatalogPage } from '@better-eh/core'
import type { GalleryScrollPosition } from '../utils/gallery-scroll'

interface CatalogSnapshot extends GalleryScrollPosition {
  url: string
  page: CatalogPage
}

const snapshotLimit = 12

export const useCatalogHistoryStore = defineStore('catalog-history', () => {
  const snapshots = shallowRef(new Map<string, CatalogSnapshot>())

  function save(id: string, snapshot: CatalogSnapshot): void {
    const entries = snapshots.value
    entries.delete(id)
    entries.set(id, snapshot)
    if (entries.size > snapshotLimit) {
      const oldest = entries.keys().next()
      if (!oldest.done) entries.delete(oldest.value)
    }
    triggerRef(snapshots)
  }

  function restore(id: string | undefined, url: string): CatalogSnapshot | undefined {
    const snapshot = id && snapshots.value.get(id)
    if (snapshot && snapshot.url === url) return snapshot
  }

  function clear(): void {
    snapshots.value = new Map()
  }

  return { snapshots, save, restore, clear }
})
