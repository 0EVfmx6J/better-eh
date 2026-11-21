import { delay, uniqBy } from 'es-toolkit'
import type { PageCacheGroup, SiteAdapter, SitePage, TagChange, TagsPage } from './types'

export interface PageEntry {
  url: string
  page: SitePage
}

export interface PageCache {
  get(group: PageCacheGroup, href: string): PageEntry | undefined
  set(group: PageCacheGroup, href: string, entry: PageEntry): void
  update(kind: SitePage['kind'], update: (entry: PageEntry) => PageEntry | undefined): void
}

export const nativePageFlag = 'better-eh-native'

export function catalogCacheGroup(url: URL, paginationParams: readonly string[]): PageCacheGroup {
  const group = new URL(url)
  group.pathname = group.pathname.replace(/\/$/, '')
  group.hash = ''
  for (const parameter of paginationParams) group.searchParams.delete(parameter)
  group.searchParams.sort()
  return { kind: 'catalog', key: group.href }
}

function pageUrl(href: string): URL {
  const url = new URL(href, location.href)
  url.hash = ''
  return url
}

export function createPageLoader(adapter: SiteAdapter, initialUrl: string, initialPage: SitePage, cache: PageCache) {
  const initial = pageUrl(initialUrl)
  cache.set(adapter.pageCacheGroup(initial), initial.href, { url: initialUrl, page: initialPage })
  let availableAt = Date.now() + 900
  let blockedUntil = 0
  let tail: Promise<unknown> = Promise.resolve()

  function enqueue<T>(run: () => Promise<T>): Promise<T> {
    const task = tail.then(run)
    tail = task.catch(() => undefined)
    return task
  }

  async function read<T>(
    url: URL,
    signal: AbortSignal,
    refresh: boolean,
    parse: (body: string, finalUrl: URL) => T,
  ): Promise<T> {
    if (signal.aborted) throw signal.reason
    if (blockedUntil > Date.now()) throw new Error('站点触发了访问限流，请稍后重试。')
    const wait = availableAt - Date.now()
    if (wait > 0) await delay(wait)
    if (signal.aborted) throw signal.reason

    try {
      const response = await fetch(url, { credentials: 'same-origin', signal, cache: refresh ? 'reload' : 'default' })
      const body = await response.text()
      if (
        response.status === 429 ||
        /(?:temporarily banned|excessive pageloads|too many requests)/i.test(body.slice(0, 1600))
      ) {
        const retryAfter = response.headers.get('Retry-After')
        const milliseconds =
          retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter ?? '') - Date.now()
        blockedUntil = Date.now() + (milliseconds > 0 ? milliseconds : 60_000)
        throw new Error('站点触发了访问限流，请稍后重试。')
      }
      if (!response.ok) throw new Error('站点返回 HTTP ' + response.status + '。')
      const finalUrl = new URL(response.url || url.href)
      if (finalUrl.origin !== url.origin || (response.redirected && /^\/login\/?$/.test(finalUrl.pathname))) {
        throw new Error('请在原站完成登录后重试。')
      }
      return parse(body, finalUrl)
    } finally {
      availableAt = Math.max(availableAt, Date.now() + 900)
    }
  }

  function load(href: string, signal: AbortSignal, refresh = false): Promise<PageEntry> {
    const url = pageUrl(href)
    if (url.origin !== location.origin) return Promise.reject(new Error('此链接需要在原站打开。'))
    return enqueue(async () => {
      if (signal.aborted) throw signal.reason
      const group = adapter.pageCacheGroup(url)
      const cached = cache.get(group, url.href)
      if (cached && !refresh) return cached
      return read(url, signal, refresh, (html, finalUrl) => {
        const template = document.createElement('template')
        template.innerHTML = html
        const page = adapter.parse(template.content, finalUrl)
        if (!page) throw new Error('无法读取此页面，可以从原站打开。')
        if (page.kind === 'catalog') page.items = uniqBy(page.items, (item) => item.href)
        const entry = { url: finalUrl.href, page }
        cache.set(group, url.href, entry)
        return entry
      })
    })
  }

  async function loadComments(href: string, signal: AbortSignal, refresh: boolean) {
    const { parseCommentsResponse } = adapter
    if (parseCommentsResponse) {
      const url = pageUrl(href)
      if (url.origin !== location.origin) throw new Error('评论链接无效。')
      return enqueue(() => read(url, signal, refresh, parseCommentsResponse))
    }
    const comments = await readGalleryComments(href, signal, refresh)
    if (comments.moreHref) throw new Error('无法读取完整评论。')
    return comments
  }

  async function readGalleryComments(href: string, signal: AbortSignal, refresh: boolean) {
    const { page } = await load(href, signal, refresh)
    if (page.kind !== 'gallery' || !page.comments) throw new Error('无法读取评论。')
    return page.comments
  }

  function refreshGalleryComments(href: string, signal: AbortSignal) {
    const url = adapter.galleryCommentsUrl?.(pageUrl(href))
    return url ? loadComments(url, signal, true) : readGalleryComments(href, signal, true)
  }

  async function loadGalleryCommentTotal(href: string, signal: AbortSignal): Promise<number | undefined> {
    const url = adapter.galleryCommentsUrl?.(pageUrl(href), 1)
    if (url) return (await loadComments(url, signal, false)).total
  }

  function submitTagChange(href: string, page: TagsPage, change: TagChange): Promise<TagsPage> {
    return enqueue(async () => {
      const updated = await page.submit(change)
      const url = pageUrl(href)
      cache.update('catalog', (entry) => (new URL(entry.url).origin === url.origin ? undefined : entry))
      cache.update('tags', (entry) => {
        if (entry.page.kind !== 'tags' || new URL(entry.url).origin !== url.origin) return entry
        if (entry.page.activeGroup === updated.activeGroup) return { ...entry, page: updated }
        if (change.kind === 'move' && entry.page.activeGroup === change.target) return undefined
        return entry
      })
      cache.set(adapter.pageCacheGroup(url), url.href, { url: href, page: updated })
      return updated
    })
  }

  return { load, loadComments, refreshGalleryComments, loadGalleryCommentTotal, submitTagChange }
}
