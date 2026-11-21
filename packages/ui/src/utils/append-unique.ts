export function appendUnique<T>(current: T[], incoming: T[], key: (item: T) => string): T[] {
  const seen = new Set(current.map(key))
  return current.concat(
    incoming.filter((item) => {
      const itemKey = key(item)
      if (seen.has(itemKey)) return false
      seen.add(itemKey)
      return true
    }),
  )
}
