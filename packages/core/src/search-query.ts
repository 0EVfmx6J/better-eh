export function searchTokens(query: string) {
  return Array.from(query.matchAll(/(?:[^\s"]+|"[^"]*(?:"|$))+/g), (match) => ({
    text: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }))
}

export interface SearchCompletionRange {
  start: number
  end: number
  existing: ReadonlySet<string>
  phrase: boolean
}

export function searchCompletionRanges(query: string, caret: number): SearchCompletionRange[] {
  const tokens = searchTokens(query)
  const index = tokens.findIndex(({ start, end }) => caret > start && caret <= end)
  const current = tokens[index]
  if (!current) return []

  // Try the phrase ending at the caret without consuming quoted or completed terms before it.
  const candidates = [current]
  let next = current
  for (const previous of tokens.slice(Math.max(0, index - 4), index).reverse()) {
    if (/^[-~]|\s|:|"/.test(next.text)) break
    if (/["$]/.test(previous.text) || /^(?:AND|OR|NOT)$/.test(previous.text)) break
    candidates.unshift(previous)
    next = previous
  }

  return candidates.map(({ start }, offset) => ({
    start,
    end: current.end,
    phrase: start !== current.start,
    existing: new Set(
      [...tokens.slice(0, index + 1 - candidates.length + offset), ...tokens.slice(index + 1)].map(({ text }) =>
        text.toLowerCase(),
      ),
    ),
  }))
}
