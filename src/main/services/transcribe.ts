/**
 * 转录服务 - 调用 Whisper 兼容 API（OpenAI /audio/transcriptions 协议）
 *
 * 设计要点：
 * - 用原生 fetch + FormData，不引入 openai SDK（减少依赖体积）
 * - 端点 / 模型 / Key 从 settings 读取
 * - 文件大于 25MB（OpenAI 官方 Whisper 的硬上限）直接抛错，让用户
 *   自己去配置降分辨率；分段上传放到后续迭代
 * - 支持 AbortSignal 取消
 * - 优先走 verbose_json，保留 [MM:SS] 时间戳；不支持时 fallback 到 text
 */
import { readFileSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import { TranscribeError } from '../../shared/errors'
import { getSettings } from '../settings'
import { createLogger } from '../logger'

const log = createLogger('transcribe')

/** Whisper 兼容 API 的单文件上限（同 OpenAI 官方） */
const MAX_FILE_BYTES = 25 * 1024 * 1024

export interface TranscribeOptions {
  workspaceId: string
  audioPath: string
  signal?: AbortSignal
  onProgress?: (fraction: number) => void
}

interface VerboseJsonSegment {
  start?: number
  text?: string
}

interface VerboseJsonResponse {
  text?: string
  segments?: VerboseJsonSegment[]
}

function formatTimestamp(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0
  const minutes = Math.floor(safe / 60)
  const secs = Math.floor(safe % 60)
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function formatSegments(segments: VerboseJsonSegment[]): string {
  const lines: string[] = []
  for (const seg of segments) {
    const text = (seg.text ?? '').trim()
    if (!text) continue
    lines.push(`[${formatTimestamp(seg.start ?? 0)}] ${text}`)
  }
  return lines.join('\n')
}

function joinUrl(base: string, path: string): string {
  const trimmedBase = base.replace(/\/+$/, '')
  const trimmedPath = path.replace(/^\/+/, '')
  return `${trimmedBase}/${trimmedPath}`
}

export async function transcribeAudio(opts: TranscribeOptions): Promise<string> {
  const { audioPath, signal, onProgress } = opts
  const settings = getSettings()

  if (!settings.whisperBaseUrl) {
    throw new TranscribeError('未配置 Whisper API', 'settings.whisperBaseUrl 为空')
  }
  if (!settings.whisperApiKey) {
    throw new TranscribeError('未配置 Whisper API', 'settings.whisperApiKey 为空')
  }
  if (!settings.whisperModel) {
    throw new TranscribeError('未配置 Whisper 模型', 'settings.whisperModel 为空')
  }

  // 文件大小校验
  let size: number
  try {
    size = statSync(audioPath).size
  } catch (err) {
    throw new TranscribeError('读取音频文件失败', String(err))
  }

  if (size === 0) {
    throw new TranscribeError('音频文件为空', audioPath)
  }
  if (size > MAX_FILE_BYTES) {
    const mb = (size / 1024 / 1024).toFixed(1)
    throw new TranscribeError(
      `音频文件过大 (${mb} MB)，超过 Whisper 25MB 上限`,
      '请缩短视频时长或降低音频码率后重试'
    )
  }

  // 进度条只有 0 / 100（Whisper 没有增量回调）
  onProgress?.(0)

  // 加载文件到 ArrayBuffer 再塞进 FormData（Electron 39 Node 22 支持 Blob / File / FormData / fetch）
  let arrayBuf: ArrayBuffer
  try {
    const buf = readFileSync(audioPath)
    // 拷贝到纯 ArrayBuffer，避免 Node Buffer 的 ArrayBufferLike 类型不兼容 BlobPart
    arrayBuf = new ArrayBuffer(buf.byteLength)
    new Uint8Array(arrayBuf).set(buf)
  } catch (err) {
    throw new TranscribeError('读取音频文件失败', String(err))
  }

  const filename = basename(audioPath) || 'audio.mp3'
  const form = new FormData()
  form.append('file', new File([arrayBuf], filename, { type: 'audio/mpeg' }))
  form.append('model', settings.whisperModel)
  form.append('response_format', 'verbose_json')

  const url = joinUrl(settings.whisperBaseUrl, 'audio/transcriptions')

  log.info('发起转录请求', { url, model: settings.whisperModel, bytes: size })

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${settings.whisperApiKey}` },
      body: form,
      signal
    })
  } catch (err) {
    if (signal?.aborted) {
      throw new TranscribeError('转录已取消', 'user abort')
    }
    throw new TranscribeError('转录 API 连接失败', String(err))
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    const snippet = bodyText.slice(0, 500)
    if (response.status === 429) {
      throw new TranscribeError('转录 API 配额已用尽或限流，请稍后重试', snippet)
    }
    if (response.status === 401 || response.status === 403) {
      throw new TranscribeError('转录 API 鉴权失败', `HTTP ${response.status} ${snippet}`)
    }
    throw new TranscribeError(`转录 API 错误 HTTP ${response.status}`, snippet)
  }

  // 优先 JSON 响应；部分 gateway 可能 fallback 到 text
  const contentType = response.headers.get('content-type') ?? ''
  let text: string

  if (contentType.includes('application/json')) {
    let data: VerboseJsonResponse
    try {
      data = (await response.json()) as VerboseJsonResponse
    } catch (err) {
      throw new TranscribeError('解析转录响应失败', String(err))
    }
    if (Array.isArray(data.segments) && data.segments.length > 0) {
      text = formatSegments(data.segments)
    } else if (typeof data.text === 'string') {
      text = data.text
    } else {
      throw new TranscribeError('转录响应格式异常', JSON.stringify(data).slice(0, 500))
    }
  } else {
    text = await response.text()
  }

  const result = text.trim()
  if (!result) {
    throw new TranscribeError('转录结果为空', '可能音频无人声或 API 异常返回空文本')
  }

  onProgress?.(1)
  log.info('转录完成', { chars: result.length })
  return result
}
