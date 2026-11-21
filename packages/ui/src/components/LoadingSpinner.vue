<script setup lang="ts">
defineProps<{ size: number }>()
</script>

<template>
  <div class="relative align-middle text-[0]" aria-live="polite" aria-busy="true">
    <svg
      class="relative inline-block max-h-full max-w-full align-middle"
      :style="{ width: size + 'px', height: size + 'px' }"
      viewBox="25 25 50 50"
      aria-hidden="true"
    >
      <circle
        cx="50"
        cy="50"
        r="20"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
        class="[stroke-dasharray:28_126] motion-safe:animate-loading-spinner"
      />
    </svg>
  </div>
</template>
