/**
 * 工作区流水线：下载 → 提取音频 → 转录 → ready
 *
 * 这个文件是 Downloader / External APIs agent 的协作点：
 * - downloadVideo 由 Downloader 实现
 * - transcribeAudio 由 External APIs 实现
 *
 * 流水线本身由架构师提供，agent 不用改这个文件（除非有流程缺陷）。
 */

import { createLogger } from './logger'
import { downloadVideo } from './services/downloader'
import { transcribeAudio } from './services/transcribe'
import { getSettings } from './settings'
import { addResource, getWorkspace, setStatus } from './workspace-store'
import { emitWorkspaceProgress } from './events'
import { DownloadError, TranscribeError, WorkspaceNotFoundError } from '../shared/errors'
import type { WorkspaceResource } from '../shared/types'
import { randomUUID } from 'node:crypto'

const log = createLogger('pipeline')

function pushProgress(workspaceId: string): void {
  const ws = getWorkspace(workspaceId)
  if (!ws) return
  emitWorkspaceProgress({
    workspaceId,
    status: ws.status,
    progress: ws.progress,
    error: ws.error,
    resources: ws.resources,
    title: ws.title,
    duration: ws.duration
  })
}

export async function runWorkspacePipeline(workspaceId: string): Promise<void> {
  const ws = getWorkspace(workspaceId)
  if (!ws) throw new WorkspaceNotFoundError(workspaceId)
  const settings = getSettings()

  try {
    // 1. 下载
    setStatus(workspaceId, 'downloading', '正在下载视频...')
    pushProgress(workspaceId)

    const download = await downloadVideo({
      workspaceId,
      url: ws.url,
      onProgress: (p) => {
        const pct = p.percent ? ` ${p.percent.toFixed(0)}%` : ''
        setStatus(workspaceId, 'downloading', `下载中${pct}`)
        pushProgress(workspaceId)
      }
    })

    // 更新工作区：title, duration, 视频/音频资源
    setStatus(workspaceId, 'downloading', `下载完成: ${download.title}`, {
      title: download.title,
      duration: download.duration
    })
    addResource(workspaceId, download.videoResource)
    addResource(workspaceId, download.audioResource)
    pushProgress(workspaceId)

    // 2. 时长校验
    if (download.duration && download.duration > settings.maxVideoDuration) {
      const maxMin = Math.floor(settings.maxVideoDuration / 60)
      const vidMin = Math.floor(download.duration / 60)
      throw new DownloadError(`视频时长 ${vidMin} 分钟，超过限制 ${maxMin} 分钟`)
    }

    // 3. 转录
    setStatus(workspaceId, 'transcribing', '正在转录音频...')
    pushProgress(workspaceId)

    const transcript = await transcribeAudio({
      workspaceId,
      audioPath: download.audioPath,
      onProgress: (f) => {
        setStatus(workspaceId, 'transcribing', `转录中 ${Math.floor(f * 100)}%`)
        pushProgress(workspaceId)
      }
    })

    const transcriptResource: WorkspaceResource = {
      resourceId: randomUUID().slice(0, 8),
      name: 'transcript',
      resourceType: 'text',
      content: transcript,
      createdAt: new Date().toISOString()
    }
    addResource(workspaceId, transcriptResource)

    // 4. ready
    setStatus(workspaceId, 'ready', '转录完成')
    pushProgress(workspaceId)
    log.info('流水线完成', { workspaceId })
  } catch (err) {
    const msg =
      err instanceof DownloadError
        ? `下载失败: ${err.message}`
        : err instanceof TranscribeError
          ? `转录失败: ${err.message}`
          : String(err)
    setStatus(workspaceId, 'failed', msg, { error: msg })
    pushProgress(workspaceId)
    log.warn('流水线失败', { workspaceId, err: String(err) })
  }
}
