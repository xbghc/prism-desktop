<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NSpace, NSpin, NText } from 'naive-ui'
import type { ContentEntry } from '../stores/content'

const props = withDefaults(
  defineProps<{
    entry: ContentEntry
    label: string
    canGenerate?: boolean
  }>(),
  { canGenerate: true }
)

const emit = defineEmits<{
  (e: 'generate'): void
  (e: 'cancel'): void
}>()

const isStreaming = computed(() => props.entry.state === 'streaming')
</script>

<template>
  <NSpace vertical :size="12" align="center" style="padding: 28px 0">
    <NText depth="3" style="font-size: 13px">还没有{{ label }}</NText>
    <NSpace v-if="isStreaming" align="center" :size="8">
      <NSpin size="small" />
      <NText depth="3" style="font-size: 12px">准备中…</NText>
      <NButton size="small" type="warning" @click="emit('cancel')">取消</NButton>
    </NSpace>
    <NButton v-else type="primary" size="small" :disabled="!canGenerate" @click="emit('generate')">
      生成{{ label }}
    </NButton>
  </NSpace>
</template>
