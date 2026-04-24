/**
 * 全局热键：
 *
 * 在系统任意位置按下 Ctrl+Shift+V，读取剪贴板内容。如果它像一条视频 URL
 * （YouTube / B 站 / 抖音 / 小红书 / 通用 http），就调用回调触发建工作区流程。
 */
import { clipboard, globalShortcut } from 'electron'
import { createLogger } from '../logger'

const log = createLogger('platform/shortcuts')

export const PASTE_ACCELERATOR = 'Control+Shift+V'

export interface ShortcutsOptions {
  onPasteUrl: (url: string) => void
}

export interface ShortcutsController {
  stop: () => void
}

const VIDEO_HOST_PATTERNS: RegExp[] = [
  /(^|\.)youtube\.com$/i,
  /(^|\.)youtu\.be$/i,
  /(^|\.)bilibili\.com$/i,
  /(^|\.)b23\.tv$/i,
  /(^|\.)douyin\.com$/i,
  /(^|\.)iesdouyin\.com$/i,
  /(^|\.)xiaohongshu\.com$/i,
  /(^|\.)xhslink\.com$/i
]

/**
 * 判断字符串是否像一个视频链接。
 *
 * 策略：
 * 1. 尝试当成 URL 解析；解析失败视为普通文本。
 * 2. 命中 VIDEO_HOST_PATTERNS 中任意一个 → 返回 URL 本身
 * 3. 如果协议是 http/https，也认为可能是视频（下载器自会再判一次）
 */
export function extractVideoUrl(text: string): string | null {
  if (!text) return null
  const trimmed = text.trim()
  if (!trimmed) return null

  // 剪贴板里常常还夹带小红书式的「xxx复制此链接 https://xxx 打开」之类的噪声，
  // 简单粗暴地抽第一个 http(s) 子串。
  const httpMatch = trimmed.match(/https?:\/\/[^\s<>"']+/i)
  if (!httpMatch) return null
  const candidate = httpMatch[0]

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return null
  }

  if (VIDEO_HOST_PATTERNS.some((re) => re.test(url.hostname))) {
    return candidate
  }

  // 不在白名单但是 http(s) URL：保守地也放行，后端 downloader 会拒。
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    return candidate
  }
  return null
}

export function registerGlobalShortcuts(opts: ShortcutsOptions): ShortcutsController {
  const handler = (): void => {
    const text = clipboard.readText().trim()
    const url = extractVideoUrl(text)
    if (!url) {
      log.info('剪贴板内容不像视频链接，忽略', {
        preview: text.slice(0, 80)
      })
      return
    }
    log.info('触发 Ctrl+Shift+V 粘贴创建', { url })
    try {
      opts.onPasteUrl(url)
    } catch (err) {
      log.warn('onPasteUrl 回调抛错', { err: String(err) })
    }
  }

  const ok = globalShortcut.register(PASTE_ACCELERATOR, handler)
  if (!ok) {
    log.warn('注册全局热键失败，可能被其他应用占用', { accelerator: PASTE_ACCELERATOR })
  } else {
    log.info('全局热键已注册', { accelerator: PASTE_ACCELERATOR })
  }

  return {
    stop: () => {
      globalShortcut.unregister(PASTE_ACCELERATOR)
    }
  }
}
