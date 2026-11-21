import type { TagDirectory } from './types'

export function createTagDirectoryLoader(
  sources: readonly string[],
  parse: (response: Response) => Promise<TagDirectory>,
) {
  let directory: Promise<TagDirectory> | undefined

  async function download(): Promise<TagDirectory> {
    for (const source of sources) {
      const request = new AbortController()
      const timeout = setTimeout(() => request.abort(), 8_000)
      try {
        const response = await fetch(source, {
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          cache: 'force-cache',
          signal: request.signal,
        })
        if (response.ok) return await parse(response)
      } catch {
        // Try the next mirror if the host or the dictionary is unavailable.
      } finally {
        clearTimeout(timeout)
      }
    }
    throw new Error('标签词库加载失败。')
  }

  return () => {
    directory ??= download().catch((error: unknown) => {
      directory = undefined
      throw error
    })
    return directory
  }
}
