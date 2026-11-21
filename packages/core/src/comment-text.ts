import type { GalleryCommentPart } from './types'

function localHref(value: string, base: URL): string | undefined {
  if (!value.trim()) return undefined
  try {
    const url = new URL(value, base)
    if (url.host !== base.host || url.username || url.password) return undefined
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    url.protocol = base.protocol
    return url.href
  } catch {
    return undefined
  }
}

export function linkifyComment(text: string, base: URL): GalleryCommentPart[] {
  const parts: GalleryCommentPart[] = []
  let end = 0
  for (const match of text.matchAll(
    /(?:[a-z][\w+.-]*:\/\/|\/\/|[a-z\d-]+(?:\.[a-z\d-]+)+(?=\/))[^\s<>"'()[\]{}，。！？；：、]+/gi,
  )) {
    const address = match[0].replace(/[.,!?;:]+$/, '')
    const absolute = /^(?:[a-z][\w+.-]*:)?\/\//i.test(address)
    if (!absolute && /[\w@./%-]/.test(text.charAt(match.index - 1))) continue
    const href = localHref(absolute ? address : '//' + address, base)
    if (!href) continue
    if (match.index > end) parts.push({ text: text.slice(end, match.index) })
    parts.push({ text: address, href })
    end = match.index + address.length
  }
  if (end < text.length) parts.push({ text: text.slice(end) })
  return parts
}

export function commentBody(element: Element, base: URL): GalleryCommentPart[] {
  const copy = element.cloneNode(true) as Element
  for (const node of copy.querySelectorAll('script, style, template')) node.remove()
  for (const lineBreak of copy.querySelectorAll('br')) lineBreak.replaceWith('\n')
  for (const block of copy.querySelectorAll('blockquote, div, li, p, pre')) {
    block.before('\n')
    block.after('\n')
  }
  const parts: GalleryCommentPart[] = []
  let pendingText = ''

  function collect(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      pendingText += node.nodeValue ?? ''
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const element = node as Element
    const href = element.tagName === 'A' ? element.getAttribute('href') : null
    if (href !== null) {
      parts.push(...linkifyComment(pendingText, base))
      pendingText = ''
      parts.push({ text: element.textContent ?? '', href: localHref(href, base) })
      return
    }
    for (const child of node.childNodes) collect(child)
  }

  collect(copy)
  parts.push(...linkifyComment(pendingText, base))
  const first = parts[0]
  const last = parts.at(-1)
  if (first) first.text = first.text.trimStart()
  if (last) last.text = last.text.trimEnd()
  return parts.filter((part) => part.text)
}
