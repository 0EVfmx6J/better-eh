<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { computed, useTemplateRef } from 'vue'
import type { Thumbnail } from '@better-eh/core'

const props = defineProps<{ thumb: Thumbnail }>()
const tile = useTemplateRef('tile')
const { width, height } = useElementSize(tile)
const crop = computed(() => {
  const sprite = props.thumb.sprite
  if (!sprite) return undefined
  const scale = Math.min(width.value / sprite.width, height.value / sprite.height)
  return {
    width: sprite.width + 'px',
    height: sprite.height + 'px',
    left: (width.value - sprite.width * scale) / 2 + 'px',
    top: (height.value - sprite.height * scale) / 2 + 'px',
    transform: 'scale(' + scale + ')',
    backgroundImage: 'url("' + props.thumb.image + '")',
    backgroundPosition: sprite.x + 'px ' + sprite.y + 'px',
  }
})
</script>

<template>
  <div ref="tile" class="thumbnail-image relative aspect-[4/5] overflow-hidden bg-panel">
    <span v-if="crop" class="thumbnail-sprite absolute origin-top-left bg-no-repeat" :style="crop" />
    <img
      class="size-full object-contain"
      v-else-if="thumb.image"
      :src="thumb.image"
      alt=""
      loading="lazy"
      decoding="async"
    />
    <span v-else class="muted grid h-full place-items-center">{{ thumb.index }}</span>
  </div>
</template>
