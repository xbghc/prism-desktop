/**
 * TTS 服务 - 由 External APIs agent 实现
 *
 * 职责：把播客脚本合成为音频文件。使用 DashScope CosyVoice
 * （settings.dashscopeApiKey）。
 *
 * 实现要点：
 * - 支持多人对话脚本（脚本格式由 LLM 产出，例如 "A:...\nB:..."）
 * - 输出到工作区目录的 podcast.mp3
 * - 支持 AbortSignal
 * - 错误抛 TTSError
 */

import { TTSError } from '../../shared/errors'

export interface SynthesizeOptions {
  workspaceId: string
  script: string
  outputPath: string
  signal?: AbortSignal
  onProgress?: (fraction: number) => void
}

export async function synthesizePodcast(_opts: SynthesizeOptions): Promise<string> {
  throw new TTSError('TTS 尚未实现', '由 External APIs worker 填充')
}
