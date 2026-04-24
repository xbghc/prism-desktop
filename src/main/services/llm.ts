/**
 * LLM 服务 - 由 External APIs agent 实现
 *
 * 职责：根据转录文本生成大纲、文章、播客脚本。使用 Anthropic 兼容端点
 * （settings.anthropicBaseUrl / anthropicModel / anthropicApiKey）。
 *
 * 实现要点：
 * - 必须 SSE / stream 形式返回，通过 onDelta 回调增量推送
 * - 支持 AbortSignal 取消
 * - 使用 @anthropic-ai/sdk 或直接 fetch
 * - prompts 文件放在 resources/prompts/ 下（agent 自行创建）
 * - 错误抛 LLMError
 */

import { LLMError } from '../../shared/errors'
import type { ContentType } from '../../shared/types'

export interface GenerateOptions {
  workspaceId: string
  contentType: ContentType
  transcript: string
  title?: string
  signal?: AbortSignal
  onDelta?: (delta: string) => void
}

export async function generateContent(_opts: GenerateOptions): Promise<string> {
  throw new LLMError('LLM 尚未实现', '由 External APIs worker 填充')
}
