<script setup lang="ts">
import { X } from '@lucide/vue'
import { useTemplateRef } from 'vue'
import type { SiteNavigationItem } from '@better-eh/core'
import SiteNavLinks from './SiteNavLinks.vue'

defineProps<{ items: SiteNavigationItem[]; currentUrl: URL }>()
const emit = defineEmits<{ close: []; select: [event: MouseEvent, item: SiteNavigationItem] }>()
const dialog = useTemplateRef('dialog')
defineExpose({ dialog })
</script>

<template>
  <dialog
    id="better-eh-site-menu"
    ref="dialog"
    class="site-menu"
    aria-labelledby="better-eh-site-menu-title"
    @cancel.prevent="emit('close')"
    @click.self="emit('close')"
  >
    <div class="site-menu-panel">
      <div class="site-menu-header">
        <h2 id="better-eh-site-menu-title" class="text-[16px] font-[650]">站点导航</h2>
        <button class="icon-button" type="button" aria-label="关闭站点导航" autofocus @click="emit('close')">
          <X :size="20" aria-hidden="true" />
        </button>
      </div>
      <SiteNavLinks :items="items" :current-url="currentUrl" @select="(event, item) => emit('select', event, item)" />
    </div>
  </dialog>
</template>
