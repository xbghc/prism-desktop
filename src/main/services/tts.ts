/**
 * TTS 服务 - DashScope qwen3-tts-flash（阿里云百炼）合成播客音频
 *
 * MVP 简化策略：
 * - 单音色整段合成（voice=Maia, model=qwen3-tts-flash）
 * - 按 DashScope 600 TTS 字符数限制自动切段 → 逐段合成 → 顺序拼接 MP3 字节
 *   （裸 MP3 帧顺序拼接在主流播放器兼容性可接受；高保真后续迭代用 ffmpeg 合流）
 *
 * 输入脚本格式兼容：
 * 1) LLM JSON: { "segments": ["...", "..."] }
 * 2) 原文裸文本，直接当作单段处理
 * TODO: 支持多人对话格式（`A:...\nB:...` 分配不同音色，需要后续迭代）
 *
 * 其他：
 * - 错误抛 TTSError
 * - 支持 AbortSignal
 * - 进度回调按段数分摊
 */
import { writeFileSync } from 'node:fs'
import { TTSError } from '../../shared/errors'
import { getSettings } from '../settings'
import { createLogger } from '../logger'

const log = createLogger('tts')

const DASHSCOPE_API_URL =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
const DEFAULT_VOICE = 'Maia'
const DEFAULT_MODEL = 'qwen3-tts-flash'

/** DashScope 单次 TTS 字符上限（中文算 2，ASCII 算 1） */
const TTS_MAX_CHARS = 600

/** 顺序合成间隔，避免瞬时限流 */
const MAX_RETRIES = 5

export interface SynthesizeOptions {
  workspaceId: string
  script: string
  outputPath: string
  signal?: AbortSignal
  onProgress?: (fraction: number) => void
}

interface DashScopeResponse {
  output?: { audio?: { url?: string } }
  message?: string
  code?: string
}

function ttsCharCount(text: string): number {
  let count = 0
  for (const ch of text) {
    count += ch.charCodeAt(0) > 127 ? 2 : 1
  }
  return count
}

/** 解析 LLM 返回的脚本：优先 JSON {segments:[]}，失败则按裸文本单段返回 */
function parseSegments(script: string): string[] {
  if (!script || !script.trim()) {
    throw new TTSError('播客脚本为空')
  }
  const trimmed = script.trim()

  // 直接 JSON
  try {
    const data = JSON.parse(trimmed) as unknown
    const segs = extractSegmentsField(data)
    if (segs) return segs
  } catch {
    // fall through
  }

  // 从 markdown 代码块里找 JSON
  const match = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
  if (match) {
    try {
      const data = JSON.parse(match[1]) as unknown
      const segs = extractSegmentsField(data)
      if (segs) return segs
    } catch {
      // fall through
    }
  }

  // 尝试定位脚本中第一个 `{...}` JSON 对象
  const objStart = trimmed.indexOf('{')
  const objEnd = trimmed.lastIndexOf('}')
  if (objStart >= 0 && objEnd > objStart) {
    try {
      const data = JSON.parse(trimmed.slice(objStart, objEnd + 1)) as unknown
      const segs = extractSegmentsField(data)
      if (segs) return segs
    } catch {
      // fall through
    }
  }

  // 兜底：把整段文本当作单段，让下游 splitBySize 按字符数再切
  log.warn('脚本不是 JSON 格式，作为纯文本单段处理')
  return [trimmed]
}

function extractSegmentsField(data: unknown): string[] | null {
  if (!data || typeof data !== 'object') return null
  const segments = (data as { segments?: unknown }).segments
  if (!Array.isArray(segments)) return null
  const out: string[] = []
  for (const s of segments) {
    if (typeof s === 'string' && s.trim()) out.push(s.trim())
  }
  return out.length > 0 ? out : null
}

/** 把超过 TTS_MAX_CHARS 的段按标点拆成多段 */
function splitLongSegment(text: string, maxChars: number): string[] {
  const out: string[] = []
  let remaining = text

  while (remaining) {
    if (ttsCharCount(remaining) <= maxChars) {
      out.push(remaining)
      break
    }

    // 找到不超过 maxChars 的最大切点
    let cutPos = 0
    let current = 0
    for (let i = 0; i < remaining.length; i++) {
      const cost = remaining.charCodeAt(i) > 127 ? 2 : 1
      if (current + cost > maxChars) break
      current += cost
      cutPos = i + 1
    }

    const chunk = remaining.slice(0, cutPos)

    const punct = ['。', '！', '？', '.', '!', '?', '；', ';', '，', ',']
    let splitAt = -1
    for (const p of punct) {
      splitAt = Math.max(splitAt, chunk.lastIndexOf(p))
      if (splitAt >= 0 && '。！？.!?'.includes(p)) break
    }
    if (splitAt < 0) splitAt = cutPos - 1

    out.push(remaining.slice(0, splitAt + 1).trim())
    remaining = remaining.slice(splitAt + 1).trim()
  }

  return out.filter((s) => s.length > 0)
}

function makeSafeSegments(raw: string[]): string[] {
  const out: string[] = []
  for (const seg of raw) {
    if (ttsCharCount(seg) <= TTS_MAX_CHARS) {
      out.push(seg)
    } else {
      out.push(...splitLongSegment(seg, TTS_MAX_CHARS))
    }
  }
  return out
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new TTSError('TTS 已取消', 'user abort'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(new TTSError('TTS 已取消', 'user abort'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** 调 DashScope 取音频 URL，带重试 */
async function callDashScope(
  text: string,
  apiKey: string,
  signal: AbortSignal | undefined
): Promise<string> {
  const payload = {
    model: DEFAULT_MODEL,
    input: { text, voice: DEFAULT_VOICE }
  }
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (signal?.aborted) {
      throw new TTSError('TTS 已取消', 'user abort')
    }

    let response: Response
    try {
      response = await fetch(DASHSCOPE_API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal
      })
    } catch (err) {
      if (signal?.aborted) throw new TTSError('TTS 已取消', 'user abort')
      if (attempt < MAX_RETRIES - 1) {
        log.warn('DashScope 连接失败，重试', { attempt, err: String(err) })
        await sleep(1000, signal)
        continue
      }
      throw new TTSError('DashScope 连接失败', String(err))
    }

    // 429 限流：退避 30s
    if (response.status === 429) {
      if (attempt < MAX_RETRIES - 1) {
        log.warn('DashScope 限流 429，30 秒后重试', { attempt })
        await sleep(30_000, signal)
        continue
      }
      throw new TTSError('DashScope 限流，重试已耗尽', 'HTTP 429')
    }

    let data: DashScopeResponse
    try {
      data = (await response.json()) as DashScopeResponse
    } catch (err) {
      throw new TTSError('DashScope 响应解析失败', String(err))
    }

    const url = data.output?.audio?.url
    if (url) return url

    const msg = data.message ?? JSON.stringify(data).slice(0, 300)
    if (/rate limit/i.test(msg)) {
      if (attempt < MAX_RETRIES - 1) {
        log.warn('DashScope 响应限流，30 秒后重试', { attempt, msg })
        await sleep(30_000, signal)
        continue
      }
      throw new TTSError('DashScope 限流，重试已耗尽', msg)
    }

    throw new TTSError(`DashScope 错误: ${msg}`, `status=${response.status}`)
  }

  throw new TTSError('DashScope 重试耗尽', 'unreachable')
}

/** 下载音频到内存 */
async function downloadAudio(url: string, signal: AbortSignal | undefined): Promise<Uint8Array> {
  let response: Response
  try {
    response = await fetch(url, { signal })
  } catch (err) {
    if (signal?.aborted) throw new TTSError('TTS 已取消', 'user abort')
    throw new TTSError('音频下载失败', String(err))
  }
  if (!response.ok) {
    throw new TTSError(`音频下载失败 HTTP ${response.status}`, url)
  }
  const buf = await response.arrayBuffer()
  return new Uint8Array(buf)
}

export async function synthesizePodcast(opts: SynthesizeOptions): Promise<string> {
  const { script, outputPath, signal, onProgress } = opts

  const settings = getSettings()
  if (!settings.dashscopeApiKey) {
    throw new TTSError('未配置 DashScope API Key', 'settings.dashscopeApiKey 为空')
  }

  const rawSegments = parseSegments(script)
  const segments = makeSafeSegments(rawSegments)
  if (segments.length === 0) {
    throw new TTSError('脚本分段为空')
  }

  log.info('开始 TTS 合成', {
    workspaceId: opts.workspaceId,
    segmentCount: segments.length,
    outputPath
  })

  onProgress?.(0)

  // 顺序合成：简化实现，避免同时并发多个下载流被限流。
  // 注意：这里为每段独立下载 MP3 字节，最后顺序 Buffer.concat 写入 outputPath。
  // 这是 MVP 的折衷——MP3 裸帧顺序拼接主流播放器兼容，但边界处可能有爆音。
  // 如需无损合流，后续可引入 ffmpeg 或 WASM 解码器。
  const buffers: Uint8Array[] = []
  for (let i = 0; i < segments.length; i++) {
    if (signal?.aborted) {
      throw new TTSError('TTS 已取消', 'user abort')
    }

    const seg = segments[i]
    log.debug('合成分段', { index: i, totalCount: segments.length, chars: seg.length })
    const audioUrl = await callDashScope(seg, settings.dashscopeApiKey, signal)
    const bytes = await downloadAudio(audioUrl, signal)
    buffers.push(bytes)

    onProgress?.((i + 1) / segments.length)
  }

  const totalBytes = buffers.reduce((sum, b) => sum + b.byteLength, 0)
  const merged = new Uint8Array(totalBytes)
  let offset = 0
  for (const b of buffers) {
    merged.set(b, offset)
    offset += b.byteLength
  }

  try {
    writeFileSync(outputPath, merged)
  } catch (err) {
    throw new TTSError('写入音频文件失败', String(err))
  }

  log.info('TTS 合成完成', { outputPath, bytes: totalBytes })
  return outputPath
}
