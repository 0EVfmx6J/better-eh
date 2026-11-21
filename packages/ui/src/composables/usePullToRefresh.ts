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
  x: number
  y: number
  rawOffset?: number
  time: number
  velocity: number
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
  const offset = computed(() => Math.max(0, position.y))
  const ready = computed(() => dragging.value && offset.value >= triggerDistance)
  let pull: Pull | undefined

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
    const touch = event.touches[0]
    if (!touch || event.touches.length !== 1 || touch.identifier !== current.id || !event.cancelable || blocked.value) {
      cancel()
      return
    }

    const dy = touch.clientY - current.y
    if (current.rawOffset === undefined) {
      const dx = Math.abs(touch.clientX - current.x)
      if (dy <= dx) {
        if (Math.max(dx, Math.abs(dy)) >= slop) cancel()
        return
      }
      if (!surface.value || surface.value.scrollTop > 1) {
        cancel()
        return
      }
      stop()
      // Resume a settling spring at its current displacement if grabbed again.
      const rest = Math.min(offset.value, maxDistance - 1)
      current.rawOffset = (rest * maxDistance) / (resistance * (maxDistance - rest))
      dragging.value = true
    }

    event.preventDefault()
    const distance = Math.max(0, current.rawOffset + dy - slop) * resistance
    const next = (maxDistance * distance) / (maxDistance + distance)
    const elapsed = Math.max(8, event.timeStamp - current.time)
    current.velocity = Math.max(-600, Math.min(600, ((next - offset.value) * 1000) / elapsed))
    current.time = event.timeStamp
    position.y = next
  }

  function start(event: TouchEvent): void {
    cancel()
    const element = surface.value
    const touch = event.touches[0]
    const target = event.target
    if (
      blocked.value ||
      !element ||
      !touch ||
      event.touches.length !== 1 ||
      element.scrollTop > 1 ||
      (window.visualViewport?.scale ?? 1) > 1.01 ||
      (target instanceof Element &&
        target.closest('input, select, textarea, [contenteditable], dialog, .filters, .site-sidebar, .tag-suggestions'))
    ) {
      return
    }
    pull = { id: touch.identifier, x: touch.clientX, y: touch.clientY, time: event.timeStamp, velocity: 0 }
  }

  async function end(event: TouchEvent): Promise<void> {
    const shouldRefresh = ready.value && !blocked.value
    const current = detach()
    if (!current || current.rawOffset === undefined) return
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
