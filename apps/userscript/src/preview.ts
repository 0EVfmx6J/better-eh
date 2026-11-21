import type { SitePage } from '@better-eh/core'
import { ehAdapter } from '@better-eh/site-eh'
import { mount } from './mount'
import '@better-eh/ui/style.css'

const url = new URL(location.href)
const parsed = ehAdapter.parse(document, url)
const preview: SitePage = parsed ?? {
  kind: 'catalog',
  title: '画廊索引',
  query: '',
  categories: [
    { label: '全部', href: url.href, selected: true },
    { label: '漫画', href: url.href, selected: false },
    { label: 'Cosplay', href: url.href, selected: false },
    { label: '艺术家 CG', href: url.href, selected: false },
  ],
  items: [
    { href: url.href, title: 'Preview gallery / Quiet morning', category: 'image', pages: 28, posted: '2026-11-18' },
    { href: url.href, title: 'A study in soft contrast', category: 'artist cg', pages: 64, posted: '2026-11-17' },
    { href: url.href, title: 'Small rooms, long shadows', category: 'manga', pages: 112, posted: '2026-11-16' },
    { href: url.href, title: 'A field guide to details', category: 'cosplay', pages: 36, posted: '2026-11-15' },
  ],
}
mount(document.querySelector('#app') ?? document.body, ehAdapter, preview, url)
