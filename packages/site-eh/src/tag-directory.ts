import {
  completeTagEntries,
  createTagDirectoryLoader,
  searchCompletionRanges,
  tagSearchEntry,
  type SearchCompletionRange,
  type TagCompletionContext,
  type TagDirectory,
} from '@better-eh/core'

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

const namespaces = new Set(namespaceAliases.values())

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

  const entries: ReturnType<typeof tagSearchEntry>[] = []
  const translations = new Map<string, string>()
  for (const group of raw.data as unknown[]) {
    if (!record(group) || typeof group.namespace !== 'string' || !record(group.data)) continue
    const namespace = group.namespace
    if (!namespaces.has(namespace)) continue
    for (const [term, item] of Object.entries(group.data)) {
      if (!record(item) || typeof item.name !== 'string' || /["$\\\r\n]/.test(term)) continue
      const key = namespace + ':' + term
      const label = item.name.trim()
      if (!label) continue
      entries.push(tagSearchEntry(namespace, key, term, label))
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
      const contexts = searchCompletionRanges(query, caret).flatMap(
        (range) => completionContext(query, caret, range) ?? [],
      )
      return completeTagEntries(entries, contexts)
    },
  }
}

function completionContext(
  query: string,
  caret: number,
  { start, end, existing, phrase }: SearchCompletionRange,
): TagCompletionContext | undefined {
  let input = normalize(query.slice(start, caret))
  const modifier = input.match(/^[-~]/)?.[0] ?? ''
  input = input.slice(modifier.length)
  const qualifier = input.startsWith('weak:') ? 'weak:' : ''
  input = input.slice(qualifier.length)

  const colon = input.indexOf(':')
  const prefix = colon < 0 ? '' : input.slice(0, colon)
  const namespace = namespaceAliases.get(prefix) ?? prefix
  if (namespace && namespace !== 'tag' && !namespaces.has(namespace)) return undefined
  const needle = input
    .slice(colon + 1)
    .replace(/^"|"$/g, '')
    .trim()
  if (!needle || /["$]/.test(needle)) return undefined

  const suffix = query.slice(end) || ' '
  return {
    namespace: namespace && namespace !== 'tag' ? namespace : undefined,
    needle,
    phrase,
    replace(key, label) {
      const value = modifier + qualifier + exactTagTerm(key)
      if (existing.has(value.toLowerCase())) return undefined
      return { key, label, query: query.slice(0, start) + value + suffix, caret: start + value.length + 1 }
    },
  }
}

export const loadTagDirectory = createTagDirectoryLoader(dictionarySources, async (response) =>
  makeDirectory(await response.json()),
)
