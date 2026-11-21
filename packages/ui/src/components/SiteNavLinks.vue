<script setup lang="ts">
import {
  ArrowUpRight,
  Bookmark,
  Compass,
  Download,
  Eye,
  Flame,
  Heart,
  History,
  House,
  Settings,
  Tags,
  Upload,
} from '@lucide/vue'
import type { Component } from 'vue'
import type { SiteNavigationItem } from '@better-eh/core'

defineProps<{
  items: SiteNavigationItem[]
  currentUrl: URL
}>()

const emit = defineEmits<{
  select: [event: MouseEvent, item: SiteNavigationItem]
}>()

const icons: Record<string, Component> = {
  home: House,
  watched: Eye,
  popular: Flame,
  torrents: Download,
  favorites: Heart,
  settings: Settings,
  uploads: Upload,
  tags: Tags,
  history: History,
  later: Bookmark,
}

function isCurrent(href: string, currentUrl: URL): boolean {
  const target = new URL(href)
  return (
    target.origin === currentUrl.origin &&
    target.pathname.replace(/\/$/, '') === currentUrl.pathname.replace(/\/$/, '') &&
    Array.from(target.searchParams).every(([key, value]) => (currentUrl.searchParams.get(key) ?? '') === value) &&
    (target.hash.startsWith('#better-eh-') || currentUrl.hash.startsWith('#better-eh-')
      ? target.hash === currentUrl.hash
      : true)
  )
}
</script>

<template>
  <nav class="site-nav grid gap-1" aria-label="站点导航">
    <a
      v-for="item in items"
      :key="item.id"
      class="site-nav-link"
      :data-section="item.id"
      :href="item.href"
      :aria-current="isCurrent(item.href, currentUrl) ? 'page' : undefined"
      @click="emit('select', $event, item)"
    >
      <component :is="icons[item.id] ?? Compass" :size="18" aria-hidden="true" />
      <span>{{ item.label }}</span>
      <ArrowUpRight v-if="item.native" class="site-nav-native opacity-[.72]" :size="14" aria-hidden="true" />
    </a>
  </nav>
</template>
