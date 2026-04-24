/**
 * fetch-bin - 开发环境下载 yt-dlp.exe / ffmpeg.exe 到 resources/bin/
 *
 * 幂等：默认跳过已存在的文件，传 --force 可强制覆盖。
 *
 * 使用：
 *   pnpm fetch-bin
 *   pnpm fetch-bin --force
 *   pnpm fetch-bin yt-dlp      # 只下 yt-dlp
 *   pnpm fetch-bin ffmpeg      # 只下 ffmpeg
 *
 * 代理：如需走代理，设置 HTTPS_PROXY / https_proxy / ALL_PROXY 环境变量。
 * 本脚本会尝试加载 undici ProxyAgent；如果 undici 不可用则静默回落到直连。
 *
 * 注意：二进制不进 git（resources/bin/.gitignore 已配置），只是方便本机开发 / 打包。
 */
import { createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

import AdmZip from 'adm-zip'

type Bin = 'yt-dlp.exe' | 'ffmpeg.exe'

const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
const FFMPEG_ZIP_URL = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BIN_DIR = resolve(__dirname, '..', 'resources', 'bin')

function logInfo(msg: string): void {
  process.stdout.write(`[fetch-bin] ${msg}\n`)
}

function logWarn(msg: string): void {
  process.stderr.write(`[fetch-bin] ${msg}\n`)
}

function humanSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GiB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MiB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KiB`
  return `${bytes} B`
}

let proxyApplied = false

async function applyProxy(): Promise<void> {
  if (proxyApplied) return
  proxyApplied = true
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy
  if (!proxyUrl) return
  try {
    // Node 18+ 自带 undici，fetch 默认不读 HTTPS_PROXY，需要手动装 ProxyAgent。
    // undici 不是 package.json 直接依赖，如果 resolver 找不到就安静回落到直连。
    // @ts-expect-error 非直接依赖，动态 import
    const undici = (await import('undici')) as {
      ProxyAgent: new (url: string) => unknown
      setGlobalDispatcher: (d: unknown) => void
    }
    undici.setGlobalDispatcher(new undici.ProxyAgent(proxyUrl))
    logInfo(`使用代理: ${proxyUrl}`)
  } catch (err) {
    logWarn(
      `检测到 ${proxyUrl} 但 undici 不可用，fetch 将直连。` +
        `如需代理请 pnpm add -D undici。详情: ${String(err)}`
    )
  }
}

async function downloadToFile(url: string, dest: string): Promise<void> {
  await applyProxy()

  // 跟随重定向，最多 10 跳
  const visited = new Set<string>()
  let current = url
  for (let hop = 0; hop < 10; hop++) {
    if (visited.has(current)) {
      throw new Error(`检测到循环重定向: ${current}`)
    }
    visited.add(current)

    logInfo(`GET ${current}`)
    const res = await fetch(current, { redirect: 'manual' })

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) throw new Error(`重定向缺少 location 头: ${res.status}`)
      current = new URL(loc, current).toString()
      continue
    }

    if (!res.ok || !res.body) {
      throw new Error(`下载失败 ${res.status} ${res.statusText}: ${current}`)
    }

    const len = res.headers.get('content-length')
    if (len) logInfo(`大小: ${humanSize(Number.parseInt(len, 10))}`)

    mkdirSync(dirname(dest), { recursive: true })
    const sink = createWriteStream(dest)
    await pipeline(res.body as unknown as NodeJS.ReadableStream, sink)
    return
  }
  throw new Error(`重定向次数过多: ${url}`)
}

async function fetchYtdlp(force: boolean): Promise<void> {
  const dest = join(BIN_DIR, 'yt-dlp.exe')
  if (existsSync(dest) && !force) {
    const size = statSync(dest).size
    logInfo(`yt-dlp.exe 已存在 (${humanSize(size)})，跳过。--force 可强制覆盖。`)
    return
  }

  logInfo('下载 yt-dlp.exe ...')
  const tmp = `${dest}.part`
  try {
    await downloadToFile(YTDLP_URL, tmp)
    // Windows 下 rename 覆盖需要目标不存在，所以先 unlink
    if (existsSync(dest)) unlinkSync(dest)
    await rename(tmp, dest)
    logInfo(`yt-dlp.exe 写入: ${dest} (${humanSize(statSync(dest).size)})`)
  } catch (err) {
    if (existsSync(tmp)) {
      try {
        unlinkSync(tmp)
      } catch {
        // ignore
      }
    }
    throw err
  }
}

async function fetchFfmpeg(force: boolean): Promise<void> {
  const dest = join(BIN_DIR, 'ffmpeg.exe')
  if (existsSync(dest) && !force) {
    const size = statSync(dest).size
    logInfo(`ffmpeg.exe 已存在 (${humanSize(size)})，跳过。--force 可强制覆盖。`)
    return
  }

  const zipPath = join(BIN_DIR, 'ffmpeg-release-essentials.zip')
  logInfo('下载 ffmpeg zip ...')
  await downloadToFile(FFMPEG_ZIP_URL, zipPath)
  logInfo(`zip 大小: ${humanSize(statSync(zipPath).size)}`)

  logInfo('解压 ffmpeg.exe ...')
  const zip = new AdmZip(zipPath)
  const entries = zip.getEntries()
  const ffmpegEntry = entries.find(
    (e) => !e.isDirectory && /(^|[\\/])bin[\\/]ffmpeg\.exe$/i.test(e.entryName)
  )
  if (!ffmpegEntry) {
    throw new Error('zip 中未找到 bin/ffmpeg.exe')
  }
  const data = ffmpegEntry.getData()
  await writeFile(dest, data)
  logInfo(`ffmpeg.exe 写入: ${dest} (${humanSize(statSync(dest).size)})`)

  try {
    unlinkSync(zipPath)
  } catch {
    // ignore
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const force = args.includes('--force') || args.includes('-f')
  const only = args.find((a) => ['yt-dlp', 'ffmpeg'].includes(a))

  mkdirSync(BIN_DIR, { recursive: true })

  const tasks: Array<{ name: Bin; run: () => Promise<void> }> = []
  if (!only || only === 'yt-dlp') tasks.push({ name: 'yt-dlp.exe', run: () => fetchYtdlp(force) })
  if (!only || only === 'ffmpeg') tasks.push({ name: 'ffmpeg.exe', run: () => fetchFfmpeg(force) })

  for (const t of tasks) {
    try {
      await t.run()
    } catch (err) {
      logWarn(`${t.name} 失败: ${String(err)}`)
      process.exitCode = 1
    }
  }

  if (process.exitCode && process.exitCode !== 0) {
    logWarn('有任务失败，请检查网络 / 代理后重试。')
  } else {
    logInfo('全部完成。')
  }
}

main().catch((err) => {
  logWarn(`未捕获错误: ${String(err)}`)
  process.exit(1)
})
