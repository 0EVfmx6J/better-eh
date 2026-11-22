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

export function usePullToRefresh(
  surface: Readonly<Ref<HTMLElement | null>>,
  blocked: Readonly<Ref<boolean>>,
  reducedMotion: Readonly<Ref<boolean>>,
  refresh: () => Promise<void>,
) {
  const position = reactive({ y: 0 })
  const spring = { stiffness: 340, damping: 37, restDelta: 0.15, restSpeed: 3, velocity: 0 }
  const { set, stop } = useSpring(position, spring)
  const dragging = shallowRef(false)
  const scale = shallowRef(1)
  const distance = computed(() => Math.max(0, position.y))
  const offset = computed(() => distance.value / scale.value)
  const ready = computed(() => dragging.value && distance.value >= triggerDistance)
  let pull: Pull | undefined

  function atTop(): boolean {
    // A zoomed visual viewport can still pan up when the list itself is already at the top.
    return Boolean(surface.value && surface.value.scrollTop <= 1 && (window.visualViewport?.offsetTop ?? 0) <= 1)
  }

  function viewportStayedAtTop(current: Pull, viewport: VisualViewport | null): boolean {
    return (
      atTop() &&
      (!current.edge || Math.abs((viewport?.offsetLeft ?? 0) - current.edge.viewportLeft) * current.scale <= slop) &&
      Math.abs((viewport?.scale ?? 1) - current.scale) <= 0.01
    )
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
      (!event.cancelable && current.scale <= 1.01) ||
      Math.abs((viewport?.scale ?? 1) - current.scale) > 0.01
    ) {
      cancel()
      return
    }

    const finger = fingerPosition(touch, current.scale, viewport)
    if (!current.edge) {
      const dx = Math.abs(finger.x - current.start.x)
      const dy = finger.y - current.start.y
      if (Math.max(dx, Math.abs(dy)) >= slop && dy <= dx) cancel()
      else if (atTop()) current.edge = { ...finger, viewportLeft: viewport?.offsetLeft ?? 0 }
      return
    }
    if (!viewportStayedAtTop(current, viewport)) {
      cancel()
      return
    }

    const dy = finger.y - current.edge.y
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

    // Let the browser keep handling zoomed gestures, even while we measure the pull past the top edge.
    if (current.scale <= 1.01) event.preventDefault()
    const resisted = Math.max(0, current.rawOffset + dy - slop) * resistance
    const next = (maxDistance * resisted) / (maxDistance + resisted)
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
    const viewport = window.visualViewport
    const zoom = viewport?.scale ?? 1
    const atEdge = atTop()
    if (
      blocked.value ||
      !element ||
      !touch ||
      event.touches.length !== 1 ||
      (!atEdge && zoom <= 1.01) ||
      (target instanceof Element &&
        (target.closest('dialog') !== element.closest('dialog') ||
          target.closest('input, select, textarea, [contenteditable], .filters, .site-sidebar, .tag-suggestions')))
    ) {
      return
    }
    const start = fingerPosition(touch, zoom, viewport)
    pull = {
      id: touch.identifier,
      start,
      scale: zoom,
      edge: atEdge ? { ...start, viewportLeft: viewport?.offsetLeft ?? 0 } : undefined,
      time: event.timeStamp,
      velocity: 0,
    }
  }

  async function end(event: TouchEvent): Promise<void> {
    const current = detach()
    if (!current || current.rawOffset === undefined) return
    const shouldRefresh =
      event.touches.length === 0 &&
      distance.value >= triggerDistance &&
      !blocked.value &&
      viewportStayedAtTop(current, window.visualViewport)
    const velocity = event.timeStamp - current.time < 80 ? current.velocity : 0
    if (!shouldRefresh) {
      settle(0, velocity)
      return
    }
    settle(holdDistance, velocity)
    try {
      await refresh()
    } finally {
      settle(0)
    }
  }

  useEventListener(surface, 'touchstart', start, { passive: true })
  // Install before touchstart so the first move is cancellable during a fast drag.
  useEventListener(surface, 'touchmove', move, { capture: true, passive: false })
  useEventListener(surface, 'touchend', end, { passive: true })
  useEventListener(surface, 'touchcancel', cancel, { passive: true })
  watch(blocked, (value) => {
    if (value) cancel()
  })

  return { offset, ready }
}
