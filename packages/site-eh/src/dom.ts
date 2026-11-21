import { readLocalLink, resolveHttpUrl } from '@better-eh/core'

export const numeric = (value: string) => Number(value.match(/\d[\d,]*/)?.[0].replace(/,/g, '')) || 0
export const background = (style: CSSStyleDeclaration | undefined) =>
  style?.backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1]

export function link(element: Element | null | undefined, base: URL): string | undefined {
  const target = readLocalLink(element, base)
  if (target && target.href !== base.href) return target.href
}

export function image(element: Element, base: URL): string | undefined {
  const img = element.matches('img') ? element : element.querySelector('img[data-src], img')
  return resolveHttpUrl(img?.getAttribute('data-src') || img?.getAttribute('src'), base)?.href
}
