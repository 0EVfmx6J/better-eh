import { useEventListener } from '@vueuse/core'
import { inject, provide, shallowRef } from 'vue'
import { galleryResizePositionKey, galleryViewportKey, type GalleryResizePosition } from '../utils/gallery-scroll'

export function provideGalleryResizePosition(): void {
  const viewport = inject(galleryViewportKey)?.viewport
  const resizePosition = shallowRef<GalleryResizePosition>()
  provide(galleryResizePositionKey, resizePosition)
  useEventListener(
    () => viewport?.value,
    'scroll',
    () => {
      const scroll = viewport?.value
      const top = resizePosition.value?.scrollTop
      if (!scroll || top === undefined || Math.abs(scroll.scrollTop - top) <= 1) return
      // A taller viewport can clamp scrollTop at the end before the resize is applied.
      const clampedTop = Math.min(top, Math.max(0, scroll.scrollHeight - scroll.clientHeight))
      if (Math.abs(scroll.scrollTop - clampedTop) > 1) resizePosition.value = undefined
    },
    { passive: true },
  )
}
