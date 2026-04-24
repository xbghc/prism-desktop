<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  NConfigProvider,
  NMessageProvider,
  NDialogProvider,
  NNotificationProvider,
  NLayout,
  NLayoutHeader,
  NLayoutContent,
  NButton,
  NIcon,
  NSpace,
  darkTheme,
  useOsTheme,
  zhCN,
  dateZhCN
} from 'naive-ui'
import AppHeader from './components/AppHeader.vue'

const osTheme = useOsTheme()
const theme = computed(() => (osTheme.value === 'dark' ? darkTheme : null))

const router = useRouter()
const route = useRoute()

const goHome = (): void => {
  router.push({ name: 'home' })
}

const goSettings = (): void => {
  router.push({ name: 'settings' })
}

const isHome = computed(() => route.name === 'home')
</script>

<template>
  <NConfigProvider :theme="theme" :locale="zhCN" :date-locale="dateZhCN" class="app-root">
    <NMessageProvider>
      <NDialogProvider>
        <NNotificationProvider>
          <NLayout class="app-layout" :native-scrollbar="false">
            <NLayoutHeader bordered class="app-header">
              <AppHeader
                :show-back="!isHome"
                @back="goHome"
                @settings="goSettings"
                @home="goHome"
              />
            </NLayoutHeader>
            <NLayoutContent class="app-content" :native-scrollbar="false">
              <router-view v-slot="{ Component }">
                <component :is="Component" />
              </router-view>
            </NLayoutContent>
          </NLayout>
          <!-- 占位：避免 naive-ui 报 provider 没用到的 warning -->
          <NSpace v-if="false">
            <NButton />
            <NIcon />
          </NSpace>
        </NNotificationProvider>
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>

<style scoped>
.app-root {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-layout {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 20px;
  flex-shrink: 0;
}

.app-content {
  flex: 1;
  min-height: 0;
}
</style>
