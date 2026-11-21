export async function stopScrollMomentum(viewport: HTMLElement): Promise<void> {
  // Let WebKit render a frame with scrolling disabled to stop deceleration.
  viewport.classList.add('stop-scroll')
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  viewport.classList.remove('stop-scroll')
}
