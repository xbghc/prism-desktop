import { defineStore } from 'pinia'
import { reactive } from 'vue'
import type { ContentStreamEvent, ContentType } from '../../../shared/types'

/**
 * 单条（workspaceId, contentType）生成任务状态。
 *
 * - idle: 没开始
 * - streaming: 收到 IPC invoke ack 后，开始追加 delta
 * - done: done=true 到达
 * - error: error 字段非空
 */
export type ContentState = 'idle' | 'streaming' | 'done' | 'error'

export interface ContentEntry {
  state: ContentState
  text: string
  error: string | null
}

function key(workspaceId: string, contentType: ContentType): string {
  return `${workspaceId}::${contentType}`
}

export const useContentStore = defineStore('content', () => {
  // 用普通对象而不是 Map，Pinia / Vue 的响应性对 Map 支持没那么顺
  const entries = reactive<Record<string, ContentEntry>>({})

  let subscribed = false
  let unsubscribe: (() => void) | null = null

  function ensure(workspaceId: string, contentType: ContentType): ContentEntry {
    const k = key(workspaceId, contentType)
    if (!entries[k]) {
      entries[k] = { state: 'idle', text: '', error: null }
    }
    return entries[k]
  }

  function get(workspaceId: string, contentType: ContentType): ContentEntry {
    return ensure(workspaceId, contentType)
  }

  function reset(workspaceId: string, contentType: ContentType): void {
    entries[key(workspaceId, contentType)] = { state: 'idle', text: '', error: null }
  }

  function hydrate(workspaceId: string, contentType: ContentType, text: string): void {
    const e = ensure(workspaceId, contentType)
    // 资源里已经有成品：当作 done
    e.state = 'done'
    e.text = text
    e.error = null
  }

  function ensureSubscribed(): void {
    if (subscribed) return
    subscribed = true
    unsubscribe = window.prism.content.onStream((evt: ContentStreamEvent) => {
      const e = ensure(evt.workspaceId, evt.contentType)
      if (evt.error) {
        e.state = 'error'
        e.error = evt.error
        return
      }
      if (evt.delta) {
        if (e.state !== 'streaming') {
          // 第一个 delta 到达
          e.state = 'streaming'
          e.text = ''
          e.error = null
        }
        e.text += evt.delta
      }
      if (evt.done) {
        e.state = 'done'
      }
    })
  }

  async function start(workspaceId: string, contentType: ContentType): Promise<boolean> {
    ensureSubscribed()
    const e = ensure(workspaceId, contentType)
    e.state = 'streaming'
    e.text = ''
    e.error = null
    try {
      await window.prism.content.generate(workspaceId, contentType)
      return true
    } catch (err) {
      e.state = 'error'
      e.error = err instanceof Error ? err.message : String(err)
      return false
    }
  }

  async function cancel(workspaceId: string, contentType: ContentType): Promise<void> {
    try {
      await window.prism.content.cancel(workspaceId, contentType)
    } catch {
      // 取消失败不阻断 UI
    }
    const e = ensure(workspaceId, contentType)
    if (e.state === 'streaming') {
      e.state = 'idle'
    }
  }

  function dispose(): void {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
    subscribed = false
  }

  return {
    entries,
    get,
    reset,
    hydrate,
    start,
    cancel,
    ensureSubscribed,
    dispose
  }
})
