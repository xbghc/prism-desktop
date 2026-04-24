import { app, shell, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerIpcHandlers } from './ipc'
import { loadSettings } from './settings'
import { getPaths } from './paths'
import { createLogger } from './logger'
import { setupSingleInstance } from './platform/single-instance'
import { installWindowsPlatform, focusPrimaryWindow } from './platform'
import { createWorkspace, getWorkspace } from './workspace-store'
import { runWorkspacePipeline } from './pipeline'
import { setupAutoUpdater } from './updater'

const log = createLogger('main')

function handleDeepLink(url: URL): void {
  // 支持的深链：
  //   prism://new                            → 聚焦主窗口（新建工作区由用户在 UI 操作）
  //   prism://create?url=<encoded>           → 立刻建一个工作区并启动流水线
  //   prism://open?id=<workspaceId>          → 聚焦主窗口并广播 platform:open-workspace
  const win = focusPrimaryWindow()
  const host = (url.host || url.hostname || '').toLowerCase()
  const pathSegment = url.pathname.replace(/^\//, '').toLowerCase()
  const action = host || pathSegment

  if (action === 'create') {
    const raw = url.searchParams.get('url')
    if (raw) {
      try {
        const ws = createWorkspace(raw)
        void runWorkspacePipeline(ws.workspaceId)
        log.info('深链创建工作区', { workspaceId: ws.workspaceId, url: raw })
      } catch (err) {
        log.warn('深链创建工作区失败', { url: raw, err: String(err) })
      }
    } else {
      log.warn('prism://create 缺少 url 参数', { raw: url.toString() })
    }
  } else if (action === 'open') {
    const id = url.searchParams.get('id')
    if (id && getWorkspace(id)) {
      if (win && !win.isDestroyed()) {
        win.webContents.send('platform:open-workspace', id)
      }
    } else {
      log.warn('prism://open 工作区不存在', { id })
    }
  } else if (action === 'new') {
    if (win && !win.isDestroyed()) {
      win.webContents.send('platform:navigate-new')
    }
  } else {
    log.warn('未识别的深链 action', { action, url: url.toString() })
  }
}

function handlePastedUrl(rawUrl: string): void {
  try {
    const ws = createWorkspace(rawUrl)
    void runWorkspacePipeline(ws.workspaceId)
    focusPrimaryWindow()
    log.info('热键粘贴创建工作区', { workspaceId: ws.workspaceId, url: rawUrl })
  } catch (err) {
    log.warn('热键粘贴创建工作区失败', { url: rawUrl, err: String(err) })
  }
}

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(() => {
  if (!setupSingleInstance()) return

  electronApp.setAppUserModelId('com.prism.desktop')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  getPaths()
  loadSettings()
  registerIpcHandlers()

  log.info('Prism 启动', { paths: getPaths() })

  const mainWindow = createWindow()
  installWindowsPlatform(mainWindow, {
    onDeepLink: handleDeepLink,
    onPasteUrl: handlePastedUrl
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  setupAutoUpdater()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
