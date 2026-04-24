import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import type { AppPaths } from '../shared/types'

let cached: AppPaths | null = null

export function getPaths(): AppPaths {
  if (cached) return cached

  const userData = app.getPath('userData')
  const data = join(userData, 'data')
  const temp = join(app.getPath('temp'), 'prism')
  const bin = join(userData, 'bin')
  const logs = join(userData, 'logs')

  for (const dir of [userData, data, temp, bin, logs]) {
    mkdirSync(dir, { recursive: true })
  }

  cached = { userData, data, temp, bin, logs }
  return cached
}

export function workspaceDir(workspaceId: string): string {
  return join(getPaths().data, 'workspaces', workspaceId)
}
