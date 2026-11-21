<script setup lang="ts">
import { computed, nextTick, shallowRef, useId, useTemplateRef, watch } from 'vue'
import { Search, X } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import type { CompleteTags, TagCompletion } from '@better-eh/core'
import { useTagDirectoryStore } from '../stores/tag-directory'

const { directory, loading, failed } = storeToRefs(useTagDirectoryStore())
const props = defineProps<{ completeTags?: CompleteTags }>()
const emit = defineEmits<{ submit: []; load: [] }>()
const query = defineModel<string>({ required: true })
const control = useTemplateRef('control')
const list = useTemplateRef('list')
const listId = useId()
const focused = shallowRef(false)
const composing = shallowRef(false)
const dismissed = shallowRef(false)
const caret = shallowRef(0)
const activeIndex = shallowRef(-1)
const remoteOptions = shallowRef<TagCompletion[]>([])
const remotePending = shallowRef(false)
defineExpose({
  focus: () => control.value?.focus({ preventScroll: true }),
  focusAtEnd,
})
const canSuggest = computed(() => focused.value && !composing.value && !dismissed.value)
const localOptions = computed(() =>
  canSuggest.value ? (directory.value?.complete(query.value, caret.value) ?? []) : [],
)
const suggestions = computed(() => {
  if (!canSuggest.value) return []
  if (localOptions.value.length || !props.completeTags) return localOptions.value
  return remoteOptions.value.map((option) => ({
    ...option,
    label: directory.value?.translate(option.key) ?? option.label,
  }))
})
const canRequest = computed(() => canSuggest.value && Boolean(directory.value) && !localOptions.value.length)
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
const activeId = computed(() => (suggestions.value[activeIndex.value] ? listId + '-' + activeIndex.value : undefined))
watch(suggestions, () => {
  activeIndex.value = -1
})

function readCaret(): void {
  caret.value = control.value?.selectionStart ?? query.value.length
}

function focusAtEnd(): void {
  const input = control.value
  if (!input) return
  input.focus({ preventScroll: true })
  caret.value = query.value.length
  input.setSelectionRange(caret.value, caret.value)
  dismissed.value = true
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

function edit(): void {
  dismissed.value = false
  readCaret()
}

function clearSearch(): void {
  query.value = ''
  focusAtEnd()
}

async function selectTag(option: TagCompletion): Promise<void> {
  control.value?.focus()
  query.value = option.query
  caret.value = option.caret
  dismissed.value = true
  await nextTick()
  control.value?.setSelectionRange(option.caret, option.caret)
}

function onKeydown(event: KeyboardEvent): void {
  if (composing.value || event.isComposing) return
  const count = suggestions.value.length
  if (event.key === 'Escape' && (count || remotePending.value)) {
    event.preventDefault()
    dismissed.value = true
  } else if (count && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault()
    const step = event.key === 'ArrowDown' ? 1 : -1
    const current = activeIndex.value
    activeIndex.value = current < 0 && step < 0 ? count - 1 : (current + step + count) % count
    list.value?.children[activeIndex.value]?.scrollIntoView({ block: 'nearest' })
  } else if (event.key === 'Enter') {
    const option = suggestions.value[activeIndex.value]
    if (option) {
      event.preventDefault()
      void selectTag(option)
    }
  }
}

function submit(): void {
  if (composing.value) return
  dismissed.value = true
  control.value?.blur()
  emit('submit')
}
</script>

<template>
  <form class="search-box flex items-center" role="search" @focusout="onBlur" @submit.prevent="submit">
    <input
      ref="control"
      v-model="query"
      type="search"
      role="combobox"
      placeholder="搜索画廊或标签"
      aria-label="搜索画廊或标签"
      aria-autocomplete="list"
      :aria-expanded="suggestions.length > 0"
      :aria-controls="suggestions.length ? listId : undefined"
      :aria-activedescendant="activeId"
      autocomplete="off"
      enterkeyhint="search"
      @focus="onFocus"
      @input="edit"
      @click="edit"
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
    <button type="submit" class="icon-button" aria-label="搜索"><Search :size="18" aria-hidden="true" /></button>
    <ul v-if="suggestions.length" :id="listId" ref="list" class="tag-suggestions" role="listbox" aria-label="标签联想">
      <li
        v-for="(option, index) in suggestions"
        :id="listId + '-' + index"
        :key="option.key"
        role="option"
        :aria-selected="index === activeIndex"
        @mousedown.prevent
        @click="selectTag(option)"
      >
        <span>{{ option.label }}</span>
        <small>{{ option.key }}</small>
      </li>
    </ul>
    <div v-else-if="focused && query.trim() && (loading || failed)" class="tag-suggestions tag-suggestion-status">
      <p role="status">{{ loading ? '正在加载标签词库…' : '标签词库加载失败' }}</p>
      <button v-if="failed && !loading" class="pill" type="button" @mousedown.prevent @click="retryTags">重试</button>
    </div>
  </form>
</template>
