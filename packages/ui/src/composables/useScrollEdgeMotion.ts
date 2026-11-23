import { useSpring } from '@vueuse/motion'
import { onScopeDispose, reactive, type Ref } from 'vue'

const minReboundSpeed = 60
const maxReboundDistance = 40
const maxImpactAge = 1000 / 60

export function useScrollEdgeMotion(reducedMotion: Readonly<Ref<boolean>>) {
  const position = reactive({ y: 0 })
  const spring = { stiffness: 340, damping: 37, restDelta: 0.15, restSpeed: 3, velocity: 0 }
  const { set, stop: stopSpring } = useSpring(position, spring)
  let reboundFrame = 0

  function stop(): void {
    cancelAnimationFrame(reboundFrame)
    stopSpring()
  }

  function settle(target: number, velocity = 0): void {
    stop()
    if (reducedMotion.value) position.y = target
    else {
      spring.velocity = velocity
      set({ y: target })
    }
  }

  function rebound(speed: number, impactAge = 0): boolean {
    if (reducedMotion.value || speed < minReboundSpeed) return false
    stop()
    // A critically damped spring starting at zero has an initial slope of speed.
    // Bound the travel by increasing damping for faster flings.
    const decay = Math.max(spring.damping / 2, speed / (Math.E * maxReboundDistance))
    const started = performance.now() - Math.min(maxImpactAge, impactAge)
    const frame = (now: number) => {
      const seconds = Math.max(0, now - started) / 1000
      const stretch = speed * seconds * Math.exp(-decay * seconds)
      if (seconds > 1 / decay && stretch < spring.restDelta) {
        position.y = 0
        return
      }
      position.y = stretch
      reboundFrame = requestAnimationFrame(frame)
    }
    frame(performance.now())
    return true
  }

  onScopeDispose(stop)
  return { position, settle, rebound, stop }
}
