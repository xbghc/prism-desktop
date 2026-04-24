import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { generateContent } from '../services/llm'
import { synthesizePodcast } from '../services/tts'
import { getWorkspace, addResource } from '../workspace-store'
import { workspaceDir } from '../paths'
import { createLogger } from '../logger'
import { emitContentStream } from '../events'
import { serializeError, WorkspaceNotFoundError } from '../../shared/errors'
import type { ContentType, WorkspaceResource } from '../../shared/types'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const log = createLogger('ipc:content')

const activeJobs = new Map<string, AbortController>()

function jobKey(workspaceId: string, type: ContentType): string {
  return `${workspaceId}::${type}`
}

function transcriptOf(workspaceId: string): string {
  const ws = getWorkspace(workspaceId)
  if (!ws) throw new WorkspaceNotFoundError(workspaceId)
  const tr = ws.resources.find((r) => r.name === 'transcript')
  if (!tr) throw new Error('尚未生成转录，无法生成内容')
  if (tr.content) return tr.content
  if (tr.storageKey) return readFileSync(tr.storageKey, 'utf8')
  throw new Error('转录资源内容为空')
}

function saveTextResource(
  workspaceId: string,
  name: string,
  content: string,
  filename: string
): WorkspaceResource {
  const dir = workspaceDir(workspaceId)
  mkdirSync(dir, { recursive: true })
  const storageKey = join(dir, filename)
  writeFileSync(storageKey, content, 'utf8')
  const resource: WorkspaceResource = {
    resourceId: randomUUID().slice(0, 8),
    name,
    resourceType: 'text',
    storageKey,
    content,
    createdAt: new Date().toISOString()
  }
  addResource(workspaceId, resource)
  return resource
}

async function handleTextContent(
  workspaceId: string,
  contentType: ContentType,
  controller: AbortController
): Promise<void> {
  const ws = getWorkspace(workspaceId)
  if (!ws) throw new WorkspaceNotFoundError(workspaceId)
  const transcript = transcriptOf(workspaceId)

  let accumulated = ''
  const full = await generateContent({
    workspaceId,
    contentType,
    transcript,
    title: ws.title,
    signal: controller.signal,
    onDelta: (delta) => {
      accumulated += delta
      emitContentStream({ workspaceId, contentType, delta })
    }
  })

  const final = full || accumulated
  const filenameMap: Record<ContentType, string> = {
    transcript: 'transcript.txt',
    outline: 'outline.md',
    article: 'article.md',
    podcast_script: 'podcast.script.md',
    podcast_audio: 'podcast.mp3'
  }
  saveTextResource(workspaceId, contentType, final, filenameMap[contentType])
  emitContentStream({ workspaceId, contentType, done: true })
}

async function handlePodcastAudio(
  workspaceId: string,
  controller: AbortController
): Promise<void> {
  const ws = getWorkspace(workspaceId)
  if (!ws) throw new WorkspaceNotFoundError(workspaceId)
  const scriptRes = ws.resources.find((r) => r.name === 'podcast_script')
  if (!scriptRes?.content) {
    throw new Error('请先生成播客脚本（podcast_script）')
  }
  const outputPath = join(workspaceDir(workspaceId), 'podcast.mp3')
  await synthesizePodcast({
    workspaceId,
    script: scriptRes.content,
    outputPath,
    signal: controller.signal
  })
  const resource: WorkspaceResource = {
    resourceId: randomUUID().slice(0, 8),
    name: 'podcast_audio',
    resourceType: 'audio',
    storageKey: outputPath,
    createdAt: new Date().toISOString()
  }
  addResource(workspaceId, resource)
  emitContentStream({ workspaceId, contentType: 'podcast_audio', done: true })
}

export function registerContentHandlers(): void {
  ipcMain.handle(
    IPC.CONTENT_GENERATE,
    async (_evt, payload: { workspaceId: string; contentType: ContentType }) => {
      const { workspaceId, contentType } = payload
      const key = jobKey(workspaceId, contentType)
      activeJobs.get(key)?.abort()
      const controller = new AbortController()
      activeJobs.set(key, controller)

      try {
        if (contentType === 'podcast_audio') {
          await handlePodcastAudio(workspaceId, controller)
        } else {
          await handleTextContent(workspaceId, contentType, controller)
        }
      } catch (err) {
        log.error('生成内容失败', { workspaceId, contentType, err: String(err) })
        const serialized = serializeError(err)
        emitContentStream({
          workspaceId,
          contentType,
          error: serialized.message
        })
        throw serialized
      } finally {
        if (activeJobs.get(key) === controller) {
          activeJobs.delete(key)
        }
      }
    }
  )

  ipcMain.handle(
    IPC.CONTENT_CANCEL,
    (_evt, payload: { workspaceId: string; contentType: ContentType }) => {
      const key = jobKey(payload.workspaceId, payload.contentType)
      activeJobs.get(key)?.abort()
      activeJobs.delete(key)
    }
  )
}
