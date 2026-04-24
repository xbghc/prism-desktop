/**
 * LLM 服务 - 使用 @anthropic-ai/sdk 调 Anthropic 兼容端点
 *
 * 设计要点：
 * - 提示词从 resources/prompts/<contentType>.md 读取，占位符 {{title}} / {{transcript}}
 * - SSE 流式：stream.on('text', delta => onDelta(delta))，完成后 finalText() 作为完整结果
 * - 支持 AbortSignal（透传给 SDK 的 RequestOptions）
 * - transcript 类型不走 LLM，直接抛错（ipc/content.ts 的 filenameMap 包含了 transcript
 *   但 pipeline 里已写好 transcript 资源，ipc 不会触发 transcript 走到这里；
 *   作为防御性兜底还是显式报错）
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { LLMError } from '../../shared/errors'
import type { ContentType } from '../../shared/types'
import { getSettings } from '../settings'
import { createLogger } from '../logger'

const log = createLogger('llm')

export interface GenerateOptions {
  workspaceId: string
  contentType: ContentType
  transcript: string
  title?: string
  signal?: AbortSignal
  onDelta?: (delta: string) => void
}

/** prompts 目录解析：
 * - 开发态：electron-vite 里 main 进程 cwd 通常是仓库根，resources/ 就在根目录
 * - 生产态：electron-builder 把 resources/ 拷到 app.getAppPath()/resources 或 process.resourcesPath
 * 这里两种都试，简单且不依赖 electron app 句柄（方便在任何上下文运行）。
 */
function resolvePromptsDir(): string[] {
  const candidates: string[] = []
  // process.resourcesPath 只在打包后的 Electron 运行时存在
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resourcesPath = (process as any).resourcesPath as string | undefined
  if (resourcesPath) {
    candidates.push(join(resourcesPath, 'prompts'))
    candidates.push(join(resourcesPath, 'app', 'resources', 'prompts'))
  }
  candidates.push(join(process.cwd(), 'resources', 'prompts'))
  return candidates
}

function loadPrompt(contentType: ContentType): string {
  const filename = `${contentType}.md`
  const dirs = resolvePromptsDir()
  for (const dir of dirs) {
    try {
      return readFileSync(join(dir, filename), 'utf8')
    } catch {
      // try next candidate
    }
  }
  throw new LLMError(`找不到提示词文件 ${filename}`, `已尝试路径: ${dirs.join(' | ')}`)
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : ''
  )
}

let cachedClient: Anthropic | null = null
let cachedKey = ''
let cachedBaseUrl = ''

function getClient(): Anthropic {
  const settings = getSettings()
  if (!settings.anthropicApiKey) {
    throw new LLMError('未配置 Anthropic API Key', 'settings.anthropicApiKey 为空')
  }

  // 配置变更时重建客户端
  if (
    cachedClient &&
    cachedKey === settings.anthropicApiKey &&
    cachedBaseUrl === settings.anthropicBaseUrl
  ) {
    return cachedClient
  }

  cachedClient = new Anthropic({
    apiKey: settings.anthropicApiKey,
    baseURL: settings.anthropicBaseUrl || undefined
  })
  cachedKey = settings.anthropicApiKey
  cachedBaseUrl = settings.anthropicBaseUrl
  return cachedClient
}

export async function generateContent(opts: GenerateOptions): Promise<string> {
  const { contentType, transcript, title, signal, onDelta } = opts

  if (contentType === 'transcript' || contentType === 'podcast_audio') {
    throw new LLMError(
      `${contentType} 不应走 LLM 生成`,
      'transcript 在 pipeline 里写入；podcast_audio 由 tts 服务生成'
    )
  }

  if (!transcript || !transcript.trim()) {
    throw new LLMError('转录内容为空，无法生成', contentType)
  }

  const settings = getSettings()
  if (!settings.anthropicModel) {
    throw new LLMError('未配置 Anthropic 模型', 'settings.anthropicModel 为空')
  }

  const template = loadPrompt(contentType)
  const userPrompt = renderTemplate(template, {
    title: title ?? '',
    transcript
  })

  const client = getClient()

  log.info('发起 LLM 请求', {
    workspaceId: opts.workspaceId,
    contentType,
    model: settings.anthropicModel,
    promptChars: userPrompt.length
  })

  try {
    const stream = client.messages.stream(
      {
        model: settings.anthropicModel,
        max_tokens: 8000,
        messages: [{ role: 'user', content: userPrompt }]
      },
      signal ? { signal } : undefined
    )

    if (onDelta) {
      stream.on('text', (delta: string) => {
        if (delta) onDelta(delta)
      })
    }

    const text = await stream.finalText()
    log.info('LLM 响应完成', { contentType, chars: text.length })
    return text
  } catch (err) {
    if (signal?.aborted) {
      throw new LLMError('内容生成已取消', 'user abort')
    }
    if (err instanceof Anthropic.APIError) {
      throw new LLMError(`LLM API 错误: ${err.message}`, `status=${err.status ?? 'n/a'}`)
    }
    if (err instanceof LLMError) throw err
    throw new LLMError('LLM 调用失败', String(err))
  }
}
