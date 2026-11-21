<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, useId, watch } from 'vue'
import { Plus, Search } from '@lucide/vue'
import type { TagChange, TagsPage } from '@better-eh/core'
import { useTagDirectoryStore } from '../stores/tag-directory'
import TagEditor from './TagEditor.vue'

type Feedback = { type: 'status' | 'error'; text: string; tagId?: string }

const props = defineProps<{
  page: TagsPage
  commit: (change: TagChange) => Promise<void>
}>()
const emit = defineEmits<{ navigate: [event: MouseEvent, url: string] }>()
const tags = useTagDirectoryStore()
const filter = ref('')
const editor = shallowRef<{ trigger: HTMLButtonElement; tagId?: string }>()
const editorId = useId()
const selected = ref<string[]>([])
const target = ref('')
const confirmRemove = ref(false)
const saving = ref(false)
const feedback = shallowRef<Feedback>()
const groups = computed(() => props.page.groups.filter((group) => group.id !== props.page.activeGroup))
const rows = computed(() => {
  const query = filter.value.trim().toLowerCase()
  const visible = props.page.tags.filter(
    (tag) => tag.name.toLowerCase().includes(query) || tags.translate?.(tag.name)?.toLowerCase().includes(query),
  )
  const editedId = editor.value?.tagId
  const edited = editedId === undefined ? undefined : props.page.tags.find((tag) => tag.id === editedId)
  // Keep the draft mounted when the search temporarily hides its row.
  if (edited && !visible.includes(edited)) {
    return { tags: [...visible, edited], hiddenId: edited.id, count: visible.length }
  }
  return { tags: visible, hiddenId: undefined, count: visible.length }
})

watch(
  selected,
  () => {
    confirmRemove.value = false
  },
  { deep: true },
)

async function closeEditor(): Promise<void> {
  const trigger = editor.value?.trigger
  editor.value = undefined
  await nextTick()
  trigger?.focus({ preventScroll: true })
}

function toggleEditor(event: MouseEvent, tagId?: string): void {
  const trigger = event.currentTarget
  if (!(trigger instanceof HTMLButtonElement)) return
  if (feedback.value?.type === 'error') feedback.value = undefined
  if (editor.value?.trigger === trigger) void closeEditor()
  else editor.value = { trigger, tagId }
}

function makeInert(element: Element): void {
  element.setAttribute('inert', '')
}

async function apply(change: TagChange, message: string): Promise<boolean> {
  if (saving.value) return false
  saving.value = true
  feedback.value = undefined
  const tagId = change.kind === 'edit' ? change.id : undefined
  try {
    await props.commit(change)
    feedback.value = { type: 'status', tagId, text: message }
    return true
  } catch (reason) {
    feedback.value = { type: 'error', tagId, text: reason instanceof Error ? reason.message : '标签操作失败。' }
    return false
  } finally {
    saving.value = false
  }
}

async function save(change: TagChange): Promise<void> {
  if (await apply(change, change.kind === 'edit' ? '已保存标签。' : '已添加标签。')) await closeEditor()
}

async function move(): Promise<void> {
  const ids = [...selected.value]
  if (target.value && (await apply({ kind: 'move', ids, target: target.value }, '已移动所选标签。')))
    selected.value = []
}

async function remove(): Promise<void> {
  if (await apply({ kind: 'remove', ids: [...selected.value] }, '已删除所选标签。')) selected.value = []
}
</script>

<template>
  <section aria-labelledby="tags-title" :aria-busy="saving">
    <div class="tags-heading flex flex-wrap items-center justify-between gap-3">
      <h1 id="tags-title">{{ page.title }}</h1>
      <button
        v-if="page.canAdd"
        class="pill tags-primary"
        type="button"
        :aria-expanded="Boolean(editor && editor.tagId === undefined)"
        :disabled="saving"
        @click="toggleEditor"
      >
        <Plus :size="17" aria-hidden="true" /> 添加标签
      </button>
    </div>

    <nav v-if="page.groups.length" class="tags-groups my-5 flex flex-wrap gap-2" aria-label="标签组">
      <a
        v-for="group in page.groups"
        :key="group.id"
        class="pill"
        :aria-current="group.id === page.activeGroup ? 'true' : undefined"
        :href="group.href"
        @click="emit('navigate', $event, group.href)"
        >{{ group.label }}</a
      >
    </nav>

    <div class="tags-tools flex flex-wrap items-center justify-between gap-3">
      <label class="tags-filter">
        <Search :size="17" aria-hidden="true" />
        <input v-model="filter" type="search" aria-label="筛选标签" placeholder="筛选标签" />
      </label>
      <span class="count"
        >{{ rows.count }} / {{ page.tags.length }} 个标签<span v-if="!page.groupEnabled"> · 组已停用</span></span
      >
    </div>

    <template v-if="feedback && feedback.tagId === undefined">
      <p v-if="feedback.type === 'error'" class="notice" role="alert">{{ feedback.text }}</p>
      <p v-else class="tags-status my-3 text-muted" role="status">{{ feedback.text }}</p>
    </template>

    <TagEditor
      v-if="editor && editor.tagId === undefined"
      :default-color="page.defaultColor"
      :saving="saving"
      @save="save"
      @cancel="closeEditor"
    />

    <div v-if="selected.length" class="tags-bulk flex flex-wrap items-center gap-2">
      <span class="count">已选 {{ selected.length }} 个</span>
      <template v-if="confirmRemove">
        <button class="pill action-button-danger" type="button" :disabled="saving" @click="remove">
          确认删除所选标签
        </button>
        <button class="pill" type="button" :disabled="saving" @click="confirmRemove = false">取消</button>
      </template>
      <template v-else>
        <select
          v-if="groups.length"
          v-model="target"
          class="tags-select"
          aria-label="移动目标标签组"
          :disabled="saving"
        >
          <option value="">选择目标组</option>
          <option v-for="group in groups" :key="group.id" :value="group.id">{{ group.label }}</option>
        </select>
        <button v-if="groups.length" class="pill" type="button" :disabled="saving || !target" @click="move">
          移动
        </button>
        <button class="pill action-button-danger-subtle" type="button" :disabled="saving" @click="confirmRemove = true">
          删除
        </button>
        <button class="pill" type="button" :disabled="saving" @click="selected = []">清除选择</button>
      </template>
    </div>

    <ul v-if="rows.tags.length" v-show="rows.count > 0" class="tags-list" aria-label="当前组的标签">
      <li
        v-for="tag in rows.tags"
        v-show="tag.id !== rows.hiddenId"
        :key="tag.id"
        class="tags-row [border-bottom:1px_solid_var(--line)]"
      >
        <div class="tags-row-header">
          <label class="tags-check">
            <input
              v-model="selected"
              type="checkbox"
              :value="tag.id"
              :aria-label="'选择 ' + tag.name"
              :disabled="saving"
            />
          </label>
          <div class="tag-info flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span class="tag-color" :style="{ backgroundColor: tag.color || page.defaultColor }" aria-hidden="true" />
            <strong class="tag-name wrap-anywhere" :title="tag.name">
              {{ tags.translate?.(tag.name) || tag.name }}
            </strong>
            <span v-if="tag.watched" class="tag-state">关注</span>
            <span v-if="tag.hidden" class="tag-state">隐藏</span>
            <span class="tag-weight">权重 {{ tag.weight }}</span>
          </div>
          <button
            v-if="page.canEdit"
            class="pill"
            type="button"
            :aria-label="(editor?.tagId === tag.id ? '收起 ' : '编辑 ') + tag.name"
            :aria-expanded="editor?.tagId === tag.id"
            :aria-controls="editor?.tagId === tag.id ? editorId + '-' + tag.id : undefined"
            :disabled="saving"
            @click="toggleEditor($event, tag.id)"
          >
            {{ editor?.tagId === tag.id ? '收起' : '编辑' }}
          </button>
        </div>
        <Transition name="tag-expand" @before-leave="makeInert">
          <div v-if="editor?.tagId === tag.id" :id="editorId + '-' + tag.id" class="tags-row-editor">
            <div>
              <TagEditor
                :tag="tag"
                :default-color="page.defaultColor"
                :saving="saving"
                :error="feedback?.type === 'error' && feedback.tagId === tag.id ? feedback.text : undefined"
                @save="save"
                @cancel="closeEditor"
              />
            </div>
          </div>
        </Transition>
        <p v-if="feedback?.type === 'status' && feedback.tagId === tag.id" class="tag-edit-status" role="status">
          {{ feedback.text }}
        </p>
      </li>
    </ul>
    <p v-if="!rows.count" class="empty">{{ filter.trim() ? '没有匹配的标签。' : '此组还没有标签。' }}</p>
  </section>
</template>
