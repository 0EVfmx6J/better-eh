import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

const historyLimit = 8
const storageKey = 'better-eh-search-history'

export const useSearchHistoryStore = defineStore('search-history', () => {
  const stored = useLocalStorage<unknown>(storageKey, [], {
    serializer: { read: JSON.parse, write: JSON.stringify },
    writeDefaults: false,
    flush: 'sync',
  })
  const recent = computed(() => {
    if (!Array.isArray(stored.value)) return []
    const terms = stored.value.flatMap((query) => (typeof query === 'string' && query.trim() ? [query.trim()] : []))
    return [...new Set(terms)].slice(0, historyLimit)
  })

  function remember(query: string): void {
    const term = query.trim()
    if (term) stored.value = [term, ...recent.value.filter((item) => item !== term)].slice(0, historyLimit)
  }

  function clear(): void {
    stored.value = []
  }

  return { recent, remember, clear }
})
