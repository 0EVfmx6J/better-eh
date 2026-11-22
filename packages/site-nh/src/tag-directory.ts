import { completeTagEntries, createTagDirectoryLoader, tagSearchEntry, type TagDirectory } from '@better-eh/core'
import { containsHan, tagCompletionContexts } from './tag-completion'
import { tagNamespaces } from './urls'

const dictionaryPath = '@l2studio/nhentai-tags@0.3.5/dist/index.js'
const dictionarySources = ['https://cdn.jsdelivr.net/npm/' + dictionaryPath, 'https://unpkg.com/' + dictionaryPath]

function makeDirectory(source: string): TagDirectory {
  const labels = new Map<string, string>()
  const entries: ReturnType<typeof tagSearchEntry>[] = []
  // This pinned release ships an object literal. Read its data rows without executing the file.
  const groups = new Map(
    Array.from(source.matchAll(/^    (\w+): \{\r?\n([\s\S]*?)^    \},?$/gm), (match) => [match[1], match[2]]),
  )
  for (const [group, type] of tagNamespaces) {
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
      if (!name || /["\\\t\r\n]/.test(name)) {
        continue
      }
      const key = type + ':' + name
      const translated =
        label && containsHan.test(label) && label.toLowerCase() !== name.toLowerCase() ? label : undefined
      if (translated) labels.set(key.toLowerCase(), translated)
      entries.push(tagSearchEntry(type, key, name, translated ?? name))
    }
  }
  if (!entries.length) throw new Error('标签词库为空。')
  return {
    translate: (key) => labels.get(key.trim().toLowerCase()),
    complete(query, caret) {
      const contexts = tagCompletionContexts(query, caret).filter(
        ({ needle }) => needle.length >= 2 || containsHan.test(needle),
      )
      return completeTagEntries(entries, contexts)
    },
  }
}

export const loadTagDirectory = createTagDirectoryLoader(dictionarySources, async (response) =>
  makeDirectory(await response.text()),
)
