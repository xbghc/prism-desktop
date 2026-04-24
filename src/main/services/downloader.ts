/**
 * 下载服务 - Downloader worker 实现
 *
 * 职责：把视频链接变成 mp4 + mp3 落在工作区目录，过程中通过 onProgress 回调推送进度。
 *
 * 当前实现：仅支持 YouTube（yt-dlp.exe + ffmpeg.exe）。其他平台抛 DownloadError。
 * 二进制通过 electron-builder 的 extraResources 随安装包分发，开发时由
 * `pnpm fetch-bin` 下载到 resources/bin/。
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { app } from 'electron'
import { is } from '@electron-toolkit/utils'

import { DownloadError } from '../../shared/errors'
import type { WorkspaceResource } from '../../shared/types'
import { createLogger } from '../logger'
import { workspaceDir } from '../paths'
import { effectiveProxy } from '../settings'

const log = createLogger('downloader')

export interface DownloadProgress {
  phase: 'parsing' | 'downloading' | 'merging'
  percent?: number
  downloadedBytes?: number
  totalBytes?: number
  speedBytesPerSec?: number
}

export interface DownloadResult {
  videoPath: string
  audioPath: string
  title: string
  duration?: number
  videoResource: WorkspaceResource
  audioResource: WorkspaceResource
}

export interface DownloadOptions {
  workspaceId: string
  url: string
  onProgress?: (p: DownloadProgress) => void
  signal?: AbortSignal
}

const META_PREFIX = '__META__'
const UNIT_MULTIPLIERS: Record<string, number> = {
  B: 1,
  KB: 1000,
  KIB: 1024,
  MB: 1000 ** 2,
  MIB: 1024 ** 2,
  GB: 1000 ** 3,
  GIB: 1024 ** 3,
  TB: 1000 ** 4,
  TIB: 1024 ** 4
}
const PROGRESS_RE = /\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+)(\w+)/

export interface ParsedProgressLine {
  kind: 'progress'
  percent: number
  totalBytes: number
  downloadedBytes: number
}

export interface ParsedMetaLine {
  kind: 'meta'
  title: string
  duration?: number
}

export interface ParsedErrorLine {
  kind: 'error'
  message: string
}

export type ParsedLine = ParsedProgressLine | ParsedMetaLine | ParsedErrorLine | null

/**
 * 解析 yt-dlp 输出的一行，返回结构化信息。
 * 导出以便单元测试。纯函数，无副作用。
 */
export function parseYtdlpLine(raw: string): ParsedLine {
  const line = raw.replace(/\r/g, '').trimEnd()
  if (!line) return null

  if (line.startsWith('ERROR:')) {
    return { kind: 'error', message: line }
  }

  if (line.startsWith(META_PREFIX)) {
    const payload = line.slice(META_PREFIX.length)
    const tabIdx = payload.lastIndexOf('\t')
    if (tabIdx < 0) {
      return { kind: 'meta', title: payload }
    }
    const title = payload.slice(0, tabIdx)
    const durationStr = payload.slice(tabIdx + 1)
    let duration: number | undefined
    if (durationStr && durationStr !== 'NA') {
      const parsed = Number.parseFloat(durationStr)
      if (Number.isFinite(parsed)) {
        duration = Math.floor(parsed)
      }
    }
    return { kind: 'meta', title, duration }
  }

  const m = PROGRESS_RE.exec(line)
  if (m) {
    const percent = Number.parseFloat(m[1])
    const totalValue = Number.parseFloat(m[2])
    const unit = m[3].toUpperCase()
    const mult = UNIT_MULTIPLIERS[unit] ?? 1
    const totalBytes = Math.floor(totalValue * mult)
    const downloadedBytes = Math.floor((totalBytes * percent) / 100)
    return { kind: 'progress', percent, totalBytes, downloadedBytes }
  }

  return null
}

function isYouTubeUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return (
      host === 'youtube.com' ||
      host.endsWith('.youtube.com') ||
      host === 'youtu.be' ||
      host.endsWith('.youtu.be')
    )
  } catch {
    return false
  }
}

function binPath(name: 'yt-dlp.exe' | 'ffmpeg.exe'): string {
  const base = is.dev ? join(app.getAppPath(), 'resources/bin') : join(process.resourcesPath, 'bin')
  return join(base, name)
}

function ensureBin(name: 'yt-dlp.exe' | 'ffmpeg.exe'): string {
  const p = binPath(name)
  if (!existsSync(p)) {
    throw new DownloadError(`${name} 未找到，请先运行 pnpm fetch-bin`, p)
  }
  return p
}

function hookAbort(signal: AbortSignal | undefined, child: ChildProcess): () => void {
  if (!signal) return () => {}
  const onAbort = (): void => {
    if (!child.killed) {
      try {
        child.kill()
      } catch {
        // ignore
      }
    }
  }
  if (signal.aborted) {
    onAbort()
  } else {
    signal.addEventListener('abort', onAbort, { once: true })
  }
  return () => signal.removeEventListener('abort', onAbort)
}

async function runYtdlp(
  url: string,
  videoPath: string,
  onProgress: ((p: DownloadProgress) => void) | undefined,
  signal: AbortSignal | undefined
): Promise<{ title: string; duration?: number }> {
  const exe = ensureBin('yt-dlp.exe')

  const args = [
    '--no-playlist',
    '--no-warnings',
    '--no-part',
    '-f',
    'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b',
    '--merge-output-format',
    'mp4',
    '--concurrent-fragments',
    '16',
    '--retries',
    '3',
    '--newline',
    '-o',
    videoPath,
    '--print',
    `after_move:${META_PREFIX}%(title)s\t%(duration)s`
  ]

  const proxy = effectiveProxy()
  if (proxy) {
    args.push('--proxy', proxy)
    log.info('yt-dlp 使用代理', { proxy })
  }

  args.push(url)

  log.info('启动 yt-dlp', { url, videoPath })

  const child = spawn(exe, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  const detach = hookAbort(signal, child)

  // 立即挂载退出监听，避免进程秒退时 listener 还没 attach 丢事件。
  // 用 'close' 而不是 'exit' —— 'close' 在 stdio 完全关闭后才 fire，
  // 保证我们读完 stdout/stderr 再判退出码。
  const closePromise = new Promise<number>((resolve, reject) => {
    child.once('close', (code) => resolve(code ?? -1))
    child.once('error', reject)
  })

  const tail: string[] = []
  const errorLines: string[] = []
  let title = ''
  let duration: number | undefined

  const consume = async (stream: NodeJS.ReadableStream): Promise<void> => {
    let buf = ''
    for await (const chunk of stream) {
      buf += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      let idx = buf.indexOf('\n')
      while (idx >= 0) {
        const line = buf.slice(0, idx)
        buf = buf.slice(idx + 1)
        handleLine(line)
        idx = buf.indexOf('\n')
      }
    }
    if (buf.length) handleLine(buf)
  }

  const handleLine = (raw: string): void => {
    if (raw.length === 0) return
    tail.push(raw)
    if (tail.length > 30) tail.shift()

    const parsed = parseYtdlpLine(raw)
    if (!parsed) return
    if (parsed.kind === 'error') {
      errorLines.push(parsed.message)
      return
    }
    if (parsed.kind === 'meta') {
      title = parsed.title
      if (parsed.duration !== undefined) duration = parsed.duration
      return
    }
    if (parsed.kind === 'progress') {
      onProgress?.({
        phase: 'downloading',
        percent: parsed.percent,
        downloadedBytes: parsed.downloadedBytes,
        totalBytes: parsed.totalBytes
      })
    }
  }

  try {
    await Promise.all([consume(child.stdout), consume(child.stderr)])
    const code = await closePromise

    if (signal?.aborted) {
      throw new DownloadError('下载已取消')
    }

    if (code !== 0) {
      const detail = errorLines.slice(-3).join('; ') || tail.slice(-10).join('\n')
      throw new DownloadError(`yt-dlp 退出码 ${code}`, detail)
    }

    if (!existsSync(videoPath)) {
      throw new DownloadError('yt-dlp 执行完成但未找到视频文件', videoPath)
    }

    return { title, duration }
  } finally {
    detach()
  }
}

async function extractAudio(
  videoPath: string,
  audioPath: string,
  onProgress: ((p: DownloadProgress) => void) | undefined,
  signal: AbortSignal | undefined
): Promise<void> {
  const exe = ensureBin('ffmpeg.exe')

  const args = [
    '-i',
    videoPath,
    '-vn',
    '-acodec',
    'libmp3lame',
    '-ab',
    '128k',
    '-ar',
    '44100',
    '-y',
    audioPath
  ]

  log.info('启动 ffmpeg 提取音频', { videoPath, audioPath })
  onProgress?.({ phase: 'merging', percent: 50 })

  const child = spawn(exe, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  const detach = hookAbort(signal, child)

  // 同上：立即挂 'close' 监听，避免快失败的 ffmpeg 丢事件
  const closePromise = new Promise<number>((resolve, reject) => {
    child.once('close', (code) => resolve(code ?? -1))
    child.once('error', reject)
  })

  const tail: string[] = []
  const consume = async (stream: NodeJS.ReadableStream): Promise<void> => {
    for await (const chunk of stream) {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      for (const line of text.split(/\r?\n/)) {
        if (!line) continue
        tail.push(line)
        if (tail.length > 30) tail.shift()
      }
    }
  }

  try {
    await Promise.all([consume(child.stdout), consume(child.stderr)])
    const code = await closePromise

    if (signal?.aborted) {
      throw new DownloadError('下载已取消')
    }

    if (code !== 0) {
      throw new DownloadError(`ffmpeg 退出码 ${code}`, tail.slice(-10).join('\n'))
    }

    if (!existsSync(audioPath)) {
      throw new DownloadError('ffmpeg 执行完成但未找到音频文件', audioPath)
    }

    onProgress?.({ phase: 'merging', percent: 100 })
  } finally {
    detach()
  }
}

export async function downloadVideo(opts: DownloadOptions): Promise<DownloadResult> {
  const { workspaceId, url, onProgress, signal } = opts

  if (!isYouTubeUrl(url)) {
    throw new DownloadError('暂不支持该平台，请提交 YouTube 链接', url)
  }

  onProgress?.({ phase: 'parsing' })

  const wsDir = workspaceDir(workspaceId)
  mkdirSync(wsDir, { recursive: true })

  const videoPath = join(wsDir, 'video.mp4')
  const audioPath = join(wsDir, 'audio.mp3')

  const { title, duration } = await runYtdlp(url, videoPath, onProgress, signal)
  await extractAudio(videoPath, audioPath, onProgress, signal)

  const now = new Date().toISOString()
  const videoResource: WorkspaceResource = {
    resourceId: randomUUID().slice(0, 8),
    name: 'video',
    resourceType: 'video',
    storageKey: videoPath,
    createdAt: now
  }
  const audioResource: WorkspaceResource = {
    resourceId: randomUUID().slice(0, 8),
    name: 'audio',
    resourceType: 'audio',
    storageKey: audioPath,
    createdAt: now
  }

  log.info('下载完成', { workspaceId, title, duration })

  return {
    videoPath,
    audioPath,
    title: title || 'Untitled',
    duration,
    videoResource,
    audioResource
  }
}
