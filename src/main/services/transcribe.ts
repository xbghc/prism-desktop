/**
 * 转录服务 - 由 External APIs agent 实现
 *
 * 职责：把 mp3 转为文字。优先用 Whisper 兼容 API（settings.whisperBaseUrl），
 * 也允许 fallback 到 DashScope Paraformer（settings.dashscopeSttModel）。
 *
 * 实现要点：
 * - 错误抛 TranscribeError
 * - 短音频直传，长音频需要分段（可选，MVP 可不做）
 * - 支持 AbortSignal 取消
 */

import { TranscribeError } from '../../shared/errors'

export interface TranscribeOptions {
  workspaceId: string
  audioPath: string
  signal?: AbortSignal
  onProgress?: (fraction: number) => void
}

export async function transcribeAudio(_opts: TranscribeOptions): Promise<string> {
  throw new TranscribeError('Transcribe 尚未实现', '由 External APIs worker 填充')
}
