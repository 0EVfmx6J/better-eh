<script setup lang="ts">
import { onBeforeUnmount, onMounted, useId, useTemplateRef } from 'vue'
import ActionButton from './ActionButton.vue'

defineProps<{ title: string; message: string; confirmLabel: string; busy: boolean; error: string }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const dialog = useTemplateRef('dialog')
const id = useId()

onMounted(() => dialog.value?.showModal())
onBeforeUnmount(() => dialog.value?.close())
</script>

<template>
  <dialog
    ref="dialog"
    class="confirmation-dialog"
    role="alertdialog"
    :aria-busy="busy"
    :aria-labelledby="id + '-title'"
    :aria-describedby="id + '-message'"
    @cancel.prevent="!busy && emit('cancel')"
    @click.self="!busy && emit('cancel')"
    @touchmove.self.prevent
    @wheel.self.prevent
  >
    <div class="confirmation-content p-5 wrap-anywhere">
      <h2 :id="id + '-title'">{{ title }}</h2>
      <p :id="id + '-message'">{{ message }}</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="confirmation-actions mt-[18px] flex flex-wrap justify-end gap-2">
        <ActionButton autofocus :disabled="busy" @click="emit('cancel')">取消</ActionButton>
        <ActionButton variant="danger" :disabled="busy" @click="emit('confirm')">{{ confirmLabel }}</ActionButton>
      </div>
    </div>
  </dialog>
</template>
