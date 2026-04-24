import type { SerializedError } from './types'

export class PrismError extends Error {
  code: string
  detail?: string
  constructor(code: string, message: string, detail?: string) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.detail = detail
  }
}

export class DownloadError extends PrismError {
  constructor(message: string, detail?: string) {
    super('DOWNLOAD_ERROR', message, detail)
  }
}

export class TranscribeError extends PrismError {
  constructor(message: string, detail?: string) {
    super('TRANSCRIBE_ERROR', message, detail)
  }
}

export class LLMError extends PrismError {
  constructor(message: string, detail?: string) {
    super('LLM_ERROR', message, detail)
  }
}

export class TTSError extends PrismError {
  constructor(message: string, detail?: string) {
    super('TTS_ERROR', message, detail)
  }
}

export class SettingsError extends PrismError {
  constructor(message: string, detail?: string) {
    super('SETTINGS_ERROR', message, detail)
  }
}

export class WorkspaceNotFoundError extends PrismError {
  constructor(workspaceId: string) {
    super('WORKSPACE_NOT_FOUND', `工作区不存在: ${workspaceId}`)
  }
}

export function serializeError(err: unknown): SerializedError {
  if (err instanceof PrismError) {
    return {
      name: err.name,
      message: err.message,
      code: err.code,
      detail: err.detail
    }
  }
  if (err instanceof Error) {
    return { name: err.name, message: err.message }
  }
  return { name: 'UnknownError', message: String(err) }
}
