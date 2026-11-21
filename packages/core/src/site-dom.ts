export type SiteDocument = Document | DocumentFragment

export function readText(element: Element | null | undefined): string {
  return element?.textContent?.trim().replace(/\s+/g, ' ') ?? ''
}

export function resolveHttpUrl(value: string | null | undefined, base: URL): URL | undefined {
  if (!value?.trim()) return undefined
  try {
    const url = new URL(value, base)
    if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password) return url
  } catch {
    return undefined
  }
}

export function readLocalLink(element: Element | null | undefined, base: URL): URL | undefined {
  const href = element?.getAttribute('href')?.trim()
  if (!href || href.startsWith('#')) return undefined
  const target = resolveHttpUrl(href, base)
  if (target?.origin === base.origin) return target
}

export function readImageUrl(image: Element | null | undefined, base: URL): string | undefined {
  return (resolveHttpUrl(image?.getAttribute('data-src'), base) ?? resolveHttpUrl(image?.getAttribute('src'), base))
    ?.href
}
