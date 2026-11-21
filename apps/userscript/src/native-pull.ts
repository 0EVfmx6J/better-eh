import { themeStorageKey } from '@better-eh/ui'
import styles from './native-pull.css?inline'

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function pullTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem(themeStorageKey)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // Storage can be blocked on native pages.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function createNativePull(id: string, resume: () => Promise<void>) {
  const host = document.createElement('div')
  host.id = id
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = styles
  const button = document.createElement('button')
  button.type = 'button'
  button.setAttribute('aria-label', '切回 Better EH')
  button.title = '切回 Better EH'
  const cord = document.createElement('span')
  cord.className = 'cord'
  const handle = document.createElement('span')
  handle.className = 'handle'
  button.append(cord, handle)
  shadow.append(style, button)
  const stowed = 'translateY(calc(-100% - 48px - env(safe-area-inset-top)))'
  const resting = 'translateY(0)'

  button.addEventListener('click', async () => {
    button.disabled = true
    let pull: Animation[] = []
    if (!prefersReducedMotion()) {
      const timing = { duration: 140, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', fill: 'forwards' } as const
      const stretch = 1 + 17 / cord.offsetHeight
      pull = [
        cord.animate({ transform: ['scaleY(1)', `scaleY(${stretch})`] }, timing),
        handle.animate({ transform: ['translateY(0)', 'translateY(17px)'] }, timing),
      ]
      await Promise.allSettled(pull.map((animation) => animation.finished))
    }
    try {
      await resume()
    } finally {
      pull.forEach((animation) => animation.cancel())
      button.disabled = false
    }
  })

  async function show(animate: boolean): Promise<void> {
    button.dataset.theme = pullTheme()
    button.disabled = true
    document.body.append(host)
    await move(resting, animate, 70)
    button.disabled = false
  }

  async function hide(animate: boolean): Promise<void> {
    await move(stowed, animate)
    host.remove()
  }

  async function move(to: string, animate: boolean, delay = 0): Promise<void> {
    const from = to === stowed ? resting : stowed
    host.style.transform = to
    if (!animate || prefersReducedMotion()) return
    const motion = host.animate(
      { transform: [from, to] },
      {
        duration: 260,
        delay,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'backwards',
      },
    )
    await motion.finished.catch(() => undefined)
  }

  return { show, hide, focus: () => button.focus({ preventScroll: true }) }
}
