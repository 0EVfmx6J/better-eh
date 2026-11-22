<script setup lang="ts">
import { ArrowLeft, X } from '@lucide/vue'
import { useEventListener } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'
import { searchTokens, type CompleteTags } from '@better-eh/core'
import ActionButton from './ActionButton.vue'
import ConfirmationDialog from './ConfirmationDialog.vue'
import TagSearchBox from './TagSearchBox.vue'

const props = defineProps<{ query: string; desktop: boolean; completeTags?: CompleteTags }>()
const emit = defineEmits<{ close: []; loadTags: []; search: [query: string] }>()
const panel = useTemplateRef<HTMLDialogElement>('panel')
const searchBox = useTemplateRef('searchBox')
const draft = shallowRef('')
const conditions = shallowRef(searchTokens(props.query).map(({ text }) => text))
const canSearch = computed(() => Boolean(conditions.value.length || draft.value.trim() || props.query))
const confirmClear = shallowRef(false)
const viewport = window.visualViewport
useEventListener(viewport, ['resize', 'scroll'], fitViewport)
onMounted(() => {
  fitViewport()
  panel.value?.showModal()
})
onBeforeUnmount(() => panel.value?.close())

function fitViewport(): void {
  const element = panel.value
  if (props.desktop || !element || !viewport) return
  const scale = viewport.scale
  element.style.setProperty('--search-height', `${viewport.height * scale}px`)
  element.style.setProperty('--search-top', scale <= 1.01 ? `${viewport.offsetTop}px` : '0px')
}

function addConditions(query: string): void {
  const added = searchTokens(query).map(({ text }) => text)
  conditions.value = [...conditions.value, ...added]
  draft.value = ''
}

function restoreHistory(query: string): void {
  conditions.value = searchTokens(query).map(({ text }) => text)
  draft.value = ''
}

function removeCondition(index: number): void {
  conditions.value = conditions.value.filter((_, position) => position !== index)
}

async function clearConditions(): Promise<void> {
  confirmClear.value = false
  conditions.value = []
  await nextTick()
  searchBox.value?.focus()
}

function search(): void {
  if (!canSearch.value) return
  emit('search', [...conditions.value, draft.value.trim()].filter(Boolean).join(' '))
}
</script>

<template>
  <dialog
    id="better-eh-gallery-search"
    ref="panel"
    :class="desktop ? 'search-panel-desktop' : 'search-panel-mobile'"
    :aria-label="desktop ? '搜索画廊' : undefined"
    :aria-labelledby="desktop ? undefined : 'better-eh-gallery-search-title'"
    @cancel.self.prevent="emit('close')"
    @click.self="desktop && emit('close')"
    @touchmove.self.prevent
    @wheel.self.prevent
  >
    <div :class="{ 'search-panel-mobile-content': !desktop }">
      <div
        v-if="!desktop"
        class="sticky top-0 z-3 flex items-center gap-2 border-b border-line bg-surface py-1.5 pt-[max(6px,env(safe-area-inset-top))] pr-[max(16px,env(safe-area-inset-right))] pl-[max(12px,env(safe-area-inset-left))]"
      >
        <button class="icon-button" type="button" aria-label="返回" @click="emit('close')">
          <ArrowLeft :size="22" aria-hidden="true" />
        </button>
        <h2 id="better-eh-gallery-search-title" class="grow text-[17px] font-[650]">搜索画廊</h2>
        <ActionButton class="min-h-11 px-4" variant="primary" :disabled="!canSearch" @click="search">搜索</ActionButton>
      </div>
      <TagSearchBox
        ref="searchBox"
        v-model="draft"
        :class="
          desktop
            ? 'shell pb-4'
            : 'pt-3 pr-[max(16px,env(safe-area-inset-right))] pb-[max(16px,env(safe-area-inset-bottom))] pl-[max(16px,env(safe-area-inset-left))]'
        "
        :complete-tags="completeTags"
        :placeholder="conditions.length ? '添加更多条件' : '输入关键词或标签'"
        @load="emit('loadTags')"
        @add="addConditions"
        @search="search"
        @select-history="restoreHistory"
      >
        <template v-if="desktop" #actions>
          <ActionButton variant="primary" :disabled="!canSearch" @click="search"> 搜索 </ActionButton>
          <button class="icon-button" type="button" aria-label="关闭搜索" title="关闭搜索" @click="emit('close')">
            <X :size="20" aria-hidden="true" />
          </button>
        </template>
        <div v-if="conditions.length" class="my-3">
          <div class="mb-2 flex items-center justify-between gap-2 px-2.5 text-xs text-muted">
            <h3 id="better-eh-search-conditions" class="font-medium">搜索条件</h3>
            <button
              class="min-h-11 rounded-md px-2 hover:bg-panel"
              type="button"
              aria-label="清空全部搜索条件"
              aria-haspopup="dialog"
              @mousedown.prevent
              @click="confirmClear = true"
            >
              清空全部
            </button>
          </div>
          <ul class="m-0 flex list-none flex-wrap gap-2 p-0" aria-labelledby="better-eh-search-conditions">
            <li v-for="(term, index) in conditions" :key="index" class="max-w-full min-w-0">
              <button
                class="search-condition flex min-h-11 max-w-full touch-manipulation items-center gap-2 rounded-xl text-left text-[13px] font-[550]"
                type="button"
                :aria-label="'移除 ' + term"
                @click="removeCondition(index)"
              >
                <span class="min-w-0 wrap-anywhere">{{ term }}</span>
                <X :size="16" class="shrink-0 text-muted" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </div>
      </TagSearchBox>
    </div>
    <ConfirmationDialog
      v-if="confirmClear"
      title="清空全部搜索条件？"
      message="将移除所有已添加的标签。"
      confirm-label="清空"
      :busy="false"
      error=""
      @cancel="confirmClear = false"
      @confirm="clearConditions"
    />
  </dialog>
</template>
