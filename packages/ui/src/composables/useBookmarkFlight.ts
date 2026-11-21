import { onScopeDispose, useTemplateRef, type Ref } from 'vue'

function center(element: Element) {
  const bounds = element.getBoundingClientRect()
  if (!bounds.width || !bounds.height) return undefined
  const x = bounds.left + bounds.width / 2
  const y = bounds.top + bounds.height / 2
  return x >= 0 && x <= innerWidth && y >= 0 && y <= innerHeight ? { x, y } : undefined
}

export function bookmarkOrigin(source: EventTarget | null) {
  if (source instanceof HTMLElement) return center(source.querySelector('svg') ?? source)
}

export function useBookmarkFlight(app: Readonly<Ref<HTMLElement | null>>, reducedMotion: Readonly<Ref<boolean>>) {
  const token = useTemplateRef<HTMLElement>('bookmarkFlight')
  const noticeDestination = useTemplateRef<HTMLElement>('bookmarkNoticeDestination')
  let flight: Animation | undefined
  let arrival: Animation | undefined

  function cancel(): void {
    flight?.cancel()
    arrival?.cancel()
  }

  function sidebarDestination(): Element | undefined {
    const sidebar = app.value?.querySelector('.site-sidebar')
    const icon = sidebar?.querySelector('[data-section="later"] svg')
    if (!sidebar || !icon) return undefined
    const point = center(icon)
    const { top, bottom } = sidebar.getBoundingClientRect()
    if (point && point.y >= top && point.y <= bottom) return icon
  }

  function fly(start: ReturnType<typeof bookmarkOrigin>, destination: Element | undefined): boolean {
    if (!start || !destination || !token.value || reducedMotion.value) return false
    const end = center(destination)
    if (!end) return false
    cancel()

    const arcHeight = Math.min(160, Math.hypot(end.x - start.x, end.y - start.y) * 0.35)
    const frames = Array.from({ length: 9 }, (_, step) => {
      const progress = step / 8
      const x = start.x + (end.x - start.x) * progress
      const y = start.y + (end.y - start.y) * progress - arcHeight * progress * (1 - progress)
      return {
        transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${1 - 0.45 * progress})`,
        opacity: 1 - 0.8 * progress ** 4,
      }
    })

    flight = token.value.animate(frames, { duration: 440, easing: 'cubic-bezier(.25, .75, .35, 1)' })
    flight.onfinish = () => {
      if (!destination.isConnected || reducedMotion.value) return
      arrival = destination.animate([{ scale: '1' }, { scale: '1.23', offset: 0.42 }, { scale: '1' }], {
        duration: 220,
        easing: 'ease-out',
      })
    }
    return true
  }

  function flyToNotice(start: ReturnType<typeof bookmarkOrigin>): boolean {
    return fly(start, noticeDestination.value ?? undefined)
  }

  onScopeDispose(cancel)
  return { cancel, fly, flyToNotice, sidebarDestination }
}
