import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Workspace, WorkspaceProgressEvent, WorkspaceResource } from '../../../shared/types'

/**
 * 工作区仓库
 *
 * - 维护最近工作区列表
 * - 维护当前活跃工作区
 * - 订阅主进程的 progress 广播，收到事件时把对应工作区的字段 patch 进来
 *
 * onProgress 订阅只在 store 第一次被使用时建立，App 生命周期内不再解绑
 * （渲染进程整个关掉时所有 IPC 监听一起被回收）。
 */
export const useWorkspaceStore = defineStore('workspace', () => {
  const list = ref<Workspace[]>([])
  const activeId = ref<string | null>(null)
  const loading = ref(false)
  const lastError = ref<string | null>(null)

  // 已订阅 onProgress
  let subscribed = false
  let unsubscribe: (() => void) | null = null

  const active = computed<Workspace | null>(() => {
    if (!activeId.value) return null
    return list.value.find((w) => w.workspaceId === activeId.value) ?? null
  })

  const recent = computed<Workspace[]>(() => {
    return [...list.value].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  })

  function upsert(ws: Workspace): void {
    const idx = list.value.findIndex((w) => w.workspaceId === ws.workspaceId)
    if (idx >= 0) {
      list.value[idx] = ws
    } else {
      list.value.push(ws)
    }
  }

  function applyProgress(evt: WorkspaceProgressEvent): void {
    const idx = list.value.findIndex((w) => w.workspaceId === evt.workspaceId)
    if (idx < 0) {
      // 不在列表里的事件（理论上不该出现），忽略
      return
    }
    const prev = list.value[idx]
    const nextResources: WorkspaceResource[] =
      evt.resources !== undefined ? evt.resources : prev.resources
    const merged: Workspace = {
      ...prev,
      status: evt.status,
      progress: evt.progress,
      error: evt.error,
      resources: nextResources,
      title: evt.title ?? prev.title,
      duration: evt.duration ?? prev.duration,
      updatedAt: new Date().toISOString()
    }
    list.value[idx] = merged
  }

  function ensureSubscribed(): void {
    if (subscribed) return
    subscribed = true
    unsubscribe = window.prism.workspace.onProgress((evt) => {
      applyProgress(evt)
    })
  }

  async function fetchList(): Promise<void> {
    loading.value = true
    lastError.value = null
    try {
      list.value = await window.prism.workspace.list()
      ensureSubscribed()
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err)
    } finally {
      loading.value = false
    }
  }

  async function loadOne(id: string): Promise<Workspace | null> {
    try {
      const ws = await window.prism.workspace.get(id)
      if (ws) {
        upsert(ws)
        ensureSubscribed()
      }
      return ws
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err)
      return null
    }
  }

  async function create(url: string): Promise<Workspace | null> {
    lastError.value = null
    try {
      const ws = await window.prism.workspace.create(url)
      upsert(ws)
      activeId.value = ws.workspaceId
      ensureSubscribed()
      return ws
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err)
      return null
    }
  }

  async function remove(id: string): Promise<boolean> {
    try {
      await window.prism.workspace.delete(id)
      list.value = list.value.filter((w) => w.workspaceId !== id)
      if (activeId.value === id) activeId.value = null
      return true
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err)
      return false
    }
  }

  function setActive(id: string | null): void {
    activeId.value = id
  }

  function dispose(): void {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
    subscribed = false
  }

  return {
    // state
    list,
    activeId,
    loading,
    lastError,
    // getters
    active,
    recent,
    // actions
    fetchList,
    loadOne,
    create,
    remove,
    setActive,
    applyProgress,
    ensureSubscribed,
    dispose
  }
})
