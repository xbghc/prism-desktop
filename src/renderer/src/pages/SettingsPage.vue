<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import {
  NAlert,
  NButton,
  NCard,
  NForm,
  NFormItem,
  NGrid,
  NGridItem,
  NInput,
  NInputNumber,
  NSpace,
  NText,
  useMessage
} from 'naive-ui'
import { useSettingsStore } from '../stores/settings'
import type { Settings } from '../../../shared/types'

const store = useSettingsStore()
const message = useMessage()

const { settings, loaded, saving, lastError } = storeToRefs(store)

// 本地编辑副本
const draft = reactive<Settings>({ ...settings.value })
const pristine = ref<Settings>({ ...settings.value })

function syncFromStore(): void {
  Object.assign(draft, settings.value)
  pristine.value = { ...settings.value }
}

const dirty = computed<boolean>(() => {
  return (Object.keys(draft) as (keyof Settings)[]).some((k) => draft[k] !== pristine.value[k])
})

async function load(): Promise<void> {
  await store.load()
  syncFromStore()
}

async function save(): Promise<void> {
  // 只把变更字段 patch 上去
  const patch: Partial<Settings> = {}
  for (const k of Object.keys(draft) as (keyof Settings)[]) {
    if (draft[k] !== pristine.value[k]) {
      // 保持类型，这里忽略具体字段类型（Settings 已经是 Partial 约束）
      ;(patch as Record<string, unknown>)[k] = draft[k]
    }
  }
  const next = await store.update(patch)
  if (next) {
    message.success('已保存')
    syncFromStore()
  } else {
    message.error(lastError.value ?? '保存失败')
  }
}

function reset(): void {
  syncFromStore()
  message.info('已还原')
}

onMounted(() => {
  load()
})

watch(settings, () => {
  // 被其他窗口或初次加载填充时，若没有脏改动，就同步过来
  if (!dirty.value) {
    syncFromStore()
  }
})
</script>

<template>
  <div class="settings-root">
    <NSpace justify="space-between" align="center" style="margin-bottom: 16px">
      <NText strong style="font-size: 20px">设置</NText>
      <NSpace :size="8">
        <NButton size="small" :disabled="!dirty || saving" @click="reset">还原</NButton>
        <NButton size="small" type="primary" :disabled="!dirty" :loading="saving" @click="save">
          保存
        </NButton>
      </NSpace>
    </NSpace>

    <NAlert v-if="lastError" type="error" style="margin-bottom: 16px">
      {{ lastError }}
    </NAlert>

    <NAlert v-if="!loaded" type="info" style="margin-bottom: 16px"> 正在加载配置… </NAlert>

    <!-- Anthropic -->
    <NCard title="Anthropic（LLM）" size="small" class="group-card">
      <NForm label-placement="left" label-width="140" size="small">
        <NGrid :cols="2" :x-gap="16">
          <NGridItem>
            <NFormItem label="API Key">
              <NInput
                v-model:value="draft.anthropicApiKey"
                type="password"
                show-password-on="click"
                placeholder="sk-ant-..."
              />
            </NFormItem>
          </NGridItem>
          <NGridItem>
            <NFormItem label="Base URL">
              <NInput
                v-model:value="draft.anthropicBaseUrl"
                placeholder="留空走官方端点，或填兼容端点 URL"
              />
            </NFormItem>
          </NGridItem>
          <NGridItem :span="2">
            <NFormItem label="模型">
              <NInput v-model:value="draft.anthropicModel" placeholder="claude-sonnet-4-6" />
            </NFormItem>
          </NGridItem>
        </NGrid>
      </NForm>
    </NCard>

    <!-- Whisper -->
    <NCard title="Whisper（转录）" size="small" class="group-card">
      <NForm label-placement="left" label-width="140" size="small">
        <NGrid :cols="2" :x-gap="16">
          <NGridItem>
            <NFormItem label="API Key">
              <NInput
                v-model:value="draft.whisperApiKey"
                type="password"
                show-password-on="click"
              />
            </NFormItem>
          </NGridItem>
          <NGridItem>
            <NFormItem label="Base URL">
              <NInput
                v-model:value="draft.whisperBaseUrl"
                placeholder="https://api.example.com/v1"
              />
            </NFormItem>
          </NGridItem>
          <NGridItem :span="2">
            <NFormItem label="模型">
              <NInput v-model:value="draft.whisperModel" placeholder="whisper-1" />
            </NFormItem>
          </NGridItem>
        </NGrid>
      </NForm>
    </NCard>

    <!-- DashScope -->
    <NCard title="DashScope（阿里云百炼 TTS / STT）" size="small" class="group-card">
      <NForm label-placement="left" label-width="140" size="small">
        <NGrid :cols="2" :x-gap="16">
          <NGridItem>
            <NFormItem label="API Key">
              <NInput
                v-model:value="draft.dashscopeApiKey"
                type="password"
                show-password-on="click"
                placeholder="sk-..."
              />
            </NFormItem>
          </NGridItem>
          <NGridItem>
            <NFormItem label="STT 模型">
              <NInput
                v-model:value="draft.dashscopeSttModel"
                placeholder="paraformer-realtime-v2"
              />
            </NFormItem>
          </NGridItem>
        </NGrid>
      </NForm>
    </NCard>

    <!-- 视频解析 -->
    <NCard title="视频解析（Xiazaitool）" size="small" class="group-card">
      <NForm label-placement="left" label-width="140" size="small">
        <NGrid :cols="2" :x-gap="16">
          <NGridItem>
            <NFormItem label="Token">
              <NInput
                v-model:value="draft.xiazaitoolToken"
                type="password"
                show-password-on="click"
              />
            </NFormItem>
          </NGridItem>
          <NGridItem>
            <NFormItem label="API URL">
              <NInput v-model:value="draft.xiazaitoolApiUrl" />
            </NFormItem>
          </NGridItem>
        </NGrid>
      </NForm>
    </NCard>

    <!-- 网络 -->
    <NCard title="网络" size="small" class="group-card">
      <NForm label-placement="left" label-width="140" size="small">
        <NFormItem label="代理地址">
          <NInput
            v-model:value="draft.proxyUrl"
            placeholder="http://127.0.0.1:7890，留空则读取环境变量 HTTPS_PROXY / HTTP_PROXY"
          />
        </NFormItem>
      </NForm>
    </NCard>

    <!-- 限制 -->
    <NCard title="限制与路径" size="small" class="group-card">
      <NForm label-placement="left" label-width="140" size="small">
        <NFormItem label="视频最大时长（秒）">
          <NInputNumber
            v-model:value="draft.maxVideoDuration"
            :min="60"
            :max="36000"
            :step="60"
            style="width: 220px"
          />
          <NText depth="3" style="margin-left: 12px; font-size: 12px">
            超过该时长的视频下载后会被拒绝，避免意外消耗额度
          </NText>
        </NFormItem>
        <NFormItem label="数据目录">
          <NInput v-model:value="draft.dataDir" placeholder="留空使用默认 userData/v2t-data" />
        </NFormItem>
        <NFormItem label="临时目录">
          <NInput v-model:value="draft.tempDir" placeholder="留空使用默认 userData/v2t-tmp" />
        </NFormItem>
      </NForm>
    </NCard>

    <div class="bottom-bar">
      <NSpace justify="end" :size="8">
        <NButton :disabled="!dirty || saving" @click="reset">还原</NButton>
        <NButton type="primary" :disabled="!dirty" :loading="saving" @click="save"> 保存 </NButton>
      </NSpace>
    </div>
  </div>
</template>

<style scoped>
.settings-root {
  max-width: 880px;
  margin: 0 auto;
  padding: 28px 24px 80px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.group-card {
  margin-bottom: 6px;
}

.bottom-bar {
  margin-top: 12px;
}
</style>
