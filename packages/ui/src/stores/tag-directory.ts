import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import type { SiteAdapter, TagDirectory } from '@better-eh/core'

export const useTagDirectoryStore = defineStore('tag-directory', () => {
  const directory = shallowRef<TagDirectory>()
  const loading = shallowRef(false)
  const failed = shallowRef(false)

  async function load(adapter: Pick<SiteAdapter, 'loadTagDirectory'>): Promise<void> {
    if (!adapter.loadTagDirectory || directory.value || loading.value) return
    loading.value = true
    failed.value = false
    try {
      directory.value = await adapter.loadTagDirectory()
    } catch {
      failed.value = true
    } finally {
      loading.value = false
    }
  }

  const translate = computed(() => directory.value?.translate)

  return { directory, loading, failed, load, translate }
})
