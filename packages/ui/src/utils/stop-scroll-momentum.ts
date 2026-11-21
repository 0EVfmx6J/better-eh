import { afterRenderedFrame } from './after-rendered-frame'

export async function stopScrollMomentum(viewport: HTMLElement): Promise<void> {
  // Let WebKit render a frame with scrolling disabled to stop deceleration.
  viewport.classList.add('stop-scroll')
  await afterRenderedFrame()
  viewport.classList.remove('stop-scroll')
}
