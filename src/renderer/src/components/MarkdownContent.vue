<script setup lang="ts">
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'

const props = defineProps<{
  source: string
}>()

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false
})

const html = computed<string>(() => {
  if (!props.source) return ''
  return md.render(props.source)
})
</script>

<template>
  <!-- v-html 源是 markdown-it 渲染结果，开启 html: false 已过滤原始 HTML 标签；此处明确信任渲染产物 -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="markdown-body" v-html="html"></div>
</template>
