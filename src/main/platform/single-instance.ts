/**
 * 单实例锁：
 *
 * Prism 是 Windows 面向用户的桌面应用，多开窗口只会让下载/状态各自跑一份、互相写坏
 * workspaces.json。我们用 Electron 的 `requestSingleInstanceLock` 强制只跑一份进程，
 * 第二次启动时把 argv 转发给第一次拿到锁的进程，主窗口弹出并处理里面的 `prism://` 深链。
 */
import { app, BrowserWindow } from 'electron'
import { createLogger } from '../logger'

const log = createLogger('platform/single-instance')

export type SecondInstanceHandler = (argv: string[], workingDirectory: string) => void

/**
 * 尝试获取单实例锁。
 *
 * @returns 拿到锁返回 true，未拿到锁返回 false（调用者应立刻让 app 退出）。
 */
export function setupSingleInstance(onSecondInstance?: SecondInstanceHandler): boolean {
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    log.info('未获得单实例锁，已有实例在运行，退出当前进程')
    app.quit()
    return false
  }

  app.on('second-instance', (_event, argv, workingDirectory) => {
    log.info('检测到第二实例启动', { argv, workingDirectory })
    focusPrimaryWindow()
    if (onSecondInstance) {
      try {
        onSecondInstance(argv, workingDirectory)
      } catch (err) {
        log.warn('处理 second-instance 回调失败', { err: String(err) })
      }
    }
  })

  return true
}

/**
 * 把已有的主窗口还原并聚焦，让用户能立刻看到。
 */
export function focusPrimaryWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows()
  if (windows.length === 0) return null
  const win = windows[0]
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
  return win
}
