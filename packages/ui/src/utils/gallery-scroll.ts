import type { InjectionKey, Ref, ShallowRef } from 'vue'

export interface GalleryScrollAnchor {
  href: string
  group: string
  offset: number
}

export interface GalleryScrollPosition {
  scrollTop: number
  anchor?: GalleryScrollAnchor
}

export interface GalleryResizePosition {
  anchor: GalleryScrollAnchor
  scrollTop?: number
}

export const galleryResizePositionKey: InjectionKey<ShallowRef<GalleryResizePosition | undefined>> =
  Symbol('gallery resize position')

export const galleryViewportKey: InjectionKey<{
  viewport: Readonly<Ref<HTMLElement | null>>
  restoration: Readonly<Ref<GalleryScrollAnchor | undefined>>
  returningToTop: Readonly<Ref<boolean>>
}> = Symbol('gallery viewport')

export function captureScrollPosition(
  viewport: HTMLElement | null,
  source?: EventTarget | null,
): GalleryScrollPosition {
  return { scrollTop: viewport?.scrollTop ?? 0, anchor: viewport ? captureGalleryAnchor(viewport, source) : undefined }
}

function captureGalleryAnchor(viewport: HTMLElement, source?: EventTarget | null): GalleryScrollAnchor | undefined {
  const clicked = source instanceof HTMLElement ? source.closest<HTMLElement>('[data-gallery-href]') : null
  if (!viewport.scrollTop && !clicked) return
  const bounds = viewport.getBoundingClientRect()
  const visibleTop = Math.max(bounds.top, viewport.querySelector('.masthead')?.getBoundingClientRect().bottom ?? 0)
  const isVisible = (card: HTMLElement) => {
    const { top, bottom } = card.getBoundingClientRect()
    return bottom > visibleTop && top < bounds.bottom
  }
  const card =
    clicked && viewport.contains(clicked) && isVisible(clicked)
      ? clicked
      : Array.from(viewport.querySelectorAll<HTMLElement>('[data-gallery-href]')).find(isVisible)
  const href = card?.dataset.galleryHref
  const group = card?.closest<HTMLElement>('[data-gallery-group]')?.dataset.galleryGroup
  if (card && href && group) return { href, group, offset: card.getBoundingClientRect().top - bounds.top }
}
