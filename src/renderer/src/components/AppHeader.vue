<script setup lang="ts">
import type { VNode } from 'vue'
import { h } from 'vue'
import { NButton, NIcon, NSpace, NText } from 'naive-ui'

defineProps<{
  showBack?: boolean
}>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'home'): void
  (e: 'settings'): void
}>()

// 简单的 inline SVG 图标，避免引入额外图标库
const BackIcon = (): VNode =>
  h('svg', { viewBox: '0 0 24 24', width: '18', height: '18', fill: 'currentColor' }, [
    h('path', {
      d: 'M15.7 4.3a1 1 0 0 1 0 1.4L9.4 12l6.3 6.3a1 1 0 1 1-1.4 1.4l-7-7a1 1 0 0 1 0-1.4l7-7a1 1 0 0 1 1.4 0Z'
    })
  ])

const SettingsIcon = (): VNode =>
  h('svg', { viewBox: '0 0 24 24', width: '18', height: '18', fill: 'currentColor' }, [
    h('path', {
      d: 'M19.14 12.94a7.86 7.86 0 0 0 .06-.94 7.86 7.86 0 0 0-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.8 7.8 0 0 0-1.63-.95l-.36-2.54a.5.5 0 0 0-.5-.43h-3.84a.5.5 0 0 0-.5.43l-.36 2.54a7.8 7.8 0 0 0-1.63.95l-2.39-.96a.5.5 0 0 0-.61.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.86 7.86 0 0 0-.06.94c0 .32.03.63.06.94L2.83 14.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.39-.96c.5.38 1.05.7 1.63.95l.36 2.54a.5.5 0 0 0 .5.43h3.84a.5.5 0 0 0 .5-.43l.36-2.54c.58-.25 1.13-.57 1.63-.95l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5Z'
    })
  ])

const PrismIcon = (): VNode =>
  h(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: '20',
      height: '20',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linejoin': 'round'
    },
    [h('path', { d: 'M12 2 L22 20 L2 20 Z' }), h('line', { x1: '12', y1: '2', x2: '12', y2: '20' })]
  )
</script>

<template>
  <NSpace align="center" justify="space-between" style="width: 100%">
    <NSpace align="center" :size="12">
      <NButton v-if="showBack" quaternary size="small" @click="emit('back')">
        <template #icon>
          <NIcon>
            <BackIcon />
          </NIcon>
        </template>
        返回
      </NButton>
      <NSpace
        align="center"
        :size="8"
        style="cursor: pointer; user-select: none"
        @click="emit('home')"
      >
        <NIcon :size="20" color="#4284f0">
          <PrismIcon />
        </NIcon>
        <NText strong style="font-size: 16px">Prism 棱镜</NText>
      </NSpace>
    </NSpace>
    <NSpace align="center">
      <NButton quaternary size="small" @click="emit('settings')">
        <template #icon>
          <NIcon>
            <SettingsIcon />
          </NIcon>
        </template>
        设置
      </NButton>
    </NSpace>
  </NSpace>
</template>
