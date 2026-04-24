/**
 * Toast 通知：
 *
 * Windows 10/11 的 Action Center 通知。两种用法：
 * 1. `notify(title, body, onClick?)` — 主动发一条
 * 2. `startWorkspaceNotifier(mainWindow)` — 轮询工作区，当状态跳到 ready 或 failed
 *    时自动发 toast
 *
 * 注：和 progress-bar 一样，因为不能改 pipeline/events，用 polling 记录状态跳变。
 */
import { BrowserWindow, Notification } from 'electron'
import { listWorkspaces } from '../workspace-store'
import type { Workspace, WorkspaceStatus } from '../../shared/types'
import { createLogger } from '../logger'

const log = createLogger('platform/notifications')

const POLL_INTERVAL_MS = 1000

export function notify(title: string, body: string, onClick?: () => void): Notification | null {
  if (!Notification.isSupported()) {
    log.warn('系统不支持 Toast 通知，跳过', { title })
    return null
  }
  const n = new Notification({ title, body, silent: false })
  if (onClick) {
    n.on('click', () => {
      try {
        onClick()
      } catch (err) {
        log.warn('通知点击回调抛错', { err: String(err) })
      }
    })
  }
  n.show()
  return n
}

export interface WorkspaceNotifierController {
  stop: () => void
}

/**
 * 轮询工作区列表，记录每个 ID 的上一次状态；发现由非终态 → `ready` 或 `failed` 时发
 * toast。启动时先记录一次当前快照，避免应用首次启动就把历史已完成的工作区全部刷出来。
 */
export function startWorkspaceNotifier(mainWindow: BrowserWindow): WorkspaceNotifierController {
  const lastStatus = new Map<string, WorkspaceStatus>()

  // 初始化：记录当前所有工作区的状态，不发通知
  for (const w of listWorkspaces()) {
    lastStatus.set(w.workspaceId, w.status)
  }

  const focusWindow = (): void => {
    if (mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }

  const tick = (): void => {
    if (mainWindow.isDestroyed()) return
    const workspaces = listWorkspaces()
    const seen = new Set<string>()

    for (const w of workspaces) {
      seen.add(w.workspaceId)
      const prev = lastStatus.get(w.workspaceId)
      if (prev !== w.status) {
        handleTransition(w, prev, focusWindow)
        lastStatus.set(w.workspaceId, w.status)
      }
    }

    // 工作区被删除就清掉记录
    for (const id of lastStatus.keys()) {
      if (!seen.has(id)) lastStatus.delete(id)
    }
  }

  const timer = setInterval(tick, POLL_INTERVAL_MS)
  log.info('工作区通知已启动', { pollMs: POLL_INTERVAL_MS, tracked: lastStatus.size })

  const stop = (): void => {
    clearInterval(timer)
  }

  mainWindow.on('closed', stop)

  return { stop }
}

function handleTransition(
  workspace: Workspace,
  previous: WorkspaceStatus | undefined,
  onClick: () => void
): void {
  // 启动首刷我们已经把 lastStatus 填充好了，previous 只有在 undefined（新建）或
  // 不同状态时才会走到这里。为了避免把新建时的 pending 误当跳变，这里只对 ready /
  // failed 发 toast。
  if (workspace.status === 'ready') {
    const title = workspace.title || workspace.url
    notify('Prism · 转录完成', title, onClick)
  } else if (workspace.status === 'failed') {
    const title = workspace.title || workspace.url
    const err = workspace.error || '处理失败'
    notify('Prism · 处理失败', `${title}\n${err}`, onClick)
  } else {
    // 其他状态跳变（pending→downloading→transcribing）静默
    log.debug('工作区状态跳变', {
      workspaceId: workspace.workspaceId,
      from: previous,
      to: workspace.status
    })
  }
}
