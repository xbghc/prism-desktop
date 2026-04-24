import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getPaths, workspaceDir } from './paths'
import { createLogger } from './logger'
import type { Workspace, WorkspaceResource, WorkspaceStatus } from '../shared/types'
import { WorkspaceNotFoundError } from '../shared/errors'

const log = createLogger('workspace-store')

let cache: Map<string, Workspace> | null = null

function stateFile(): string {
  return join(getPaths().userData, 'workspaces.json')
}

function load(): Map<string, Workspace> {
  if (cache) return cache
  const path = stateFile()
  const map = new Map<string, Workspace>()
  if (existsSync(path)) {
    try {
      const raw = readFileSync(path, 'utf8')
      const list = JSON.parse(raw) as Workspace[]
      for (const w of list) {
        map.set(w.workspaceId, w)
      }
    } catch (err) {
      log.warn('读取工作区 state 失败，从空开始', { err: String(err) })
    }
  }
  cache = map
  return cache
}

function persist(): void {
  const list = Array.from(load().values())
  try {
    writeFileSync(stateFile(), JSON.stringify(list, null, 2), 'utf8')
  } catch (err) {
    log.error('持久化工作区 state 失败', { err: String(err) })
  }
}

function now(): string {
  return new Date().toISOString()
}

export function createWorkspace(url: string): Workspace {
  const workspaceId = randomUUID().slice(0, 12)
  const workspace: Workspace = {
    workspaceId,
    url,
    title: '',
    status: 'pending',
    progress: '',
    resources: [],
    createdAt: now(),
    updatedAt: now()
  }
  load().set(workspaceId, workspace)
  persist()
  log.info('创建工作区', { workspaceId, url })
  return workspace
}

export function getWorkspace(workspaceId: string): Workspace | null {
  return load().get(workspaceId) ?? null
}

export function listWorkspaces(): Workspace[] {
  return Array.from(load().values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function updateWorkspace(
  workspaceId: string,
  patch: Partial<Omit<Workspace, 'workspaceId' | 'createdAt'>>
): Workspace {
  const map = load()
  const current = map.get(workspaceId)
  if (!current) throw new WorkspaceNotFoundError(workspaceId)
  const next: Workspace = { ...current, ...patch, updatedAt: now() }
  map.set(workspaceId, next)
  persist()
  return next
}

export function setStatus(
  workspaceId: string,
  status: WorkspaceStatus,
  progress: string,
  extra?: Partial<Pick<Workspace, 'error' | 'title' | 'duration'>>
): Workspace {
  return updateWorkspace(workspaceId, { status, progress, ...extra })
}

export function addResource(workspaceId: string, resource: WorkspaceResource): Workspace {
  const current = getWorkspace(workspaceId)
  if (!current) throw new WorkspaceNotFoundError(workspaceId)
  const resources = [...current.resources.filter((r) => r.name !== resource.name), resource]
  return updateWorkspace(workspaceId, { resources })
}

export function deleteWorkspace(workspaceId: string): void {
  const map = load()
  if (!map.has(workspaceId)) return
  map.delete(workspaceId)
  persist()
  try {
    rmSync(workspaceDir(workspaceId), { recursive: true, force: true })
  } catch (err) {
    log.warn('删除工作区文件夹失败', { workspaceId, err: String(err) })
  }
  log.info('删除工作区', { workspaceId })
}
