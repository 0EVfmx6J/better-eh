import { commentBody, linkifyComment, type GalleryComments } from '@better-eh/core'
import { positiveInteger, text, type SiteDocument } from './dom'
import { galleryPath } from './urls'

const pageSize = 30
const maxPage = 2000
const commentSelector = '.comment[id^="comment-"]'

function commentsUrl(base: URL, galleryId: string, page: number): string {
  const target = new URL(`/api/v2/galleries/${galleryId}/comments`, base)
  target.searchParams.set('page', String(page))
  target.searchParams.set('per_page', String(pageSize))
  return target.href
}

export function galleryCommentsUrl(gallery: URL): string | undefined {
  const id = galleryPath.exec(gallery.pathname)?.[1]
  if (id) return commentsUrl(gallery, id, 1)
}

export function parseComments(doc: SiteDocument, base: URL, galleryId: string): GalleryComments {
  const section = doc.querySelector('#comments')
  if (!section) return { items: [], moreHref: commentsUrl(base, galleryId, 1) }

  const elements = Array.from(section.querySelectorAll(commentSelector))
  const items = elements.flatMap((element) => {
    const content = element.querySelector('.body')
    if (!content) return []
    const body = commentBody(content, base)
    if (!body.length) return []
    const time = element.querySelector('time')
    return [
      {
        id: element.id,
        body,
        author: text(element.querySelector('.username')),
        posted: text(time) || time?.getAttribute('datetime')?.slice(0, 10) || '',
      },
    ]
  })
  const pages = section.querySelectorAll('.comments-page[data-page]')
  const lastPage = pages[pages.length - 1]
  const page = positiveInteger(lastPage?.getAttribute('data-page')) || 1
  const count = lastPage?.querySelectorAll(commentSelector).length ?? elements.length
  const moreHref = count >= pageSize && page < maxPage ? commentsUrl(base, galleryId, page + 1) : undefined
  return { items, moreHref }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object')
}

export function parseCommentsResponse(body: string, url: URL): GalleryComments {
  const galleryId = /^\/api\/v2\/galleries\/([1-9]\d*)\/comments\/?$/.exec(url.pathname)?.[1]
  const page = positiveInteger(url.searchParams.get('page'))
  const payload: unknown = JSON.parse(body)
  if (
    !galleryId ||
    !page ||
    !isRecord(payload) ||
    !Array.isArray(payload.result) ||
    typeof payload.num_pages !== 'number' ||
    !Number.isSafeInteger(payload.num_pages) ||
    payload.num_pages < 0
  ) {
    throw new Error('评论响应格式有误。')
  }

  const rows: unknown[] = payload.result
  const items = rows.flatMap((row) => {
    if (
      !isRecord(row) ||
      row.gallery_id !== Number(galleryId) ||
      typeof row.id !== 'number' ||
      !Number.isSafeInteger(row.id) ||
      typeof row.body !== 'string' ||
      !row.body.trim()
    ) {
      return []
    }
    const date = typeof row.post_date === 'number' ? new Date(row.post_date * 1000) : undefined
    return [
      {
        id: `comment-${row.id}`,
        author: isRecord(row.poster) && typeof row.poster.username === 'string' ? row.poster.username : '',
        posted: date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '',
        body: linkifyComment(row.body.trim(), url),
      },
    ]
  })
  return {
    items,
    total:
      typeof payload.total === 'number' && Number.isSafeInteger(payload.total) && payload.total >= 0
        ? payload.total
        : undefined,
    moreHref:
      rows.length && page < Math.min(payload.num_pages, maxPage) ? commentsUrl(url, galleryId, page + 1) : undefined,
  }
}
