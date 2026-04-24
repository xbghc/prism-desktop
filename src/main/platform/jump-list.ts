/**
 * 任务栏 Jump List（跳转列表）：
 *
 * 右键点击任务栏上的 Prism 图标会弹出跳转列表。我们放两类入口：
 *
 * 1. Tasks 分类（固定在底部）：
 *    - 「新建工作区」→ `prism://new`
 *
 * 2. Custom 分类 "最近工作区"（最多 5 条）：
 *    - 每条对应一个既有工作区 → `prism://open?id=<workspaceId>`
 *
 * 每 30 秒轮询一次 workspace-store 更新列表。
 *
 * 注：`app.setJumpList` 仅 Windows 有效，其他平台是 no-op。
 */
import { app } from 'electron'
import type { JumpListCategory, JumpListItem } from 'electron'
import { listWorkspaces } from '../workspace-store'
import { createLogger } from '../logger'

const log = createLogger('platform/jump-list')

const POLL_INTERVAL_MS = 30_000
const MAX_RECENT = 5

/**
 * 构造一条调用自身的 task item。
 *
 * `program` 必须是当前 exe 的绝对路径；`args` 在 Windows 启动时会被拼到命令行里。
 * 因为我们注册了 `prism://` 协议，所以 args 里直接写 `prism://...` URL，Windows
 * 会把 URL 作为 argv 传给第二个实例，single-instance 事件里我们已经做了深链分发。
 */
function taskItem(title: string, description: string, url: string): JumpListItem {
  return {
    type: 'task',
    title,
    description,
    program: process.execPath,
    args: url,
    iconPath: process.execPath,
    iconIndex: 0
  }
}

function buildCategories(): JumpListCategory[] {
  const recent = listWorkspaces().slice(0, MAX_RECENT)
  const categories: JumpListCategory[] = []

  if (recent.length > 0) {
    const recentItems = recent.map((w) => {
      const title = (w.title || w.url || w.workspaceId).slice(0, 64) || w.workspaceId
      return taskItem(
        title,
        `打开工作区 ${w.workspaceId}`,
        `prism://open?id=${encodeURIComponent(w.workspaceId)}`
      )
    })
    categories.push({
      type: 'custom',
      name: '最近工作区',
      items: recentItems
    })
  }

  categories.push({
    type: 'tasks',
    items: [taskItem('新建工作区', '从剪贴板或手动输入视频链接新建', 'prism://new')]
  })

  return categories
}

export function updateJumpList(): void {
  if (process.platform !== 'win32') return
  try {
    const categories = buildCategories()
    const result = app.setJumpList(categories)
    if (result !== 'ok') {
      log.warn('设置 Jump List 返回非 ok', { result })
    }
  } catch (err) {
    log.warn('设置 Jump List 抛错', { err: String(err) })
  }
}

export interface JumpListController {
  stop: () => void
}

export function startJumpListSync(): JumpListController {
  updateJumpList()
  const timer = setInterval(updateJumpList, POLL_INTERVAL_MS)
  log.info('Jump List 同步已启动', { pollMs: POLL_INTERVAL_MS })

  return {
    stop: () => clearInterval(timer)
  }
}
