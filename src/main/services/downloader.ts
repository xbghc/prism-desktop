/**
 * 下载服务 - 由 Downloader agent 实现
 *
 * 职责：把视频链接变成 mp4 + mp3 落在工作区目录，过程中通过 onProgress 回调推送进度。
 *
 * 实现要点（给 agent 的提示）：
 * - YouTube 链接（youtube.com / youtu.be）走 yt-dlp.exe，其他链接走 xiazaitool API + aria2c（或暂时只实现 yt-dlp）
 * - 二进制从 resources/bin/（已随安装包分发）加载，Windows 上是 .exe
 * - 代理走 settings.ts 的 effectiveProxy()
 * - 进度解析需要流式读 stdout 的 [download] 行并回调
 * - 错误抛 DownloadError（见 shared/errors.ts）
 */

import type { WorkspaceResource } from '../../shared/types'
import { DownloadError } from '../../shared/errors'

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

export async function downloadVideo(_opts: DownloadOptions): Promise<DownloadResult> {
  throw new DownloadError('Downloader 尚未实现', '由 Downloader worker 填充')
}
