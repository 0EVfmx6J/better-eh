import { defineStore } from 'pinia'
import { shallowReactive, shallowRef, triggerRef } from 'vue'
import type { PageCache, PageEntry, ReaderFrame, SitePage } from '@better-eh/core'

const pageLimit = 48
const groupLimit = 12
const readerImageLimit = pageLimit * groupLimit
type CachedPages = Map<string, PageEntry>
type CacheGroups = Map<string, CachedPages>

function touch<K, V>(map: Map<K, V>, key: K, value: V): void {
  map.delete(key)
  map.set(key, value)
}

function trim<K, V>(map: Map<K, V>, limit: number): void {
  if (map.size <= limit) return
  const oldest = map.keys().next()
  if (!oldest.done) map.delete(oldest.value)
}

function readerImageKey(href: string): string {
  const url = new URL(href)
  return url.origin + url.pathname.replace(/\/$/, '')
}

export const usePageCacheStore = defineStore('page-cache', () => {
  const groupsByKind = shallowRef(new Map<SitePage['kind'], CacheGroups>())
  const readerImages = shallowReactive(new Map<string, ReaderFrame>())

  const get: PageCache['get'] = ({ kind, key }, href) => {
    const groups = groupsByKind.value.get(kind)
    const pages = groups?.get(key)
    const entry = pages?.get(href)
    if (groups && pages && entry) {
      touch(groups, key, pages)
      touch(pages, href, entry)
    }
    return entry
  }

  const set: PageCache['set'] = ({ kind, key }, href, entry) => {
    const groups = groupsByKind.value.get(kind) ?? new Map()
    const pages = groups.get(key) ?? new Map()
    touch(pages, href, entry)
    trim(pages, pageLimit)
    touch(groups, key, pages)
    trim(groups, groupLimit)
    groupsByKind.value.set(kind, groups)
    triggerRef(groupsByKind)
  }

  const update: PageCache['update'] = (kind, updateEntry) => {
    const groups = groupsByKind.value.get(kind)
    if (!groups) return
    for (const [key, pages] of groups) {
      for (const [href, entry] of pages) {
        const updated = updateEntry(entry)
        if (updated) pages.set(href, updated)
        else pages.delete(href)
      }
      if (!pages.size) groups.delete(key)
    }
    if (!groups.size) groupsByKind.value.delete(kind)
    triggerRef(groupsByKind)
  }

  function getReaderImage(href: string): ReaderFrame | undefined {
    return readerImages.get(readerImageKey(href))
  }

  function setReaderImage(frame: ReaderFrame): void {
    touch(readerImages, readerImageKey(frame.href), frame)
    trim(readerImages, readerImageLimit)
  }

  function forgetReaderImage(href: string, image: string): boolean {
    const key = readerImageKey(href)
    return readerImages.get(key)?.image === image && readerImages.delete(key)
  }

  return { groupsByKind, get, set, update, readerImages, getReaderImage, setReaderImage, forgetReaderImage }
})
