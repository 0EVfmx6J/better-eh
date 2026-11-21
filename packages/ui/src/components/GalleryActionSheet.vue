<script setup lang="ts">
import { Bookmark, Trash2, X } from '@lucide/vue'
import { onMounted, useId, useTemplateRef } from 'vue'
import { librarySections, type LibrarySection } from '../utils/reading-library-route'

defineProps<{ title: string; busy: boolean; removalSection?: LibrarySection }>()
const emit = defineEmits<{ close: []; submit: [event: MouseEvent] }>()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const titleId = useId()

onMounted(() => dialog.value?.showModal())
defineExpose({ closeDialog: () => dialog.value?.close() })
</script>

<template>
  <dialog
    ref="dialog"
    class="card-action-sheet"
    :aria-labelledby="titleId"
    @cancel.prevent="emit('close')"
    @click.self="emit('close')"
    @touchmove.self.prevent
    @wheel.self.prevent
  >
    <div class="card-action-sheet-panel">
      <header class="card-action-sheet-header">
        <h2 :id="titleId">{{ title }}</h2>
        <button class="icon-button" type="button" aria-label="关闭画廊操作" @click="emit('close')">
          <X :size="20" aria-hidden="true" />
        </button>
      </header>
      <button
        class="card-action-sheet-button"
        :class="{ 'action-button-danger-subtle': removalSection }"
        type="button"
        autofocus
        :disabled="busy"
        @click="emit('submit', $event)"
      >
        <Trash2 v-if="removalSection" :size="19" aria-hidden="true" />
        <Bookmark v-else :size="19" aria-hidden="true" />
        {{ removalSection ? `从${librarySections[removalSection]}移除` : '添加到稍后阅读' }}
      </button>
    </div>
  </dialog>
</template>
