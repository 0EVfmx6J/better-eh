import { computed, onScopeDispose, shallowReactive, watch, type Ref } from 'vue'
import type { ReaderFrame } from '@better-eh/core'
import { usePageCacheStore } from '../stores/page-cache'

export function useReaderImages<T extends ReaderFrame>(
  frames: Readonly<Ref<readonly T[]>>,
  revision: Readonly<Ref<number>>,
  loadImage: (frame: ReaderFrame, signal: AbortSignal) => Promise<ReaderFrame>,
  viewActive?: Readonly<Ref<boolean>>,
) {
  const cache = usePageCacheStore()
  const brokenImages = shallowReactive(new Set<string>())
  const imageRetryErrors = shallowReactive(new Map<string, string>())
  const requests = shallowReactive(new Map<string, AbortController>())
  const replacements = shallowReactive(new Map<string, ReaderFrame>())
  const readerFrames = computed(() =>
    frames.value.map((frame) => {
      const replacement = replacements.get(frame.href) ?? cache.getReaderImage(frame.href)
      return replacement
        ? { ...frame, ...replacement, href: frame.href, originalHref: replacement.originalHref ?? frame.originalHref }
        : frame
    }),
  )

  function cancelRetries(): void {
    for (const request of requests.values()) request.abort()
    requests.clear()
  }

  watch(
    revision,
    () => {
      cancelRetries()
      brokenImages.clear()
      imageRetryErrors.clear()
      replacements.clear()
    },
    { flush: 'sync' },
  )
  if (viewActive)
    watch(viewActive, (active) => {
      if (!active) cancelRetries()
    })
  onScopeDispose(cancelRetries)

  function markBroken(frame: ReaderFrame): void {
    const { href, image } = frame
    const initial = frames.value.find((item) => item.href === href)
    const replaced = replacements.get(href)
    const cached = cache.getReaderImage(href)
    // Ignore events from an image that has already been replaced.
    if (!initial || (replaced ?? cached ?? initial).image !== image) return
    const expired = cache.forgetReaderImage(href, image)
    if (expired && !replaced && initial.image !== image) return
    brokenImages.add(href)
  }

  function rememberImage(frame: ReaderFrame, size: { width: number; height: number }): void {
    const candidate = replacements.get(frame.href)
    if (candidate?.image !== frame.image) return
    const initial = frames.value.find((item) => item.href === frame.href)
    if (initial && initial.image !== frame.image) cache.setReaderImage({ ...frame, ...size })
  }

  function canRetry(href: string): boolean {
    return brokenImages.has(href) && !requests.has(href) && viewActive?.value !== false
  }

  function loadOriginalImage(frame: ReaderFrame): void {
    const { href, originalHref } = frame
    if (!originalHref || !canRetry(href)) return
    replacements.set(href, { ...frame, image: originalHref })
    imageRetryErrors.delete(href)
    brokenImages.delete(href)
  }

  async function retryImage(frame: ReaderFrame): Promise<void> {
    const { href } = frame
    if (!canRetry(href)) return
    imageRetryErrors.delete(href)
    if (!frame.reloadHref) {
      if (frame.image === frame.originalHref) replacements.delete(href)
      brokenImages.delete(href)
      return
    }

    const request = new AbortController()
    requests.set(href, request)
    try {
      const replacement = await loadImage(frame, request.signal)
      if (request.signal.aborted) return
      replacements.set(href, replacement)
      brokenImages.delete(href)
    } catch (error) {
      if (!request.signal.aborted) {
        imageRetryErrors.set(href, error instanceof Error ? error.message : '无法重新加载图片。')
      }
    } finally {
      if (requests.get(href) === request) requests.delete(href)
    }
  }

  return {
    readerFrames,
    brokenImages,
    imageRetryErrors,
    retryingImages: requests,
    markBroken,
    rememberImage,
    retryImage,
    loadOriginalImage,
  }
}
