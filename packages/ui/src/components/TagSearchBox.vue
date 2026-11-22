<script setup lang="ts">
import { History, Plus, X } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { computed, nextTick, shallowRef, useId, useTemplateRef, watch } from 'vue'
import type { CompleteTags, TagCompletion } from '@better-eh/core'
import { useSearchHistoryStore } from '../stores/search-history'
import { useTagDirectoryStore } from '../stores/tag-directory'
import ConfirmationDialog from './ConfirmationDialog.vue'

const { directory, loading, failed } = storeToRefs(useTagDirectoryStore())
const searchHistory = useSearchHistoryStore()
const { recent } = storeToRefs(searchHistory)
const props = defineProps<{ completeTags?: CompleteTags; placeholder: string }>()
const emit = defineEmits<{ add: [query: string]; load: []; search: []; selectHistory: [query: string] }>()
const query = defineModel<string>({ required: true })
const control = useTemplateRef('control')
const list = useTemplateRef('list')
const listId = useId()
const focused = shallowRef(false)
const composing = shallowRef(false)
const dismissed = shallowRef(false)
const confirmClearHistory = shallowRef(false)
const caret = shallowRef(0)
const activeIndex = shallowRef(-1)
const remoteOptions = shallowRef<TagCompletion[]>([])
const remotePending = shallowRef(false)
defineExpose({
  focus: () => control.value?.focus({ preventScroll: true }),
})
const canSuggest = computed(() => focused.value && !composing.value && !dismissed.value)
const historyOptions = computed(() => (!query.value.trim() && !composing.value ? recent.value : []))
const localOptions = computed(() =>
  canSuggest.value && !historyOptions.value.length ? (directory.value?.complete(query.value, caret.value) ?? []) : [],
)
const suggestions = computed(() => {
  if (!canSuggest.value || historyOptions.value.length) return []
  if (localOptions.value.length || !props.completeTags) return localOptions.value
  return remoteOptions.value.map((option) => ({
    ...option,
    label: directory.value?.translate(option.key) ?? option.label,
  }))
})
const canRequest = computed(
  () => canSuggest.value && Boolean(directory.value) && !historyOptions.value.length && !localOptions.value.length,
)
watch([query, caret, canRequest], ([text, position, enabled], _, onCleanup) => {
  remoteOptions.value = []
  const complete = props.completeTags
  if (!complete || !enabled || !text.trim()) return

  const request = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timer = setTimeout(async () => {
    remotePending.value = true
    timeout = setTimeout(() => {
      request.abort()
      remotePending.value = false
    }, 8000)
    try {
      const options = await complete(text, position, request.signal)
      if (!request.signal.aborted) remoteOptions.value = options
    } catch {
      // Tag suggestions are optional. The search form stays usable if the API fails.
    } finally {
      clearTimeout(timeout)
      if (!request.signal.aborted) remotePending.value = false
    }
  }, 200)
  onCleanup(() => {
    clearTimeout(timer)
    clearTimeout(timeout)
    remotePending.value = false
    request.abort()
  })
})
const optionCount = computed(() => historyOptions.value.length || suggestions.value.length)
const activeId = computed(() =>
  activeIndex.value >= 0 && activeIndex.value < optionCount.value ? listId + '-' + activeIndex.value : undefined,
)
watch([historyOptions, suggestions], () => {
  activeIndex.value = -1
})

function readCaret(): void {
  caret.value = control.value?.selectionStart ?? query.value.length
}

function onFocus(): void {
  focused.value = true
  dismissed.value = false
  readCaret()
  emit('load')
}

function retryTags(): void {
  control.value?.focus({ preventScroll: true })
  emit('load')
}

function onBlur(event: FocusEvent): void {
  if (event.currentTarget instanceof Element && event.relatedTarget instanceof Node) {
    if (event.currentTarget.contains(event.relatedTarget)) return
  }
  focused.value = false
}

function reopenOptions(): void {
  dismissed.value = false
  readCaret()
}

function clearSearch(): void {
  query.value = ''
  control.value?.focus({ preventScroll: true })
  reopenOptions()
}

async function closeClearHistory(): Promise<void> {
  confirmClearHistory.value = false
  await nextTick()
  control.value?.focus({ preventScroll: true })
}

async function clearHistory(): Promise<void> {
  searchHistory.clear()
  await closeClearHistory()
}

function onKeydown(event: KeyboardEvent): void {
  if (composing.value || event.isComposing) return
  const count = optionCount.value
  const canDismiss = remotePending.value || suggestions.value.length
  if (event.key === 'Escape' && canDismiss) {
    event.preventDefault()
    dismissed.value = true
  } else if (count && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault()
    const step = event.key === 'ArrowDown' ? 1 : -1
    const current = activeIndex.value
    activeIndex.value = current < 0 && step < 0 ? count - 1 : (current + step + count) % count
    list.value?.children[activeIndex.value]?.scrollIntoView({ block: 'nearest' })
  } else if (event.key === 'Enter') {
    const term = historyOptions.value[activeIndex.value]
    if (term) {
      event.preventDefault()
      emit('selectHistory', term)
      return
    }
    const option = suggestions.value[activeIndex.value]
    if (option) {
      event.preventDefault()
      emit('add', option.query)
    } else if (!query.value.trim()) {
      event.preventDefault()
      emit('search')
    }
  }
}

function submit(): void {
  if (!composing.value && query.value.trim()) emit('add', query.value)
}
</script>

<template>
  <form class="search-form relative min-w-0" role="search" @focusout="onBlur" @submit.prevent="submit">
    <div class="search-editor-row flex items-center gap-2">
      <div class="search-box flex flex-1 items-center">
        <input
          ref="control"
          v-model="query"
          type="search"
          role="combobox"
          :placeholder="placeholder"
          aria-label="搜索画廊或标签"
          aria-autocomplete="list"
          :aria-expanded="optionCount > 0"
          :aria-controls="optionCount ? listId : undefined"
          :aria-activedescendant="activeId"
          autofocus
          autocomplete="off"
          enterkeyhint="enter"
          @focus="onFocus"
          @input="reopenOptions"
          @click="reopenOptions"
          @select="readCaret"
          @keyup="readCaret"
          @keydown="onKeydown"
          @compositionstart="composing = true"
          @compositionend="composing = false"
        />
        <button
          v-if="query"
          type="button"
          class="icon-button search-clear"
          aria-label="清除搜索内容"
          title="清除搜索内容"
          @click="clearSearch"
        >
          <X :size="16" aria-hidden="true" />
        </button>
        <button
          type="submit"
          class="icon-button"
          aria-label="添加条件"
          title="添加条件"
          :disabled="!query.trim()"
          @mousedown.prevent
        >
          <Plus :size="20" aria-hidden="true" />
        </button>
      </div>
      <slot name="actions" />
    </div>
    <slot />
    <div v-if="historyOptions.length" class="tag-suggestions">
      <div class="flex items-center justify-between gap-2 px-2.5 text-xs text-muted">
        <span>最近搜索</span>
        <button
          type="button"
          class="min-h-11 rounded-md px-2 hover:bg-panel"
          aria-haspopup="dialog"
          @mousedown.prevent
          @click="confirmClearHistory = true"
        >
          清空历史
        </button>
      </div>
      <ul :id="listId" ref="list" class="m-0 list-none p-0" role="listbox" aria-label="最近搜索">
        <li
          v-for="(term, index) in historyOptions"
          :id="listId + '-' + index"
          :key="term"
          role="option"
          :aria-selected="index === activeIndex"
          @mousedown.prevent
          @click="emit('selectHistory', term)"
        >
          <span class="flex items-center gap-2.5">
            <History :size="16" class="shrink-0 text-muted" aria-hidden="true" />
            <span>{{ term }}</span>
          </span>
        </li>
      </ul>
    </div>
    <ul
      v-else-if="suggestions.length"
      :id="listId"
      ref="list"
      class="tag-suggestions"
      role="listbox"
      aria-label="标签联想"
    >
      <li
        v-for="(option, index) in suggestions"
        :id="listId + '-' + index"
        :key="option.key"
        role="option"
        :aria-selected="index === activeIndex"
        @mousedown.prevent
        @click="emit('add', option.query)"
      >
        <span>{{ option.label }}</span>
        <small>{{ option.key }}</small>
      </li>
    </ul>
    <div v-else-if="canSuggest && query.trim() && (loading || failed)" class="tag-suggestions tag-suggestion-status">
      <p role="status">{{ loading ? '正在加载标签词库…' : '标签词库加载失败' }}</p>
      <button v-if="failed && !loading" class="pill" type="button" @mousedown.prevent @click="retryTags">重试</button>
    </div>
    <p v-else-if="!query.trim() && !recent.length" class="px-2.5 pt-5 text-muted">还没有搜索记录</p>
    <ConfirmationDialog
      v-if="confirmClearHistory"
      title="清空搜索历史？"
      message="将删除所有最近的搜索记录。"
      confirm-label="清空"
      :busy="false"
      error=""
      @cancel="closeClearHistory"
      @confirm="clearHistory"
    />
  </form>
</template>
