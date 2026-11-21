export type SiteDocument = Document | DocumentFragment

export function text(element: Element | null | undefined): string {
  return element?.textContent?.trim().replace(/\s+/g, ' ') ?? ''
}

export function positiveInteger(value: string | null | undefined): number {
  const number = Number(value?.trim().replace(/,/g, ''))
  return Number.isSafeInteger(number) && number > 0 ? number : 0
}

function httpUrl(value: string | null | undefined, base: URL): URL | undefined {
  if (!value?.trim()) return undefined
  try {
    const url = new URL(value, base)
    if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password) return url
  } catch {
    return undefined
  }
}

export function localLink(element: Element | null | undefined, base: URL): URL | undefined {
  const href = element?.getAttribute('href')?.trim()
  if (!href || href.startsWith('#')) return undefined
  const target = httpUrl(href, base)
  if (target?.origin === base.origin) return target
}

export function imageUrl(image: Element | null | undefined, base: URL): string | undefined {
  return (httpUrl(image?.getAttribute('data-src'), base) ?? httpUrl(image?.getAttribute('src'), base))?.href
}
