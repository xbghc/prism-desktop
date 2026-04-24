/**
 * 任务栏进度条同步：
 *
 * Windows 任务栏图标可以显示一个 0-100% 的进度条（Electron `setProgressBar`）。
 * 我们把所有在途工作区（downloading / transcribing）的百分比取平均值实时显示。
 *
 * 注：理想实现是让 pipeline.ts 直接广播事件给 platform 层，但架构师把 pipeline.ts 和
 * events.ts 划给 contract，Platform worker 不能改。因此这里用轮询 workspace-store 的
 * 务实方案。PR 里应当建议架构师后续补一条 platform event bus（例如 EventEmitter），
 * 把 pipeline 的阶段变化 push 给 platform 层，就能把 polling 换成事件驱动。
 */
import { BrowserWindow } from 'electron'
import { listWorkspaces } from '../workspace-store'
import type { Workspace } from '../../shared/types'
import { createLogger } from '../logger'

const log = createLogger('platform/progress-bar')

const POLL_INTERVAL_MS = 500
const ACTIVE_STATUSES: ReadonlySet<Workspace['status']> = new Set(['downloading', 'transcribing'])

/**
 * 从 pipeline 写进 workspace.progress 的文本里抠出百分比。
 *
 * 已知格式（见 src/main/pipeline.ts）：
 *   - "下载中 67%"
 *   - "下载中"（未知百分比，不返回）
 *   - "转录中 42%"
 *   - "下载完成: xxx"（此时 status 应该已经推进到下一阶段了，我们忽略）
 */
function parsePercent(progress: string): number | null {
  const m = progress.match(/(\d{1,3})\s*%/)
  if (!m) return null
  const pct = Number(m[1])
  if (!Number.isFinite(pct)) return null
  return Math.max(0, Math.min(100, pct))
}

/**
 * 计算当前全局进度：所有 active 工作区百分比的平均值。
 *
 * - 没有 active 工作区时返回 null（调用方清除进度条）
 * - active 工作区但全部没有百分比信息时，按阶段给一个粗略默认（downloading=10%,
 *   transcribing=60%）防止进度条长期停在 0 让用户误以为卡住
 */
function computeOverallFraction(workspaces: Workspace[]): number | null {
  const active = workspaces.filter((w) => ACTIVE_STATUSES.has(w.status))
  if (active.length === 0) return null

  let sum = 0
  let count = 0
  for (const w of active) {
    const parsed = parsePercent(w.progress)
    if (parsed !== null) {
      sum += parsed
      count += 1
    } else {
      // 没抠到百分比：按阶段给近似值
      sum += w.status === 'downloading' ? 10 : 60
      count += 1
    }
  }
  if (count === 0) return null
  return sum / count / 100
}

export interface ProgressBarController {
  stop: () => void
}

export function startProgressBarSync(mainWindow: BrowserWindow): ProgressBarController {
  let lastFraction: number | null = null
  let lastMode: 'normal' | 'cleared' | null = null

  const tick = (): void => {
    if (mainWindow.isDestroyed()) return
    const fraction = computeOverallFraction(listWorkspaces())

    if (fraction === null) {
      if (lastMode !== 'cleared') {
        mainWindow.setProgressBar(-1)
        lastMode = 'cleared'
        lastFraction = null
      }
      return
    }

    // 小幅变化（< 0.5%）不推送，减少无意义的 IPC/调用
    if (
      lastMode === 'normal' &&
      lastFraction !== null &&
      Math.abs(fraction - lastFraction) < 0.005
    ) {
      return
    }
    mainWindow.setProgressBar(fraction)
    lastFraction = fraction
    lastMode = 'normal'
  }

  const timer = setInterval(tick, POLL_INTERVAL_MS)
  // 立刻跑一次，避免刚启动就有在途任务时的延迟
  tick()
  log.info('任务栏进度条同步已启动', { pollMs: POLL_INTERVAL_MS })

  const stop = (): void => {
    clearInterval(timer)
    if (!mainWindow.isDestroyed()) {
      mainWindow.setProgressBar(-1)
    }
  }

  mainWindow.on('closed', stop)

  return { stop }
}
