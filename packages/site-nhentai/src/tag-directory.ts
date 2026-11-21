import { createTagDirectoryLoader, type TagCompletion, type TagDirectory } from '@better-eh/core'
import { containsHan, tagCompletionContext } from './tag-completion'

const dictionaryPath = '@l2studio/nhentai-tags@0.3.5/dist/index.js'
const dictionarySources = ['https://cdn.jsdelivr.net/npm/' + dictionaryPath, 'https://unpkg.com/' + dictionaryPath]
const namespaces = [
  ['languages', 'language'],
  ['categories', 'category'],
  ['tags', 'tag'],
  ['parodies', 'parody'],
  ['characters', 'character'],
  ['artists', 'artist'],
  ['groups', 'group'],
] as const

function makeDirectory(source: string): TagDirectory {
  const labels = new Map<string, string>()
  const entries: { type: string; key: string; label: string; normalized: string }[] = []
  // This pinned release ships an object literal. Read its data rows without executing the file.
  const groups = new Map(
    Array.from(source.matchAll(/^    (\w+): \{\r?\n([\s\S]*?)^    \},?$/gm), (match) => [match[1], match[2]]),
  )
  for (const [group, type] of namespaces) {
    const rows = groups.get(group)
    if (!rows) throw new Error('标签词库格式有误。')
    for (const [, quoted, bare, text] of rows.matchAll(
      /^        (?:'((?:\\.|[^'\\])*)'|([\w$]+)): \{ id: \d+, text: '((?:\\.|[^'\\])*)' \},?$/gm,
    )) {
      const name = (bare ?? quoted)?.replace(/\\'/g, "'")
      const label = text
        ?.replace(/\\'/g, "'")
        .trim()
        .replace(/[\t\r\n]+/g, ' ')
      if (
        !name ||
        /["\\\t\r\n]/.test(name) ||
        !label ||
        !containsHan.test(label) ||
        label.toLowerCase() === name.toLowerCase()
      ) {
        continue
      }
      const key = type + ':' + name
      labels.set(key.toLowerCase(), label)
      entries.push({ type, key, label, normalized: label.normalize('NFKC').toLowerCase() })
    }
  }
  if (!entries.length) throw new Error('标签词库为空。')
  return {
    translate: (key) => labels.get(key.trim().toLowerCase()),
    complete(query, caret) {
      const context = tagCompletionContext(query, caret)
      if (!context || !containsHan.test(context.needle)) return []
      const { type, needle, replace } = context
      const exact: TagCompletion[] = []
      const prefix: TagCompletion[] = []
      const partial: TagCompletion[] = []
      for (const entry of entries) {
        if (type && entry.type !== type) continue
        const index = entry.normalized.indexOf(needle)
        if (index < 0) continue
        const matches = entry.normalized === needle ? exact : index === 0 ? prefix : partial
        if (matches.length >= 8) continue
        const option = replace(entry.key, entry.label)
        if (option) matches.push(option)
      }
      return exact.concat(prefix, partial).slice(0, 8)
    },
  }
}

export const loadTagDirectory = createTagDirectoryLoader(dictionarySources, async (response) =>
  makeDirectory(await response.text()),
)
