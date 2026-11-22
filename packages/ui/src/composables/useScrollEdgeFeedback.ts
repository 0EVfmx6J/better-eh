import { useEventListener } from '@vueuse/core'
import { useSpring } from '@vueuse/motion'
import { computed, reactive, shallowRef, watch, type Ref } from 'vue'

const triggerDistance = 56
const holdDistance = 52
const maxDistance = 150
const resistance = 0.55
const slop = 6

interface Pull {
  id: number
  start: { x: number; y: number }
  scale: number
  edge?: { x: number; y: number; viewportLeft: number }
  rawOffset?: number
  time: number
  velocity: number
}

function fingerPosition(touch: Touch, scale: number, viewport: VisualViewport | null) {
  if (!viewport || scale <= 1.01) return { x: touch.clientX, y: touch.clientY }
  // Measure the finger on screen while the visual viewport is moving beneath it.
  return { x: (touch.pageX - viewport.pageLeft) * scale, y: (touch.pageY - viewport.pageTop) * scale }
}

function useScrollEdgePull(
  surface: Readonly<Ref<HTMLElement | null>>,
  blocked: Readonly<Ref<boolean>>,
  reducedMotion: Readonly<Ref<boolean>>,
  options: { edge: 'top'; refresh: () => Promise<void> } | { edge: 'bottom' },
) {
  const bottom = options.edge === 'bottom'
  const direction = bottom ? -1 : 1
  const position = reactive({ y: 0 })
  const spring = { stiffness: 340, damping: 37, restDelta: 0.15, restSpeed: 3, velocity: 0 }
  const { set, stop } = useSpring(position, spring)
  const dragging = shallowRef(false)
  const scale = shallowRef(1)
  const distance = computed(() => Math.max(0, position.y))
  const offset = computed(() => distance.value / scale.value)
  const ready = computed(() => dragging.value && distance.value >= triggerDistance)
  let pull: Pull | undefined

  function atEdge(element: HTMLElement | null, viewport: VisualViewport | null): boolean {
    if (!element) return false
    // At a scroll edge the zoomed visual viewport may still have room to pan.
    if (!bottom) return element.scrollTop <= 1 && (viewport?.offsetTop ?? 0) <= 1
    if (element.scrollHeight - element.clientHeight - element.scrollTop > 1) return false
    return (
      !viewport ||
      viewport.scale <= 1.01 ||
      viewport.offsetTop + viewport.height >= element.getBoundingClientRect().bottom - 1
    )
  }

  function viewportAtEdge(current: Pull, viewport: VisualViewport | null): boolean {
    return (
      atEdge(surface.value, viewport) &&
      (!current.edge || Math.abs((viewport?.offsetLeft ?? 0) - current.edge.viewportLeft) * current.scale <= slop) &&
      Math.abs((viewport?.scale ?? 1) - current.scale) <= 0.01
    )
  }

  function damp(raw: number): number {
    const resisted = Math.max(0, raw) * resistance
    return (maxDistance * resisted) / (maxDistance + resisted)
  }

  function settle(target: number, velocity = 0): void {
    stop()
    if (reducedMotion.value) {
      position.y = target
    } else {
      spring.velocity = velocity
      set({ y: target })
    }
  }

  function detach(): Pull | undefined {
    const current = pull
    pull = undefined
    dragging.value = false
    return current
  }

  function cancel(): void {
    if (detach()?.rawOffset !== undefined) settle(0)
  }

  function acceptsTarget(target: EventTarget | null, element: HTMLElement): boolean {
    return (
      !(target instanceof Element) ||
      (target.closest('dialog') === element.closest('dialog') &&
        !target.closest('input, select, textarea, [contenteditable], .filters, .site-sidebar, .tag-suggestions'))
    )
  }

  function move(event: TouchEvent): void {
    const current = pull
    if (!current) return
    const viewport = window.visualViewport
    const touch = event.touches[0]
    if (
      !touch ||
      event.touches.length !== 1 ||
      touch.identifier !== current.id ||
      blocked.value ||
      (!event.cancelable && !bottom && current.scale <= 1.01) ||
      Math.abs((viewport?.scale ?? 1) - current.scale) > 0.01
    ) {
      cancel()
      return
    }

    const finger = fingerPosition(touch, current.scale, viewport)
    if (!current.edge) {
      const dx = Math.abs(finger.x - current.start.x)
      const dy = direction * (finger.y - current.start.y)
      if (Math.max(dx, Math.abs(dy)) >= slop && dy <= dx) cancel()
      else if (atEdge(surface.value, viewport)) current.edge = { ...finger, viewportLeft: viewport?.offsetLeft ?? 0 }
      return
    }
    if (!viewportAtEdge(current, viewport)) {
      cancel()
      return
    }

    const dy = direction * (finger.y - current.edge.y)
    if (current.rawOffset === undefined) {
      const dx = Math.abs(finger.x - current.edge.x)
      if (Math.max(dx, Math.abs(dy)) < slop) return
      if (dy <= dx) {
        cancel()
        return
      }
      stop()
      // Resume a settling spring at its current displacement if grabbed again.
      const rest = Math.min(offset.value * current.scale, maxDistance - 1)
      current.rawOffset = (rest * maxDistance) / (resistance * (maxDistance - rest))
      scale.value = current.scale
      dragging.value = true
    }

    // Let the browser keep handling zoomed gestures while we measure the pull past the edge.
    if (event.cancelable && current.scale <= 1.01) event.preventDefault()
    const next = damp(current.rawOffset + dy - slop)
    const elapsed = Math.max(8, event.timeStamp - current.time)
    current.velocity = Math.max(-600, Math.min(600, ((next - distance.value) * 1000) / elapsed))
    current.time = event.timeStamp
    position.y = next
  }

  function start(event: TouchEvent): void {
    cancel()
    const element = surface.value
    const touch = event.touches[0]
    const target = event.target
    if (blocked.value || !element || !touch || event.touches.length !== 1 || !acceptsTarget(target, element)) {
      return
    }
    const viewport = window.visualViewport
    const zoom = viewport?.scale ?? 1
    const atBoundary = atEdge(element, viewport)
    if (!bottom && !atBoundary && zoom <= 1.01) return
    const start = fingerPosition(touch, zoom, viewport)
    pull = {
      id: touch.identifier,
      start,
      scale: zoom,
      edge: atBoundary ? { ...start, viewportLeft: viewport?.offsetLeft ?? 0 } : undefined,
      time: event.timeStamp,
      velocity: 0,
    }
  }

  async function end(event: TouchEvent): Promise<void> {
    const current = detach()
    if (!current || current.rawOffset === undefined) return
    const velocity = event.timeStamp - current.time < 80 ? current.velocity : 0
    const shouldRefresh =
      options.edge === 'top' &&
      event.touches.length === 0 &&
      distance.value >= triggerDistance &&
      !blocked.value &&
      viewportAtEdge(current, window.visualViewport)
    if (!shouldRefresh) {
      settle(0, velocity)
      return
    }
    settle(holdDistance, velocity)
    try {
      await options.refresh()
    } finally {
      settle(0)
    }
  }

  const target = computed(() => (bottom && blocked.value ? null : surface.value))
  useEventListener(target, 'touchstart', start, { passive: true })
  useEventListener(target, 'touchmove', move, { capture: true, passive: false })
  useEventListener(target, 'touchend', end, { passive: true })
  useEventListener(target, 'touchcancel', cancel, { passive: true })
  watch(blocked, (value) => {
    if (!value) return
    if (bottom) {
      detach()
      stop()
      position.y = 0
    } else cancel()
  })

  return { offset, ready }
}

export function useScrollEdgeFeedback(
  surface: Readonly<Ref<HTMLElement | null>>,
  reducedMotion: Readonly<Ref<boolean>>,
  refreshBlocked: Readonly<Ref<boolean>>,
  refresh: () => Promise<void>,
  reachedEnd: Readonly<Ref<boolean>>,
) {
  const { offset: pullOffset, ready: pullReady } = useScrollEdgePull(surface, refreshBlocked, reducedMotion, {
    edge: 'top',
    refresh,
  })
  const { offset: endOffset } = useScrollEdgePull(
    surface,
    computed(() => !reachedEnd.value),
    reducedMotion,
    { edge: 'bottom' },
  )
  const contentOffset = computed(() => pullOffset.value - endOffset.value)
  return { pullOffset, pullReady, endOffset, contentOffset }
}
