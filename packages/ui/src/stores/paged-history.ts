import { defineStore } from 'pinia'
import { shallowRef, triggerRef } from 'vue'
import type { CatalogPage, GalleryPage } from '@better-eh/core'
import type { GalleryScrollPosition } from '../utils/gallery-scroll'

interface PageSnapshot extends GalleryScrollPosition {
  url: string
  page: CatalogPage | GalleryPage
}

const snapshotLimit = 12

export const usePagedHistoryStore = defineStore('paged-history', () => {
  const snapshots = shallowRef({
    catalog: new Map<string, PageSnapshot>(),
    gallery: new Map<string, PageSnapshot>(),
  })

  function save(id: string, snapshot: PageSnapshot): void {
    const { catalog, gallery } = snapshots.value
    catalog.delete(id)
    gallery.delete(id)
    const entries = snapshots.value[snapshot.page.kind]
    entries.set(id, snapshot)
    if (entries.size > snapshotLimit) {
      const oldest = entries.keys().next()
      if (!oldest.done) entries.delete(oldest.value)
    }
    triggerRef(snapshots)
  }

  function restore(id: string | undefined, url: string): PageSnapshot | undefined {
    const { catalog, gallery } = snapshots.value
    const snapshot = id && (catalog.get(id) ?? gallery.get(id))
    if (snapshot && snapshot.url === url) return snapshot
  }

  function clearCatalogs(): void {
    snapshots.value.catalog.clear()
    triggerRef(snapshots)
  }

  return { snapshots, save, restore, clearCatalogs }
})
