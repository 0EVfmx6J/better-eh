import { commentBody, readLocalLink, type GalleryComments, type SiteDocument } from '@better-eh/core'

export function parseComments(doc: SiteDocument, base: URL): GalleryComments | undefined {
  const section = doc.querySelector('#cdiv')
  if (!section) return undefined

  const items = Array.from(section.querySelectorAll('.c6[id^="comment_"]')).flatMap((element) => {
    const body = commentBody(element, base)
    if (!body.length) return []
    const row = element.closest('.c1')
    const header = row?.querySelector('.c3')
    const author = header?.querySelector('a')?.textContent?.trim() ?? ''
    const posted = header?.textContent?.match(/Posted on\s+(.+?)\s+by:/i)?.[1] ?? ''
    const score = row?.querySelector('.c4')?.textContent?.match(/\bScore:?\s*([+-]?\d+)/i)?.[1]
    return [{ id: element.id, author, posted, body, score: score ? Number(score) : undefined }]
  })

  if (base.searchParams.get('hc') !== '1') {
    for (const link of section.querySelectorAll('#chd a[href*="hc=1"]')) {
      const target = readLocalLink(link, base)
      if (
        !target ||
        target.pathname.replace(/\/$/, '') !== base.pathname.replace(/\/$/, '') ||
        target.searchParams.get('hc') !== '1'
      )
        continue
      const hiddenCount = link.closest('p')?.textContent?.match(/(\d[\d,]*)\s+more comments?\b/i)?.[1]
      const hidden = Number(hiddenCount?.replace(/,/g, ''))
      return {
        items,
        moreHref: target.href,
        total: Number.isSafeInteger(hidden) ? items.length + hidden : undefined,
      }
    }
  }
  return { items, total: items.length }
}
