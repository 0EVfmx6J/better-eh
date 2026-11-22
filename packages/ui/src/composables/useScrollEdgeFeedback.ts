import { useEventListener, useResizeObserver } from '@vueuse/core'
import { useSpring } from '@vueuse/motion'
import { computed, onScopeDispose, reactive, shallowRef, watch, type Ref } from 'vue'

const triggerDistance = 56
const holdDistance = 52
const maxDistance = 150
const resistance = 0.55
const slop = 6
const momentumGap = 120
const minReboundSpeed = 150
const maxReboundSpeed = 1800
type LoadDirection = 'next' | 'previous'

interface Pull {
  listeners: AbortController
  id: number
  start: { x: number; y: number }
  vertical?: boolean
  scale: number
  edge?: { x: number; y: number; viewportLeft: number }
  nativeScroll: boolean
  rawOffset?: number
  loadingHandoff?: boolean
  layoutAnchor?: HTMLElement
  holdingSpring: boolean
  lastFingerY: number
  lastEdgeDistance: number
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
  indicatorEnabled: Readonly<Ref<boolean>>,
  bounceAtLoadingEdge: Readonly<Ref<boolean>>,
  reducedMotion: Readonly<Ref<boolean>>,
  options: { edge: 'top'; refresh: () => Promise<void> } | { edge: 'bottom' },
) {
  const bottom = options.edge === 'bottom'
  const edgeIndicator = bottom ? 'limit' : 'refresh'
  const blocked = computed(() => !indicatorEnabled.value && !bounceAtLoadingEdge.value)
  const direction = bottom ? -1 : 1
  const position = reactive({ y: 0 })
  const spring = { stiffness: 340, damping: 37, restDelta: 0.15, restSpeed: 3, velocity: 0 }
  const { set, stop } = useSpring(position, spring)
  const dragging = shallowRef(false)
  const indicator = shallowRef<'refresh' | 'limit'>()
  const scale = shallowRef(1)
  const distance = computed(() => Math.max(0, position.y))
  const offset = computed(() => distance.value / scale.value)
  const carriedOffset = shallowRef(0)
  const totalOffset = computed(() => offset.value + carriedOffset.value)
  const ready = computed(
    () => indicator.value === 'refresh' && dragging.value && totalOffset.value * scale.value >= triggerDistance,
  )
  const needsMore = computed(() => bounceAtLoadingEdge.value && (dragging.value || carriedOffset.value > 0))
  let pull: Pull | undefined
  let momentum: { top: number; time: number; speed?: number } | undefined

  function edgeDistance(element: HTMLElement): number {
    return bottom ? element.scrollHeight - element.clientHeight - element.scrollTop : element.scrollTop
  }

  function atEdge(element: HTMLElement, viewport: VisualViewport | null): boolean {
    if (edgeDistance(element) > 1) return false
    // At a scroll edge the zoomed visual viewport may still have room to pan.
    if (!bottom) return (viewport?.offsetTop ?? 0) <= 1
    return (
      !viewport ||
      viewport.scale <= 1.01 ||
      viewport.offsetTop + viewport.height >= element.getBoundingClientRect().bottom - 1
    )
  }

  function viewportAtEdge(current: Pull, viewport: VisualViewport | null): boolean {
    const element = surface.value
    return (
      !!element &&
      atEdge(element, viewport) &&
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
    current?.listeners.abort()
    pull = undefined
    dragging.value = false
    return current
  }

  function cancel(): void {
    momentum = undefined
    const current = detach()
    if (current && !releaseCarriedOffset(0) && (current.rawOffset !== undefined || current.holdingSpring)) settle(0)
  }

  function leaveEdge(current: Pull, edgeMoved = false): void {
    current.edge = undefined
    if (current.rawOffset === undefined && !current.holdingSpring) return
    current.rawOffset = undefined
    current.holdingSpring = false
    dragging.value = false
    if (edgeMoved) {
      indicator.value = undefined
      settle(0)
    } else position.y = 0
  }

  function absorbOffset(element: HTMLElement, pixels: number): void {
    const before = element.scrollTop
    element.scrollTo({ top: before - direction * pixels, behavior: 'instant' })
    const remaining = pixels + direction * (element.scrollTop - before)
    // If the new scroll range is too short, hold the part that didn't fit.
    carriedOffset.value = remaining > 1 ? remaining : 0
  }

  function mergeCarriedOffset(): void {
    position.y += carriedOffset.value * scale.value
    carriedOffset.value = 0
  }

  function releaseCarriedOffset(velocity: number): boolean {
    if (!carriedOffset.value) return false
    const element = surface.value
    if (element && edgeDistance(element) > 1) absorbOffset(element, carriedOffset.value)
    if (!carriedOffset.value) return false
    mergeCarriedOffset()
    indicator.value = indicatorEnabled.value ? edgeIndicator : undefined
    settle(0, velocity)
    return true
  }

  function captureLoad() {
    const current = pull
    const element = surface.value
    if (!current || !element || indicator.value === 'refresh') return
    if (
      !current.loadingHandoff &&
      (indicator.value || !totalOffset.value || (!dragging.value && !current.holdingSpring))
    )
      return
    return {
      anchor: current.layoutAnchor,
      restore(anchor: HTMLElement | undefined, shift: number): boolean {
        if (pull !== current || surface.value !== element) return false
        const pixels = totalOffset.value - direction * shift
        leaveEdge(current)
        absorbOffset(element, pixels)
        current.loadingHandoff = true
        current.layoutAnchor = anchor
        current.lastEdgeDistance = Math.max(0, edgeDistance(element))
        current.velocity = 0
        return true
      },
    }
  }

  function rebound(speed: number): void {
    if (reducedMotion.value || speed < minReboundSpeed) return
    indicator.value = undefined
    scale.value = 1
    // Start at the boundary and let the incoming velocity stretch the spring.
    position.y = 0
    settle(0, Math.min(speed, maxReboundSpeed))
  }

  function trackMomentum(event: Event): void {
    const previous = momentum
    const element = surface.value
    if (!previous || !element) return
    const top = element.scrollTop
    const elapsed = event.timeStamp - previous.time
    const advance = direction * (previous.top - top)
    const viewport = window.visualViewport
    if (blocked.value || elapsed > momentumGap || advance < 0 || (viewport?.scale ?? 1) > 1.01) {
      momentum = undefined
      return
    }
    // A repeated scroll position can arrive during the same fling.
    if (advance === 0) return
    const speed = (advance * 1000) / Math.max(8, elapsed)
    if (atEdge(element, viewport)) {
      momentum = undefined
      // The final scroll sample is clamped by the edge, so prefer the last full sample.
      rebound(previous.speed ?? speed)
    } else {
      momentum = { top, time: event.timeStamp, speed }
    }
  }

  function acceptsTarget(target: EventTarget | null, element: HTMLElement): boolean {
    return (
      !(target instanceof Element) ||
      (target.closest('dialog') === element.closest('dialog') &&
        !target.closest('input, select, textarea, [contenteditable], .site-sidebar, .tag-suggestions'))
    )
  }

  function move(event: TouchEvent): void {
    const current = pull
    if (!current) return
    const element = surface.value
    const viewport = window.visualViewport
    const touch = event.touches[0]
    if (
      !element ||
      !touch ||
      event.touches.length !== 1 ||
      touch.identifier !== current.id ||
      blocked.value ||
      Math.abs((viewport?.scale ?? 1) - current.scale) > 0.01
    ) {
      cancel()
      return
    }

    const finger = fingerPosition(touch, current.scale, viewport)
    if (!current.vertical) {
      const dx = Math.abs(finger.x - current.start.x)
      const dy = Math.abs(finger.y - current.start.y)
      if (Math.max(dx, dy) < slop) return
      if (dx >= dy) {
        cancel()
        return
      }
      current.vertical = true
    }

    const previousEdgeDistance = current.lastEdgeDistance
    const travel = direction * (finger.y - current.lastFingerY)
    if (travel && !totalOffset.value) {
      current.loadingHandoff = false
      current.layoutAnchor = undefined
    }
    const elapsed = Math.max(8, event.timeStamp - current.time)
    current.velocity = (travel * 1000) / elapsed
    current.lastFingerY = finger.y
    current.lastEdgeDistance = Math.max(0, edgeDistance(element))
    current.time = event.timeStamp

    if (!viewportAtEdge(current, viewport)) {
      leaveEdge(current, true)
      if (current.scale <= 1.01) current.nativeScroll = true
      return
    }
    if (!current.edge) {
      if (travel <= 0) return
      // Carry only the part of this move that the native scroller could not consume.
      const overshoot = current.scale <= 1.01 ? Math.max(0, travel - previousEdgeDistance) : 0
      current.edge = { x: finger.x, y: finger.y - direction * overshoot, viewportLeft: viewport?.offsetLeft ?? 0 }
    }

    const dy = direction * (finger.y - current.edge.y)
    if (travel < 0 && (current.rawOffset ?? 0) + dy <= slop) {
      leaveEdge(current)
      return
    }
    if (current.rawOffset === undefined) {
      const dx = Math.abs(finger.x - current.edge.x)
      if (dy < slop || dy <= dx) return
      stop()
      // Resume a settling spring at its current displacement if grabbed again.
      const stretch = offset.value * current.scale
      const rest = Math.min(stretch, maxDistance - 1)
      carriedOffset.value += (stretch - rest) / current.scale
      position.y = rest
      current.rawOffset = (rest * maxDistance) / (resistance * (maxDistance - rest))
      current.holdingSpring = false
      scale.value = current.scale
      indicator.value = indicatorEnabled.value ? edgeIndicator : undefined
      dragging.value = true
    }

    // Let native scrolling resume as soon as the loading boundary extends.
    if (indicator.value && event.cancelable && current.scale <= 1.01) event.preventDefault()
    const next = damp(current.rawOffset + dy - slop)
    current.velocity = Math.max(-600, Math.min(600, ((next - distance.value) * 1000) / elapsed))
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
    const holdingSpring = atBoundary && distance.value > 0
    if (holdingSpring) stop()
    const start = fingerPosition(touch, zoom, viewport)
    const listeners = new AbortController()
    pull = {
      listeners,
      id: touch.identifier,
      start,
      scale: zoom,
      holdingSpring,
      edge: atBoundary ? { ...start, viewportLeft: viewport?.offsetLeft ?? 0 } : undefined,
      nativeScroll: !atBoundary && zoom <= 1.01,
      lastFingerY: start.y,
      lastEdgeDistance: Math.max(0, edgeDistance(element)),
      time: event.timeStamp,
      velocity: 0,
    }
    // A virtual row can unmount under the finger. Touch events still go to its original target.
    const source = target ?? element
    const { signal } = listeners
    const onMove: EventListener = (event) => move(event as TouchEvent)
    const onEnd: EventListener = (event) => void end(event as TouchEvent)
    source.addEventListener('touchmove', onMove, { capture: true, passive: false, signal })
    source.addEventListener('touchend', onEnd, { passive: true, signal })
    source.addEventListener('touchcancel', cancel, { passive: true, signal })
  }

  async function end(event: TouchEvent): Promise<void> {
    const readyToRefresh = ready.value
    const current = detach()
    if (!current) return
    const velocity = event.timeStamp - current.time < 80 ? current.velocity : 0
    if (
      options.edge === 'top' &&
      readyToRefresh &&
      event.touches.length === 0 &&
      indicatorEnabled.value &&
      viewportAtEdge(current, window.visualViewport)
    ) {
      mergeCarriedOffset()
      settle(holdDistance, velocity)
      try {
        await options.refresh()
      } finally {
        settle(0)
      }
      return
    }
    if (releaseCarriedOffset(velocity)) return
    if (current.holdingSpring) {
      settle(0)
      return
    }
    if (current.rawOffset === undefined) {
      const element = surface.value
      if (current.nativeScroll && !blocked.value && element && velocity >= minReboundSpeed && !event.touches.length) {
        // Continue observing native momentum after the finger lifts.
        if (atEdge(element, window.visualViewport)) rebound(velocity)
        else if (!reducedMotion.value) momentum = { top: element.scrollTop, time: event.timeStamp }
      }
      return
    }
    settle(0, velocity)
  }

  function reconcileEdge(): void {
    const current = pull
    const element = surface.value
    if (!current || !element || atEdge(element, window.visualViewport)) return
    if (carriedOffset.value && edgeDistance(element) > 1) absorbOffset(element, carriedOffset.value)
    if (current.edge && !atEdge(element, window.visualViewport)) {
      leaveEdge(current, true)
      if (current.scale <= 1.01) current.nativeScroll = true
    }
  }

  const target = computed(() => (bottom && blocked.value ? null : surface.value))
  useEventListener(target, 'touchstart', start, { passive: true })
  useEventListener(target, 'scroll', trackMomentum, { passive: true })
  useEventListener(target, ['pointerdown', 'wheel', 'keydown', 'scrollend'], () => (momentum = undefined), {
    passive: true,
  })
  watch(blocked, (value) => {
    if (!value) return
    cancel()
    if (bottom) {
      carriedOffset.value = 0
      stop()
      position.y = 0
    }
  })
  onScopeDispose(() => {
    detach()
    stop()
  })

  const revealOffset = computed(() => Math.min(maxDistance / scale.value, totalOffset.value))
  const refreshOffset = computed(() =>
    !bottom && (indicator.value === 'refresh' || (indicatorEnabled.value && carriedOffset.value))
      ? revealOffset.value
      : 0,
  )
  const limitOffset = computed(() =>
    bottom && indicatorEnabled.value && (indicator.value === 'limit' || carriedOffset.value) ? revealOffset.value : 0,
  )
  return { totalOffset, carriedOffset, ready, refreshOffset, limitOffset, needsMore, reconcileEdge, captureLoad }
}

export function useScrollEdgeFeedback(
  surface: Readonly<Ref<HTMLElement | null>>,
  content: Readonly<Ref<HTMLElement | null>>,
  reducedMotion: Readonly<Ref<boolean>>,
  refreshBlocked: Readonly<Ref<boolean>>,
  refresh: () => Promise<void>,
  reachedEnd: Readonly<Ref<boolean>>,
  loadingEdges: Readonly<Ref<{ top: boolean; bottom: boolean }>>,
) {
  const top = useScrollEdgePull(
    surface,
    computed(() => !refreshBlocked.value),
    computed(() => loadingEdges.value.top),
    reducedMotion,
    { edge: 'top', refresh },
  )
  const bottom = useScrollEdgePull(
    surface,
    reachedEnd,
    computed(() => loadingEdges.value.bottom),
    reducedMotion,
    { edge: 'bottom' },
  )
  useResizeObserver(
    () => [surface.value, content.value],
    () => {
      top.reconcileEdge()
      bottom.reconcileEdge()
    },
  )
  const contentOffset = computed(() => top.totalOffset.value - bottom.totalOffset.value)
  const edgePreload = computed(() => (top.needsMore.value ? 'previous' : bottom.needsMore.value ? 'next' : undefined))
  return {
    pullReady: top.ready,
    refreshOffset: top.refreshOffset,
    endOffset: bottom.limitOffset,
    contentOffset,
    edgePreload,
    captureLoad: (direction?: LoadDirection) =>
      direction ? (direction === 'previous' ? top : bottom).captureLoad() : (top.captureLoad() ?? bottom.captureLoad()),
    clearHandoff: () => {
      top.carriedOffset.value = 0
      bottom.carriedOffset.value = 0
    },
  }
}
