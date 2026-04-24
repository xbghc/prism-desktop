<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import {
  NButton,
  NCard,
  NEmpty,
  NInput,
  NInputGroup,
  NList,
  NListItem,
  NPopconfirm,
  NSpace,
  NSpin,
  NTag,
  NText,
  useMessage
} from 'naive-ui'
import { useWorkspaceStore } from '../stores/workspace'
import type { WorkspaceStatus } from '../../../shared/types'

const router = useRouter()
const store = useWorkspaceStore()
const message = useMessage()

const { recent, loading } = storeToRefs(store)
const url = ref('')
const submitting = ref(false)

onMounted(() => {
  store.fetchList()
})

const canSubmit = computed(() => url.value.trim().length > 0 && !submitting.value)

async function handleSubmit(): Promise<void> {
  const value = url.value.trim()
  if (!value) {
    message.warning('请先粘贴视频链接')
    return
  }
  submitting.value = true
  try {
    const ws = await store.create(value)
    if (!ws) {
      message.error(store.lastError ?? '创建工作区失败')
      return
    }
    url.value = ''
    router.push({ name: 'workspace', params: { id: ws.workspaceId } })
  } finally {
    submitting.value = false
  }
}

function gotoWorkspace(id: string): void {
  router.push({ name: 'workspace', params: { id } })
}

async function handleDelete(id: string): Promise<void> {
  const ok = await store.remove(id)
  if (ok) {
    message.success('已删除')
  } else {
    message.error(store.lastError ?? '删除失败')
  }
}

const STATUS_TAG: Record<
  WorkspaceStatus,
  { type: 'default' | 'info' | 'warning' | 'success' | 'error'; label: string }
> = {
  pending: { type: 'default', label: '等待处理' },
  downloading: { type: 'info', label: '下载中' },
  transcribing: { type: 'warning', label: '转录中' },
  ready: { type: 'success', label: '就绪' },
  failed: { type: 'error', label: '失败' }
}

function statusTag(status: WorkspaceStatus): (typeof STATUS_TAG)[WorkspaceStatus] {
  return STATUS_TAG[status]
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    const pad = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return iso
  }
}
</script>

<template>
  <div class="home-root">
    <section class="hero">
      <div class="hero-title">
        <h1>一键把视频折射成文字、大纲、文章、播客</h1>
        <p>粘贴 YouTube / B站 / 抖音 / 小红书 等视频链接，本机下载与处理，结果留在你电脑里。</p>
      </div>
      <NInputGroup size="large" class="hero-input">
        <NInput
          v-model:value="url"
          placeholder="https://www.youtube.com/watch?v=... 或 https://www.bilibili.com/video/..."
          clearable
          :disabled="submitting"
          @keydown.enter="handleSubmit"
        />
        <NButton
          type="primary"
          size="large"
          :loading="submitting"
          :disabled="!canSubmit"
          @click="handleSubmit"
        >
          开始转化
        </NButton>
      </NInputGroup>
      <NText depth="3" class="hero-tip">
        支持：YouTube · Bilibili · 抖音 · 小红书 · X · 推特 · Vimeo 等
      </NText>
    </section>

    <section class="recent">
      <NSpace justify="space-between" align="center" style="margin-bottom: 12px">
        <NText strong style="font-size: 16px">最近工作区</NText>
        <NButton size="small" quaternary :loading="loading" @click="store.fetchList()"
          >刷新</NButton
        >
      </NSpace>

      <NSpin :show="loading && recent.length === 0">
        <NCard v-if="recent.length === 0" size="small">
          <NEmpty description="暂无历史工作区，从上方输入框开始一个吧" />
        </NCard>
        <NList v-else hoverable clickable bordered>
          <NListItem
            v-for="ws in recent"
            :key="ws.workspaceId"
            @click="gotoWorkspace(ws.workspaceId)"
          >
            <template #default>
              <NSpace vertical :size="4" style="width: 100%">
                <NSpace align="center" justify="space-between" style="width: 100%">
                  <NText strong style="max-width: 70%" :title="ws.title || ws.url">
                    {{ ws.title || ws.url }}
                  </NText>
                  <NTag size="small" :type="statusTag(ws.status).type">
                    {{ statusTag(ws.status).label }}
                  </NTag>
                </NSpace>
                <NSpace align="center" justify="space-between" style="width: 100%">
                  <NText depth="3" style="font-size: 12px; word-break: break-all">
                    {{ ws.url }}
                  </NText>
                  <NText depth="3" style="font-size: 12px">
                    {{ formatTime(ws.updatedAt) }}
                  </NText>
                </NSpace>
                <NSpace v-if="ws.progress" align="center" :size="4">
                  <NText depth="3" style="font-size: 12px">{{ ws.progress }}</NText>
                </NSpace>
              </NSpace>
            </template>
            <template #suffix>
              <NPopconfirm @positive-click.stop="handleDelete(ws.workspaceId)">
                <template #trigger>
                  <NButton size="tiny" quaternary type="error" @click.stop>删除</NButton>
                </template>
                确认删除此工作区？本地资源会一起清理。
              </NPopconfirm>
            </template>
          </NListItem>
        </NList>
      </NSpin>
    </section>
  </div>
</template>

<style scoped>
.home-root {
  max-width: 880px;
  margin: 0 auto;
  padding: 40px 24px 60px;
  display: flex;
  flex-direction: column;
  gap: 40px;
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  padding: 28px 0 8px;
  text-align: center;
}

.hero-title h1 {
  font-size: 30px;
  line-height: 1.25;
  margin: 0 0 10px;
  letter-spacing: -0.02em;
}

.hero-title p {
  margin: 0;
  font-size: 14px;
  color: rgba(125, 125, 125, 0.95);
}

.hero-input {
  width: 100%;
  max-width: 680px;
}

.hero-tip {
  font-size: 12px;
}

.recent {
  display: flex;
  flex-direction: column;
}
</style>
