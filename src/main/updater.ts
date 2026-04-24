import { autoUpdater } from 'electron-updater'
import { createLogger } from './logger'

const log = createLogger('updater')

export function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('update-available', (info) => log.info('发现更新', info))
  autoUpdater.on('update-downloaded', (info) => log.info('更新已下载', info))
  autoUpdater.on('error', (err) => log.error('更新失败', { err: String(err) }))
  void autoUpdater
    .checkForUpdatesAndNotify()
    .catch((err) => log.warn('检查更新异常', { err: String(err) }))
  setInterval(
    () =>
      void autoUpdater
        .checkForUpdatesAndNotify()
        .catch((err) => log.warn('定时检查失败', { err: String(err) })),
    6 * 3600 * 1000
  )
}
