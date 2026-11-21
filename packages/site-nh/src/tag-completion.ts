import { searchTokenAt, type CompleteTags, type TagCompletion } from '@better-eh/core'
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

export function tagCompletionContext(query: string, caret: number) {
  const token = searchTokenAt(query, caret)
  if (!token) return undefined

  const { start, end, existing } = token
  const input = query.slice(start, caret).normalize('NFKC').toLowerCase()
  const sign = input.startsWith('-') ? '-' : ''
  const value = input.slice(sign.length)
  const colon = value.indexOf(':')
  const type = colon === -1 ? undefined : tagTypes.get(value.slice(0, colon))
  if (colon !== -1 && !type) return undefined
  const needle = value
    .slice(colon + 1)
    .replace(/^"/, '')
    .trim()
  if (!needle || needle.includes('"')) return undefined

  const prefix = query.slice(0, start)
  const suffix = query.slice(end) || ' '
  return {
    type,
    needle,
    replace(key: string, label: string): TagCompletion | undefined {
      const colon = key.indexOf(':')
      const replacement = sign + key.slice(0, colon + 1) + '"' + key.slice(colon + 1) + '"'
      if (existing.has(replacement.toLowerCase())) return undefined
      return { key, label, query: prefix + replacement + suffix, caret: start + replacement.length + 1 }
    },
  }
}

export const completeTags: CompleteTags = async (query, caret, signal) => {
  const context = tagCompletionContext(query, caret)
  if (!context || (context.needle.length < 2 && !containsHan.test(context.needle))) return []
  const matches = await findTags(context.needle, context.type, signal)
  return matches.flatMap(({ key, label }) => context.replace(key, label) ?? [])
}
