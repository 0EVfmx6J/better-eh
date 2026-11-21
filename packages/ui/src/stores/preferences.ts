import { computed } from 'vue'
import { defineStore } from 'pinia'
import { useLocalStorage, useMediaQuery, usePreferredDark } from '@vueuse/core'

export const themeStorageKey = 'better-eh-theme'

export const usePreferencesStore = defineStore('preferences', () => {
  const prefersDark = usePreferredDark()
  const theme = useLocalStorage(themeStorageKey, prefersDark.value ? 'dark' : 'light')
  const layout = useLocalStorage('better-eh-layout', 'grid')
  const desktopReaderFit = useLocalStorage('better-eh-reader-fit', 'screen')
  const narrowReaderFit = useLocalStorage('better-eh-reader-fit-narrow', 'width')
  const desktopNavigation = useMediaQuery('(min-width: 960px)')

  const readerFit = computed(() => (desktopNavigation.value ? desktopReaderFit.value : narrowReaderFit.value))

  function toggleTheme(): void {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  function toggleReaderFit(): void {
    const preference = desktopNavigation.value ? desktopReaderFit : narrowReaderFit
    preference.value = preference.value === 'screen' ? 'width' : 'screen'
  }

  return {
    theme,
    layout,
    desktopReaderFit,
    narrowReaderFit,
    desktopNavigation,
    readerFit,
    toggleTheme,
    toggleReaderFit,
  }
})
