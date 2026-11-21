import { useTimeoutFn } from '@vueuse/core'
import { onScopeDispose, shallowReactive, watch, type Ref } from 'vue'
import type { ReaderFrame, Thumbnail } from '@better-eh/core'

interface PreviewFrame extends ReaderFrame {
  chapter: number
}

export function useReaderPreviews(
  frames: Readonly<Ref<readonly PreviewFrame[]>>,
  visible: Readonly<Ref<boolean>>,
  loadThumbnails: (chapter: number, index: number, signal: AbortSignal) => Promise<Thumbnail[]>,
) {
  const previews = shallowReactive(new Map<number, Map<number, Thumbnail>>())
  const loadedImages = shallowReactive(new Map<string, string>())
  const attempted = new Set<string>()
  let request: AbortController | undefined
  const { start: schedule, stop } = useTimeoutFn(loadNext, 120, { immediate: false })

  function previewFor(frame: PreviewFrame): Thumbnail | undefined {
    if (loadedImages.get(frame.href) === frame.image) return undefined
    return previews.get(frame.chapter)?.get(frame.index)
  }

  function markLoaded(frame: PreviewFrame): void {
    loadedImages.set(frame.href, frame.image)
  }

  function markFailed(frame: PreviewFrame): void {
    loadedImages.delete(frame.href)
    schedule()
  }

  async function loadNext(): Promise<void> {
    if (!visible.value || request) return
    const frame = frames.value.find(
      (frame) =>
        loadedImages.get(frame.href) !== frame.image &&
        !previews.get(frame.chapter)?.has(frame.index) &&
        !attempted.has(frame.href),
    )
    if (!frame) return

    const controller = new AbortController()
    request = controller
    try {
      const items = await loadThumbnails(frame.chapter, frame.index, controller.signal)
      if (!controller.signal.aborted) {
        const batch = new Map(previews.get(frame.chapter))
        for (const item of items) if (item.image) batch.set(item.index, item)
        previews.set(frame.chapter, batch)
        attempted.add(frame.href)
      }
    } catch {
      if (!controller.signal.aborted) {
        for (const candidate of frames.value) {
          if (candidate.chapter === frame.chapter) attempted.add(candidate.href)
        }
        attempted.add(frame.href)
      }
    } finally {
      if (request === controller) {
        request = undefined
        if (visible.value) schedule()
      }
    }
  }

  function cancel(): void {
    stop()
    request?.abort()
    request = undefined
  }

  watch(
    [frames, visible],
    ([, active]) => {
      if (active) schedule()
      else cancel()
    },
    { immediate: true, flush: 'post' },
  )
  onScopeDispose(cancel)

  return { previewFor, markLoaded, markFailed }
}
