<script setup lang="ts">
import { ArrowDown } from '@lucide/vue'
import LoadingSpinner from './LoadingSpinner.vue'

defineProps<{ offset: number; ready: boolean; refreshing: boolean }>()
</script>

<template>
  <div v-if="offset > 0" class="pull-refresh-reveal" :style="{ height: offset + 'px' }" aria-hidden="true">
    <span class="pull-refresh-chip">
      <LoadingSpinner v-if="refreshing" :size="16" />
      <ArrowDown v-else :size="16" :class="{ 'pull-refresh-ready': ready }" />
      {{ refreshing ? '正在刷新' : ready ? '松手刷新' : '下拉刷新' }}
    </span>
  </div>
</template>
