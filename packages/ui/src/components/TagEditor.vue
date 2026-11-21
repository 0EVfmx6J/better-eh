<script setup lang="ts">
import { onMounted, reactive, ref, useTemplateRef } from 'vue'
import type { ManagedTag, TagChange, TagPreferences } from '@better-eh/core'
import TagColorPicker from './TagColorPicker.vue'

const props = defineProps<{
  tag?: ManagedTag
  defaultColor: string
  saving: boolean
  error?: string
}>()
const emit = defineEmits<{ save: [change: TagChange]; cancel: [] }>()
const form = useTemplateRef('form')
const name = ref('')
const preferences = reactive<TagPreferences>({
  color: props.tag?.color ?? '',
  weight: props.tag?.weight ?? 10,
  watched: props.tag?.watched ?? false,
  hidden: props.tag?.hidden ?? false,
})

onMounted(() => {
  if (!props.tag) form.value?.focus()
})

function submit(): void {
  if (props.saving || typeof preferences.weight !== 'number' || !Number.isInteger(preferences.weight)) return
  if (props.tag) {
    emit('save', { kind: 'edit', id: props.tag.id, ...preferences })
  } else if (name.value.trim()) {
    emit('save', { kind: 'add', name: name.value.trim(), ...preferences })
  }
}
</script>

<template>
  <form
    ref="form"
    class="tags-editor"
    :aria-label="tag ? '编辑标签 ' + tag.name : '添加标签'"
    tabindex="-1"
    @submit.prevent="submit"
  >
    <h2 v-if="!tag">添加标签</h2>
    <fieldset class="tags-fields" :disabled="saving">
      <label v-if="!tag" class="tags-field">
        标签名称
        <input v-model="name" placeholder="namespace:tag" required />
      </label>
      <TagColorPicker v-model="preferences.color" :default-color="defaultColor" />
      <label class="tags-field">
        权重
        <input v-model.number="preferences.weight" type="number" min="-99" max="99" step="1" required />
      </label>
      <label class="tags-check"><input v-model="preferences.watched" type="checkbox" /> 关注</label>
      <label class="tags-check"><input v-model="preferences.hidden" type="checkbox" /> 隐藏</label>
    </fieldset>
    <p v-if="error" class="notice" role="alert">{{ error }}</p>
    <div class="flex flex-wrap gap-2">
      <button class="pill tags-primary" type="submit" :disabled="saving">{{ saving ? '保存中…' : '保存' }}</button>
      <button class="pill" type="button" :disabled="saving" @click="emit('cancel')">取消</button>
    </div>
  </form>
</template>
