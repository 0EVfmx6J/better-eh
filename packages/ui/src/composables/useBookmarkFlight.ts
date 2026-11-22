import { useTemplateRef, type Ref } from 'vue'
import { flightCenter, useIconFlight } from './useIconFlight'

export function bookmarkOrigin(source: EventTarget | null) {
  if (source instanceof HTMLElement) return flightCenter(source.querySelector('svg') ?? source)
}

export function useBookmarkFlight(app: Readonly<Ref<HTMLElement | null>>, reducedMotion: Readonly<Ref<boolean>>) {
  const token = useTemplateRef<HTMLElement>('bookmarkFlight')
  const noticeDestination = useTemplateRef<HTMLElement>('bookmarkNoticeDestination')
  const { cancel, fly } = useIconFlight(token, reducedMotion)

  function sidebarDestination(): Element | undefined {
    const sidebar = app.value?.querySelector('.site-sidebar')
    const icon = sidebar?.querySelector('[data-section="later"] svg')
    if (!sidebar || !icon) return undefined
    const point = flightCenter(icon)
    const { top, bottom } = sidebar.getBoundingClientRect()
    if (point && point.y >= top && point.y <= bottom) return icon
  }

  function flyToNotice(start: ReturnType<typeof bookmarkOrigin>): boolean {
    return fly(start, noticeDestination.value ?? undefined)
  }

  return { cancel, fly, flyToNotice, sidebarDestination }
}
