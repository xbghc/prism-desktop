/**
 * Windows 平台集成总入口。
 *
 * 职责：
 * - `setupSingleInstance` 已经在 `src/main/index.ts` 的 `whenReady` 之前调用过了，
 *   这里不重复做；但我们要把 `second-instance` 事件里拿到的 argv 里的深链转发到回调。
 *   因为 `setupSingleInstance` 的回调只接 argv，这里我们用 `dispatchFromArgv` 做一次
 *   分发。
 * - 其余模块（托盘、进度条、通知、跳转列表、热键）一次性装上。
 *
 * 调用顺序推荐：createWindow() 之后立刻 installWindowsPlatform(mainWindow, opts)
 */
import { app, BrowserWindow } from 'electron'
import { setupProtocolHandler, dispatchFromArgv, type DeepLinkHandler } from './protocol'
import { createTray } from './tray'
import { startProgressBarSync } from './progress-bar'
import { startWorkspaceNotifier } from './notifications'
import { startJumpListSync } from './jump-list'
import { registerGlobalShortcuts } from './shortcuts'
import { createLogger } from '../logger'

export { setupSingleInstance, focusPrimaryWindow } from './single-instance'
export { setupProtocolHandler, dispatchFromArgv, PROTOCOL_SCHEME } from './protocol'
export { createTray } from './tray'
export { startProgressBarSync } from './progress-bar'
export { notify, startWorkspaceNotifier } from './notifications'
export { updateJumpList, startJumpListSync } from './jump-list'
export { registerGlobalShortcuts, extractVideoUrl, PASTE_ACCELERATOR } from './shortcuts'

const log = createLogger('platform')

export interface InstallOptions {
  onDeepLink: DeepLinkHandler
  onPasteUrl: (url: string) => void
}

/**
 * 一次性装上 Windows 平台的所有原生集成。
 *
 * 前提：调用方已经执行过 `setupSingleInstance()` 并拿到了锁。
 */
export function installWindowsPlatform(mainWindow: BrowserWindow, opts: InstallOptions): void {
  // 1. 协议：在 single-instance 的 second-instance 事件里把 argv 转发到深链回调
  setupProtocolHandler(opts.onDeepLink)
  app.on('second-instance', (_event, argv) => {
    dispatchFromArgv(argv, opts.onDeepLink)
  })

  // 2. 托盘
  createTray(mainWindow)

  // 3. 任务栏进度条
  startProgressBarSync(mainWindow)

  // 4. 工作区通知
  startWorkspaceNotifier(mainWindow)

  // 5. Jump List
  startJumpListSync()

  // 6. 全局热键
  const shortcuts = registerGlobalShortcuts({ onPasteUrl: opts.onPasteUrl })

  // 退出前清理：globalShortcut 必须显式注销，否则系统级 hook 不会自动释放
  app.on('will-quit', () => {
    shortcuts.stop()
  })

  log.info('Windows 平台集成已全部装载')
}
