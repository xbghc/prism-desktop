/**
 * `prism://` 深链协议处理：
 *
 * Windows 下 `setAsDefaultProtocolClient('prism')` 会写一条注册表项，让资源管理器
 * 遇到 `prism://` 时启动本应用，并把完整 URL 作为 argv 尾参数传进来。因为我们已经启用
 * 了单实例锁，首次启动之外的调用都走 `second-instance` 事件，所以协议解析也在 argv
 * 里做。
 *
 * 目前支持的格式由 onDeepLink 回调自行决定，常见约定：
 *   - `prism://create?url=<encoded>` 新建工作区
 *   - `prism://open?id=<workspaceId>` 打开既有工作区
 */
import { app } from 'electron'
import { createLogger } from '../logger'

const log = createLogger('platform/protocol')

export const PROTOCOL_SCHEME = 'prism'

export type DeepLinkHandler = (url: URL) => void

/**
 * 注册 `prism://` 协议并接管 argv 里的深链。
 *
 * Electron API 返回 boolean，但失败情况下（非 Windows、注册表权限不足等）只记录日志，
 * 不影响正常启动流程。调用方应当在主进程启动尽早的地方调用。
 */
export function setupProtocolHandler(onDeepLink: DeepLinkHandler): void {
  if (process.defaultApp) {
    // 开发模式：`electron .` 启动时必须带上当前脚本路径才能让 Windows 正确回调
    if (process.argv.length >= 2) {
      const ok = app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [
        ...process.argv.slice(1)
      ])
      log.debug('开发模式注册协议', { ok })
    }
  } else {
    const ok = app.setAsDefaultProtocolClient(PROTOCOL_SCHEME)
    log.debug('注册协议', { ok })
  }

  // 首次启动时，进程启动参数里就可能带 `prism://...`
  dispatchFromArgv(process.argv, onDeepLink)

  // 其他实例会触发 second-instance 事件，它的处理在 single-instance.ts 里，
  // 这里提供一个辅助函数给上层复用。
  return
}

/**
 * 从 argv 里找第一个 `prism://` URL 并调用回调。
 *
 * argv 里可能混着 `--flag`、脚本路径、工作目录之类的东西，所以要挨个判断。
 */
export function dispatchFromArgv(argv: string[], onDeepLink: DeepLinkHandler): void {
  for (const arg of argv) {
    if (typeof arg !== 'string') continue
    if (!arg.toLowerCase().startsWith(`${PROTOCOL_SCHEME}://`)) continue
    try {
      const url = new URL(arg)
      log.info('解析到深链', { url: arg })
      onDeepLink(url)
      return
    } catch (err) {
      log.warn('深链解析失败', { arg, err: String(err) })
    }
  }
}
