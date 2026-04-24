import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, type Settings } from '../shared/types'
import { SettingsError } from '../shared/errors'
import { getPaths } from './paths'
import { createLogger } from './logger'

const log = createLogger('settings')

let cached: Settings | null = null

function configFile(): string {
  return join(getPaths().userData, 'config.json')
}

function readDisk(): Partial<Settings> {
  const path = configFile()
  if (!existsSync(path)) return {}
  try {
    const raw = readFileSync(path, 'utf8')
    return JSON.parse(raw) as Partial<Settings>
  } catch (err) {
    log.warn('读取配置文件失败，使用默认值', { path, err: String(err) })
    return {}
  }
}

function applyRuntimeDefaults(s: Settings): Settings {
  const paths = getPaths()
  return {
    ...s,
    dataDir: s.dataDir || paths.data,
    tempDir: s.tempDir || paths.temp
  }
}

export function loadSettings(): Settings {
  if (cached) return cached
  const fromDisk = readDisk()
  const merged: Settings = { ...DEFAULT_SETTINGS, ...fromDisk }
  cached = applyRuntimeDefaults(merged)
  return cached
}

export function getSettings(): Settings {
  return cached ?? loadSettings()
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const current = getSettings()
  const next: Settings = applyRuntimeDefaults({ ...current, ...patch })
  try {
    writeFileSync(configFile(), JSON.stringify(next, null, 2), 'utf8')
  } catch (err) {
    throw new SettingsError('保存配置失败', String(err))
  }
  cached = next
  return next
}

/**
 * 代理解析：配置文件 proxyUrl > HTTPS_PROXY / https_proxy / ALL_PROXY / all_proxy 环境变量。
 */
export function effectiveProxy(): string {
  const s = getSettings()
  if (s.proxyUrl) return s.proxyUrl
  for (const key of ['HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy']) {
    const value = process.env[key]
    if (value) return value
  }
  return ''
}
