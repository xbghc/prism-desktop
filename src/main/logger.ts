import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPaths } from './paths'

type Level = 'debug' | 'info' | 'warn' | 'error'

function format(level: Level, scope: string, msg: string, extra?: unknown): string {
  const ts = new Date().toISOString()
  const tail = extra === undefined ? '' : ' ' + safeStringify(extra)
  return `${ts} [${level.toUpperCase()}] [${scope}] ${msg}${tail}\n`
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function write(level: Level, scope: string, msg: string, extra?: unknown): void {
  const line = format(level, scope, msg, extra)

  if (level === 'error' || level === 'warn') {
    process.stderr.write(line)
  } else {
    process.stdout.write(line)
  }

  try {
    const logPath = join(getPaths().logs, 'main.log')
    appendFileSync(logPath, line, 'utf8')
  } catch {
    // 日志目录还没就绪或被占用时静默失败，不拖崩主进程
  }
}

export interface Logger {
  debug(msg: string, extra?: unknown): void
  info(msg: string, extra?: unknown): void
  warn(msg: string, extra?: unknown): void
  error(msg: string, extra?: unknown): void
}

export function createLogger(scope: string): Logger {
  return {
    debug: (msg, extra) => write('debug', scope, msg, extra),
    info: (msg, extra) => write('info', scope, msg, extra),
    warn: (msg, extra) => write('warn', scope, msg, extra),
    error: (msg, extra) => write('error', scope, msg, extra)
  }
}
