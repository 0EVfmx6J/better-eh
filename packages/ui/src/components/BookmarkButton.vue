<script setup lang="ts">
import { Bookmark } from '@lucide/vue'
import ActionButton from './ActionButton.vue'
import GalleryCardAction from './GalleryCardAction.vue'

defineProps<{ saved: boolean; busy: boolean; compact?: boolean; catalogTitle?: string }>()
const emit = defineEmits<{ toggle: [event: MouseEvent] }>()
</script>

<template>
  <GalleryCardAction
    v-if="catalogTitle !== undefined"
    :title="catalogTitle"
    :label="saved ? '从稍后阅读移除' : '稍后阅读'"
    :pressed="saved"
    :destructive="saved"
    :busy="busy"
    @click="emit('toggle', $event)"
  >
    {{ saved ? '从稍后阅读移除' : '添加到稍后阅读' }}
  </GalleryCardAction>
  <button
    v-else-if="compact"
    type="button"
    class="icon-button"
    :class="{ 'action-button-danger-subtle': saved }"
    :aria-label="saved ? '从稍后阅读移除' : '稍后阅读'"
    :title="saved ? '从稍后阅读移除' : '稍后阅读'"
    :aria-pressed="saved"
    :aria-haspopup="saved ? 'dialog' : undefined"
    :disabled="busy"
    @click="emit('toggle', $event)"
  >
    <Bookmark :size="18" aria-hidden="true" />
  </button>
  <ActionButton
    v-else
    :variant="saved ? 'danger-subtle' : 'secondary'"
    :aria-pressed="saved"
    :aria-haspopup="saved ? 'dialog' : undefined"
    :disabled="busy"
    @click="emit('toggle', $event)"
  >
    <Bookmark :size="17" aria-hidden="true" /> {{ saved ? '从稍后阅读移除' : '稍后阅读' }}
  </ActionButton>
</template>
