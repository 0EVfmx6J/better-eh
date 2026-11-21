<script setup lang="ts">
import LoadingSpinner from './LoadingSpinner.vue'

defineProps<{ loading: boolean; error?: string; showHint: boolean }>()
const emit = defineEmits<{ load: []; retry: [] }>()
</script>

<template>
  <div class="infinite-sentinel grid min-h-[94px] touch-pan-y place-items-center pt-6 pb-[38px]" aria-live="polite">
    <div class="infinite-sentinel-inner" :class="{ 'is-loading': loading }">
      <LoadingSpinner v-if="loading" :size="18" />
      <span v-else-if="error" class="infinite-error">
        <span>{{ error }}</span>
        <button class="pill" type="button" @click="emit('retry')">重试</button>
      </span>
      <button
        v-else-if="showHint"
        class="infinite-hint min-h-9 rounded-[9px] px-3 py-1.5 text-[12px] text-muted [border:1px_solid_var(--line)] active:[transform:scale(.97)]"
        type="button"
        @click="emit('load')"
      >
        继续下滑加载更多
      </button>
    </div>
  </div>
</template>
