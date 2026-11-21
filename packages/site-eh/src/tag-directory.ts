import { createTagDirectoryLoader, type TagDirectory } from '@better-eh/core'

// EhTagTranslation Database v7.30120.1 (CC BY-NC-SA 3.0 CN).
const dictionaryPath = 'EhTagTranslation/Database'
const dictionaryRevision = '932608f817bcbe709a56248d2b7fd954b898b009'
const dictionarySources = [
  'https://raw.githubusercontent.com/' + dictionaryPath + '/' + dictionaryRevision + '/db.text.json',
  'https://cdn.jsdelivr.net/gh/' + dictionaryPath + '@' + dictionaryRevision + '/db.text.json',
]
const namespaceAliases = new Map([
  ['a', 'artist'],
  ['c', 'character'],
  ['cos', 'cosplayer'],
  ['f', 'female'],
  ['g', 'group'],
  ['l', 'language'],
  ['loc', 'location'],
  ['m', 'male'],
  ['o', 'other'],
  ['p', 'parody'],
  ['r', 'reclass'],
  ['x', 'mixed'],
])

interface Entry {
  key: string
  namespace: string
  term: string
  label: string
  normalizedLabel: string
}

function normalize(text: string): string {
  return text.normalize('NFKC').trim().toLowerCase()
}

export function exactTagTerm(key: string): string {
  const colon = key.indexOf(':')
  const prefix = colon < 0 ? '' : key.slice(0, colon + 1)
  const tag = key.slice(colon + 1)
  return prefix + '"' + tag + '$"'
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function makeDirectory(raw: unknown): TagDirectory {
  if (!record(raw) || !Array.isArray(raw.data)) throw new Error('标签词库格式有误。')

  const entries: Entry[] = []
  const translations = new Map<string, string>()
  const namespaces = new Set(namespaceAliases.values())
  for (const group of raw.data as unknown[]) {
    if (!record(group) || typeof group.namespace !== 'string' || !record(group.data)) continue
    const namespace = group.namespace
    if (!namespaces.has(namespace)) continue
    for (const [term, item] of Object.entries(group.data)) {
      if (!record(item) || typeof item.name !== 'string' || /["$\\\r\n]/.test(term)) continue
      const key = namespace + ':' + term
      const label = item.name.trim()
      if (!label) continue
      entries.push({ key, namespace, term, label, normalizedLabel: normalize(label) })
      translations.set(normalize(key), label)
    }
  }
  if (!entries.length) throw new Error('标签词库为空。')

  return {
    translate(key) {
      const value = normalize(key)
      const colon = value.indexOf(':')
      if (colon < 0) return undefined
      const namespace = value.slice(0, colon).trim()
      return translations.get((namespaceAliases.get(namespace) ?? namespace) + ':' + value.slice(colon + 1).trim())
    },
    complete(query, caret) {
      const tokens = Array.from(query.matchAll(/(?:[^\s"]+|"[^"]*(?:"|$))+/g))
      const token = tokens.find(({ index, 0: value }) => caret > index && caret <= index + value.length)
      if (!token) return []

      const start = token.index
      const end = start + token[0].length
      let input = normalize(query.slice(start, caret))
      const modifier = input.match(/^[-~]/)?.[0] ?? ''
      input = input.slice(modifier.length)
      const qualifier = input.startsWith('weak:') ? 'weak:' : ''
      input = input.slice(qualifier.length)

      const colon = input.indexOf(':')
      const prefix = colon < 0 ? '' : input.slice(0, colon)
      const namespace = namespaceAliases.get(prefix) ?? prefix
      if (namespace && namespace !== 'tag' && !namespaces.has(namespace)) return []
      const needle = input
        .slice(colon + 1)
        .replace(/^"|"$/g, '')
        .trim()
      if (!needle || needle.includes('$') || needle.includes('"')) return []

      const existing = new Set(tokens.filter((part) => part !== token).map((part) => part[0].toLowerCase()))
      const best: { entry: Entry; value: string; score: number }[] = []
      for (const entry of entries) {
        if (namespace && namespace !== 'tag' && namespace !== entry.namespace) continue
        const score = Math.min(matchScore(entry.term, needle), matchScore(entry.normalizedLabel, needle))
        if (!Number.isFinite(score) || score >= (best[7]?.score ?? Infinity)) continue
        const value = modifier + qualifier + exactTagTerm(entry.key)
        if (existing.has(value)) continue
        const rank = best.findIndex((result) => result.score > score)
        best.splice(rank < 0 ? best.length : rank, 0, { entry, value, score })
        if (best.length > 8) best.pop()
      }

      const suffix = query.slice(end)
      return best.map(({ entry, value }) => ({
        key: entry.key,
        label: entry.label,
        query: query.slice(0, start) + value + (suffix ? suffix : ' '),
        caret: start + value.length + 1,
      }))
    },
  }
}

function matchScore(value: string, needle: string): number {
  const index = value.indexOf(needle)
  if (index < 0) return Infinity
  if (value === needle) return 0
  return (index === 0 ? 100 : 200) + Math.min(value.length, 99)
}

export const loadTagDirectory = createTagDirectoryLoader(dictionarySources, async (response) =>
  makeDirectory(await response.json()),
)
