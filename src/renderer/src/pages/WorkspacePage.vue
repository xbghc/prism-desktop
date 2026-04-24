<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref, watch, type VNode } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import {
  NAlert,
  NButton,
  NCard,
  NDescriptions,
  NDescriptionsItem,
  NEmpty,
  NIcon,
  NProgress,
  NResult,
  NSpace,
  NTabPane,
  NTabs,
  NTag,
  NText,
  useMessage
} from 'naive-ui'
import { useWorkspaceStore } from '../stores/workspace'
import { useContentStore, type ContentEntry } from '../stores/content'
import MarkdownContent from '../components/MarkdownContent.vue'
import ContentSlotEmpty from '../components/ContentSlotEmpty.vue'
import type {
  ContentType,
  Workspace,
  WorkspaceResource,
  WorkspaceStatus
} from '../../../shared/types'

const route = useRoute()
const router = useRouter()
const wsStore = useWorkspaceStore()
const contentStore = useContentStore()
const message = useMessage()

const { active } = storeToRefs(wsStore)

const loadError = ref<string | null>(null)
const activeTab = ref<ContentType>('transcript')

const id = computed<string>(() => String(route.params.id))

interface TabDef {
  key: ContentType
  label: string
  needsTranscript: boolean
  needsScript?: boolean
  isAudio?: boolean
}

const TABS: TabDef[] = [
  { key: 'transcript', label: '转录', needsTranscript: false },
  { key: 'outline', label: '大纲', needsTranscript: true },
  { key: 'article', label: '文章', needsTranscript: true },
  { key: 'podcast_script', label: '播客脚本', needsTranscript: true },
  {
    key: 'podcast_audio',
    label: '播客音频',
    needsTranscript: true,
    needsScript: true,
    isAudio: true
  }
]

const OpenFolderIcon = (): VNode =>
  h('svg', { viewBox: '0 0 24 24', width: '14', height: '14', fill: 'currentColor' }, [
    h('path', {
      d: 'M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2Z'
    })
  ])

function findResource(ws: Workspace, name: ContentType): WorkspaceResource | undefined {
  return ws.resources.find((r) => r.name === name)
}

function hydrateResources(): void {
  const ws = active.value
  if (!ws) return
  for (const tab of TABS) {
    if (tab.isAudio) continue
    const res = findResource(ws, tab.key)
    if (res?.content) {
      contentStore.hydrate(ws.workspaceId, tab.key, res.content)
    }
  }
}

async function ensureLoaded(): Promise<void> {
  loadError.value = null
  if (!id.value) return
  const existing = wsStore.list.find((w) => w.workspaceId === id.value)
  if (existing) {
    wsStore.setActive(id.value)
  } else {
    const ws = await wsStore.loadOne(id.value)
    if (!ws) {
      loadError.value = wsStore.lastError ?? '工作区不存在'
      return
    }
    wsStore.setActive(id.value)
  }
  hydrateResources()
}

const videoResource = computed<WorkspaceResource | undefined>(() => {
  if (!active.value) return undefined
  return active.value.resources.find((r) => r.resourceType === 'video')
})

const audioResource = computed<WorkspaceResource | undefined>(() => {
  if (!active.value) return undefined
  return active.value.resources.find(
    (r) => r.resourceType === 'audio' && r.name !== 'podcast_audio'
  )
})

const podcastAudioResource = computed<WorkspaceResource | undefined>(() => {
  if (!active.value) return undefined
  return active.value.resources.find((r) => r.name === 'podcast_audio')
})

const isReady = computed<boolean>(() => active.value?.status === 'ready')
const isFailed = computed<boolean>(() => active.value?.status === 'failed')

const statusMap: Record<
  WorkspaceStatus,
  { label: string; type: 'default' | 'info' | 'warning' | 'success' | 'error' }
> = {
  pending: { label: '等待处理', type: 'default' },
  downloading: { label: '下载中', type: 'info' },
  transcribing: { label: '转录中', type: 'warning' },
  ready: { label: '就绪', type: 'success' },
  failed: { label: '失败', type: 'error' }
}

const progressPercent = computed<number>(() => {
  const status = active.value?.status
  switch (status) {
    case 'pending':
      return 5
    case 'downloading':
      return 35
    case 'transcribing':
      return 70
    case 'ready':
      return 100
    default:
      return 0
  }
})

function entryFor(type: ContentType): ContentEntry {
  return contentStore.get(id.value, type)
}

async function generate(type: ContentType): Promise<void> {
  if (!active.value) return
  const tab = TABS.find((t) => t.key === type)
  if (tab?.needsTranscript && !findResource(active.value, 'transcript')) {
    message.warning('还没有转录，无法生成')
    return
  }
  if (tab?.needsScript && !findResource(active.value, 'podcast_script')) {
    message.warning('请先生成播客脚本')
    return
  }
  const ok = await contentStore.start(id.value, type)
  if (!ok) {
    message.error(entryFor(type).error ?? '生成失败')
  }
}

async function cancel(type: ContentType): Promise<void> {
  await contentStore.cancel(id.value, type)
  message.info('已取消')
}

function copyText(text: string): void {
  if (!text) return
  navigator.clipboard
    .writeText(text)
    .then(() => message.success('已复制'))
    .catch(() => message.error('复制失败'))
}

function showInFolder(path?: string): void {
  if (!path) {
    message.warning('该资源没有本地路径')
    return
  }
  window.prism.system.showItemInFolder(path).catch(() => {
    message.error('无法在资源管理器中打开')
  })
}

function openWorkspaceFolder(): void {
  const path = videoResource.value?.storageKey ?? audioResource.value?.storageKey
  if (path) {
    showInFolder(path)
  } else {
    message.warning('工作区还没有文件可打开')
  }
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '-'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

function tabHasContent(type: ContentType): boolean {
  if (!active.value) return false
  if (type === 'podcast_audio') {
    return !!podcastAudioResource.value
  }
  const e = entryFor(type)
  if (e.state !== 'idle') return true
  return !!findResource(active.value, type)?.content
}

function tabText(type: ContentType): string {
  if (!active.value) return ''
  const live = entryFor(type).text
  if (live) return live
  return findResource(active.value, type)?.content ?? ''
}

onMounted(() => {
  ensureLoaded()
})

watch(
  () => route.params.id,
  () => {
    ensureLoaded()
  }
)

watch(
  () => active.value?.resources?.length,
  () => {
    hydrateResources()
  }
)

onBeforeUnmount(() => {
  wsStore.setActive(null)
})

function backHome(): void {
  router.push({ name: 'home' })
}
</script>

<template>
  <div class="workspace-root">
    <div v-if="loadError" class="center-block">
      <NResult status="404" title="加载失败" :description="loadError">
        <template #footer>
          <NButton @click="backHome">返回首页</NButton>
        </template>
      </NResult>
    </div>

    <template v-else-if="active">
      <!-- 顶部：标题 / URL / 状态 -->
      <section class="ws-header">
        <NSpace vertical :size="6" style="width: 100%">
          <NSpace align="center" justify="space-between" style="width: 100%">
            <NText strong style="font-size: 18px" :title="active.title || active.url">
              {{ active.title || '（无标题）' }}
            </NText>
            <NTag :type="statusMap[active.status].type" :bordered="false">
              {{ statusMap[active.status].label }}
            </NTag>
          </NSpace>
          <NText depth="3" style="font-size: 12px; word-break: break-all">
            {{ active.url }}
          </NText>
          <NDescriptions
            v-if="active.duration"
            size="small"
            :column="3"
            label-placement="left"
            style="margin-top: 4px"
          >
            <NDescriptionsItem label="时长">
              {{ formatDuration(active.duration) }}
            </NDescriptionsItem>
            <NDescriptionsItem label="创建">
              {{ active.createdAt.slice(0, 16).replace('T', ' ') }}
            </NDescriptionsItem>
            <NDescriptionsItem label="资源"> {{ active.resources.length }} 个 </NDescriptionsItem>
          </NDescriptions>
        </NSpace>
      </section>

      <!-- 进度条 -->
      <section v-if="!isReady && !isFailed" class="ws-progress">
        <NProgress
          type="line"
          :percentage="progressPercent"
          processing
          indicator-placement="inside"
          :height="18"
        />
        <NText depth="3" style="font-size: 12px; margin-top: 6px; display: block">
          {{ active.progress || '准备中...' }}
        </NText>
      </section>

      <section v-if="isFailed" class="ws-error">
        <NAlert type="error" :title="active.progress || '处理失败'">
          {{ active.error ?? '' }}
        </NAlert>
      </section>

      <!-- 本地媒体 -->
      <section v-if="videoResource || audioResource" class="ws-media">
        <NCard size="small" title="本地媒体">
          <NSpace vertical :size="10">
            <NSpace v-if="videoResource" align="center" justify="space-between">
              <NSpace align="center" :size="6">
                <NTag size="small" type="info">视频</NTag>
                <NText>{{ videoResource.name }}</NText>
              </NSpace>
              <NButton size="tiny" @click="showInFolder(videoResource.storageKey)">
                <template #icon>
                  <NIcon><OpenFolderIcon /></NIcon>
                </template>
                打开目录
              </NButton>
            </NSpace>
            <NSpace v-if="audioResource" align="center" justify="space-between">
              <NSpace align="center" :size="6">
                <NTag size="small" type="success">音频</NTag>
                <NText>{{ audioResource.name }}</NText>
              </NSpace>
              <NButton size="tiny" @click="showInFolder(audioResource.storageKey)">
                <template #icon>
                  <NIcon><OpenFolderIcon /></NIcon>
                </template>
                打开目录
              </NButton>
            </NSpace>
          </NSpace>
        </NCard>
      </section>

      <!-- 内容 Tabs -->
      <section class="ws-tabs">
        <NTabs v-model:value="activeTab" type="line" animated size="medium">
          <NTabPane v-for="tab in TABS" :key="tab.key" :name="tab.key" :tab="tab.label">
            <template v-if="!isReady && tab.key !== 'transcript'">
              <NCard size="small">
                <NEmpty description="等视频处理完成后再生成" />
              </NCard>
            </template>

            <template v-else-if="tab.isAudio">
              <NCard size="small">
                <template v-if="podcastAudioResource">
                  <NSpace vertical :size="12" align="center" style="padding: 20px 0">
                    <NText>
                      播客音频已生成：
                      <NText strong>{{ podcastAudioResource.name }}</NText>
                    </NText>
                    <NText depth="3" style="font-size: 12px; word-break: break-all">
                      {{ podcastAudioResource.storageKey }}
                    </NText>
                    <NSpace :size="8">
                      <NButton
                        size="small"
                        type="primary"
                        @click="showInFolder(podcastAudioResource.storageKey)"
                      >
                        在资源管理器中显示
                      </NButton>
                      <NButton
                        size="small"
                        :disabled="entryFor(tab.key).state === 'streaming'"
                        @click="generate(tab.key)"
                      >
                        重新合成
                      </NButton>
                    </NSpace>
                  </NSpace>
                </template>
                <template v-else>
                  <ContentSlotEmpty
                    :entry="entryFor(tab.key)"
                    :label="tab.label"
                    @generate="generate(tab.key)"
                    @cancel="cancel(tab.key)"
                  />
                </template>
              </NCard>
            </template>

            <template v-else>
              <NCard size="small">
                <template v-if="tabHasContent(tab.key)">
                  <NSpace justify="end" style="margin-bottom: 8px">
                    <NButton
                      size="tiny"
                      quaternary
                      :disabled="entryFor(tab.key).state === 'streaming'"
                      @click="generate(tab.key)"
                    >
                      重新生成
                    </NButton>
                    <NButton size="tiny" quaternary @click="copyText(tabText(tab.key))">
                      复制
                    </NButton>
                    <NButton
                      v-if="entryFor(tab.key).state === 'streaming'"
                      size="tiny"
                      quaternary
                      type="warning"
                      @click="cancel(tab.key)"
                    >
                      取消
                    </NButton>
                  </NSpace>

                  <MarkdownContent v-if="tab.key !== 'transcript'" :source="tabText(tab.key)" />
                  <pre v-else class="transcript-block">{{ tabText(tab.key) }}</pre>

                  <NAlert
                    v-if="entryFor(tab.key).state === 'error'"
                    type="error"
                    size="small"
                    style="margin-top: 10px"
                  >
                    {{ entryFor(tab.key).error }}
                  </NAlert>
                </template>
                <template v-else>
                  <ContentSlotEmpty
                    :entry="entryFor(tab.key)"
                    :label="tab.label"
                    :can-generate="tab.key !== 'transcript' || isReady"
                    @generate="generate(tab.key)"
                    @cancel="cancel(tab.key)"
                  />
                </template>
              </NCard>
            </template>
          </NTabPane>
        </NTabs>
      </section>

      <section class="ws-footer">
        <NSpace justify="end" :size="8">
          <NButton size="small" @click="openWorkspaceFolder">
            <template #icon>
              <NIcon><OpenFolderIcon /></NIcon>
            </template>
            打开工作区目录
          </NButton>
        </NSpace>
      </section>
    </template>

    <div v-else class="center-block">
      <NText depth="3">正在加载工作区…</NText>
    </div>
  </div>
</template>

<style scoped>
.workspace-root {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 24px 60px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.center-block {
  padding: 80px 0;
  display: flex;
  justify-content: center;
  align-items: center;
}

.ws-header,
.ws-progress,
.ws-error,
.ws-media,
.ws-tabs,
.ws-footer {
  width: 100%;
}

.transcript-block {
  white-space: pre-wrap;
  word-break: break-word;
  font-family:
    ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 13.5px;
  line-height: 1.7;
  margin: 0;
  padding: 4px 0;
}
</style>
