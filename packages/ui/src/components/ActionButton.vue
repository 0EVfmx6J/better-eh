<script setup lang="ts">
defineProps<{
  href?: string
  variant?: 'primary' | 'secondary' | 'danger' | 'danger-subtle'
}>()
</script>

<template>
  <component
    :is="href ? 'a' : 'button'"
    :href="href"
    :type="href ? undefined : 'button'"
    class="pill action-button"
    :class="variant && variant !== 'secondary' ? 'action-button-' + variant : undefined"
  >
    <slot />
  </component>
</template>
