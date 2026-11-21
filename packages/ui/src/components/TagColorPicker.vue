<script setup lang="ts">
import { computed, shallowRef, useId, useTemplateRef } from 'vue'
import { Check, ChevronDown, Pipette, X } from '@lucide/vue'

const swatches = [
  { name: '红色', value: '#cc3d46' },
  { name: '橙色', value: '#dc6a3a' },
  { name: '金黄', value: '#d9a023' },
  { name: '橄榄绿', value: '#79a13b' },
  { name: '翠绿', value: '#2b9461' },
  { name: '青绿', value: '#229e99' },
  { name: '天蓝', value: '#368ebf' },
  { name: '靛蓝', value: '#4168cb' },
  { name: '紫色', value: '#7956c5' },
  { name: '玫瑰粉', value: '#c4558e' },
  { name: '棕色', value: '#916749' },
  { name: '蓝灰', value: '#697485' },
]

const props = defineProps<{ defaultColor: string }>()
const color = defineModel<string>({ required: true })
const dialogId = useId()
const dialog = useTemplateRef('dialog')
const trigger = useTemplateRef('trigger')
const draft = shallowRef('')

function normalize(value: string): string | undefined {
  const hex = value.trim().toLowerCase().replace(/^#/, '')
  if (!value.trim()) return ''
  if (/^[0-9a-f]{6}$/.test(hex)) return '#' + hex
  if (/^[0-9a-f]{3}$/.test(hex)) return '#' + [...hex].map((digit) => digit.repeat(2)).join('')
}

const normalized = computed(() => normalize(draft.value))
const invalid = computed(() => normalized.value === undefined && draft.value !== color.value)
const previewColor = computed(
  () => normalized.value || (invalid.value ? color.value : draft.value) || props.defaultColor,
)
const nativeColor = computed(() => normalize(previewColor.value) || '#000000')

function open(): void {
  draft.value = color.value
  dialog.value?.showModal()
}

function close(): void {
  dialog.value?.close()
  trigger.value?.focus({ preventScroll: true })
}

function confirm(): void {
  if (invalid.value) return
  if (draft.value !== color.value && normalized.value !== undefined) color.value = normalized.value
  close()
}

function pickNative(event: Event): void {
  if (event.target instanceof HTMLInputElement) draft.value = event.target.value
}
</script>

<template>
  <div class="tags-field">
    <span>颜色</span>
    <button
      ref="trigger"
      class="tag-color-trigger"
      type="button"
      :aria-label="'选择标签颜色，当前：' + (color || '默认颜色')"
      aria-haspopup="dialog"
      :aria-controls="dialogId"
      @click="open"
    >
      <span class="tag-color" :style="{ backgroundColor: color || defaultColor }" aria-hidden="true" />
      <span>{{ color || '默认颜色' }}</span>
      <ChevronDown :size="15" aria-hidden="true" />
    </button>
  </div>

  <dialog
    :id="dialogId"
    ref="dialog"
    class="tag-color-dialog"
    :aria-labelledby="dialogId + '-title'"
    @click.self="close"
    @cancel.prevent="close"
    @touchmove.self.prevent
    @wheel.self.prevent
  >
    <div class="tag-color-panel">
      <header class="tag-color-header">
        <h3 :id="dialogId + '-title'">选择标签颜色</h3>
        <button class="icon-button" type="button" autofocus aria-label="关闭颜色面板" @click="close">
          <X :size="20" aria-hidden="true" />
        </button>
      </header>

      <div class="tag-color-content">
        <fieldset class="tag-color-presets">
          <legend>预设颜色</legend>
          <div class="tag-color-swatches">
            <label v-for="swatch in swatches" :key="swatch.value" class="tag-color-swatch" :title="swatch.name">
              <input
                type="radio"
                :name="dialogId + '-preset'"
                :value="swatch.value"
                :checked="normalized === swatch.value"
                :aria-label="swatch.name"
                @change="draft = swatch.value"
              />
              <span class="tag-color-chip" :style="{ backgroundColor: swatch.value }" aria-hidden="true">
                <span class="tag-color-check"><Check :size="14" /></span>
              </span>
            </label>
          </div>
        </fieldset>

        <label class="tag-color-native">
          <span class="tag-color-preview" :style="{ backgroundColor: previewColor }" aria-hidden="true" />
          <span>打开系统取色器</span>
          <Pipette :size="18" aria-hidden="true" />
          <input :value="nativeColor" type="color" @input="pickNative" @change="pickNative" />
        </label>

        <div class="tag-color-custom">
          <label class="tag-color-hex">
            <span>色值</span>
            <input
              v-model="draft"
              type="text"
              placeholder="#RRGGBB"
              spellcheck="false"
              autocapitalize="off"
              :aria-invalid="invalid || undefined"
              :aria-describedby="invalid ? dialogId + '-error' : undefined"
              @keydown.enter.prevent="confirm"
            />
          </label>
          <button class="pill" type="button" @click="draft = ''">恢复默认</button>
        </div>
        <p v-if="invalid" :id="dialogId + '-error'" class="tag-color-error" role="status">
          输入 3 位或 6 位十六进制色值。
        </p>
      </div>

      <footer class="tag-color-footer">
        <button class="pill" type="button" @click="close">取消</button>
        <button class="pill tags-primary" type="button" :disabled="invalid" @click="confirm">应用颜色</button>
      </footer>
    </div>
  </dialog>
</template>
