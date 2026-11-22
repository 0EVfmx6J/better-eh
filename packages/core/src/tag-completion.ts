import type { TagCompletion } from './types'

function normalize(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
}

function searchable(value: string) {
  const text = normalize(value)
  return { text, compact: text.replaceAll(' ', '') }
}

export function tagSearchEntry(namespace: string, key: string, name: string, label: string) {
  return { namespace, key, label, name: searchable(name), translation: searchable(label) }
}

export interface TagCompletionContext {
  namespace?: string
  needle: string
  phrase: boolean
  replace: (key: string, label: string) => TagCompletion | undefined
}

function matchScore(value: ReturnType<typeof searchable>, needle: ReturnType<typeof searchable>): number {
  if (value.text === needle.text) return 0
  if (value.compact === needle.compact) return 1
  const length = Math.min(value.text.length, 99)
  if (value.text.startsWith(needle.text)) return 100 + length
  if (value.compact.startsWith(needle.compact)) return 200 + length
  if (value.text.includes(needle.text)) return 300 + length
  return value.compact.includes(needle.compact) ? 400 + length : Infinity
}

export function completeTagEntries(
  entries: readonly ReturnType<typeof tagSearchEntry>[],
  contexts: readonly TagCompletionContext[],
): TagCompletion[] {
  for (const { namespace, needle, phrase, replace } of contexts) {
    const term = searchable(needle)
    if (!term.text) continue
    const best: { option: TagCompletion; score: number }[] = []
    for (const entry of entries) {
      if (namespace && entry.namespace !== namespace) continue
      // A phrase may span independent search terms, so require a full or prefix match before replacing it.
      const score = Math.min(matchScore(entry.name, term), matchScore(entry.translation, term))
      if (phrase && score >= 200) continue
      if (!Number.isFinite(score) || score >= (best[7]?.score ?? Infinity)) continue
      const option = replace(entry.key, entry.label)
      if (!option) continue
      const rank = best.findIndex((result) => result.score > score)
      best.splice(rank < 0 ? best.length : rank, 0, { option, score })
      if (best.length > 8) best.pop()
    }
    if (best.length) return best.map(({ option }) => option)
  }
  return []
}
