import { searchCompletionRanges, type CompleteTags, type TagCompletionContext } from '@better-eh/core'
import { tagNamespaces } from './urls'

const tagTypes = new Map<string, string>(
  tagNamespaces.flatMap(
    ([plural, type]) =>
      [
        [plural, type],
        [type, type],
      ] as const,
  ),
)
const namespaces = new Set<string>(tagNamespaces.map(([, type]) => type))
const cache = new Map<string, { key: string; label: string }[]>()
const limit = 10
export const containsHan = /\p{Script=Han}/u

async function findTags(query: string, type: string | undefined, signal: AbortSignal) {
  const cacheKey = `${type ?? ''}:${query}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  const response = await fetch('/api/v2/tags/search', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, query, limit }),
    signal,
  })
  if (!response.ok) throw new Error('标签联想请求失败。')
  const result: unknown = await response.json()
  if (!Array.isArray(result)) throw new Error('标签联想响应格式有误。')

  const rows: unknown[] = result
  const tags = new Map<string, { key: string; label: string }>()
  for (const row of rows.slice(0, limit)) {
    if (
      !row ||
      typeof row !== 'object' ||
      !('type' in row) ||
      typeof row.type !== 'string' ||
      !namespaces.has(row.type) ||
      (type && row.type !== type) ||
      !('name' in row) ||
      typeof row.name !== 'string'
    )
      continue
    const label = row.name.trim()
    if (!label || /["\\\r\n]/.test(label)) continue
    const key = `${row.type}:${label}`
    tags.set(key.toLowerCase(), { key, label })
  }
  const matches = [...tags.values()]
  cache.set(cacheKey, matches)
  const oldest = cache.keys().next().value
  if (cache.size > 64 && oldest) cache.delete(oldest)
  return matches
}

export function tagCompletionContexts(query: string, caret: number): TagCompletionContext[] {
  return searchCompletionRanges(query, caret).flatMap(({ start, end, existing, phrase }) => {
    const input = query.slice(start, caret).normalize('NFKC').toLowerCase()
    const sign = input.startsWith('-') ? '-' : ''
    const value = input.slice(sign.length)
    const colon = value.indexOf(':')
    const namespace = colon === -1 ? undefined : tagTypes.get(value.slice(0, colon))
    if (colon !== -1 && !namespace) return []
    const needle = value
      .slice(colon + 1)
      .replace(/^"/, '')
      .trim()
    if (!needle || needle.includes('"')) return []

    const prefix = query.slice(0, start)
    const suffix = query.slice(end) || ' '
    return [
      {
        namespace,
        needle,
        phrase,
        replace(key, label) {
          const colon = key.indexOf(':')
          const replacement = sign + key.slice(0, colon + 1) + '"' + key.slice(colon + 1) + '"'
          if (existing.has(replacement.toLowerCase())) return undefined
          return { key, label, query: prefix + replacement + suffix, caret: start + replacement.length + 1 }
        },
      },
    ]
  })
}

export const completeTags: CompleteTags = async (query, caret, signal) => {
  const contexts = tagCompletionContexts(query, caret)
  // Try the phrase and then the current word, keeping remote requests bounded.
  const candidates = contexts.length > 1 ? [contexts[0], contexts.at(-1)] : contexts
  for (const context of candidates) {
    if (!context || (context.needle.length < 2 && !containsHan.test(context.needle))) continue
    const matches = await findTags(context.needle, context.namespace, signal)
    const options = matches.flatMap(({ key, label }) => context.replace(key, label) ?? [])
    if (options.length) return options
  }
  return []
}
