export function searchTokens(query: string) {
  return Array.from(query.matchAll(/(?:[^\s"]+|"[^"]*(?:"|$))+/g), (match) => ({
    text: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }))
}

export function searchTokenAt(query: string, caret: number) {
  const tokens = searchTokens(query)
  const token = tokens.find(({ start, end }) => caret > start && caret <= end)
  if (!token) return undefined
  return {
    start: token.start,
    end: token.end,
    existing: new Set(tokens.filter((part) => part !== token).map((part) => part.text.toLowerCase())),
  }
}
