/**
 * 系统托盘（Windows 通知区域）：
 *
 * - 左键单击/双击：还原并聚焦主窗口
 * - 右键：弹出菜单（显示/隐藏、打开数据目录、设置、退出）
 * - 托盘图标一定要随 BrowserWindow 的生命周期管理，否则应用退出后图标会残留到鼠标划过
 *   通知区才消失。
 */
import { app, BrowserWindow, Menu, nativeImage, shell, Tray } from 'electron'
import trayIconAsset from '../../../resources/tray-icon.png?asset'
import { getPaths } from '../paths'
import { createLogger } from '../logger'

const log = createLogger('platform/tray')

function loadTrayIcon(): Electron.NativeImage {
  // `?asset` 由 electron-vite 在构建期把资源复制到 out/，并在这里替换为绝对路径。
  // 开发时指向项目根 resources/，打包时指向 asar 外的 resources/（electron-builder
  // 的 asarUnpack 规则保证了这一点）。
  const img = nativeImage.createFromPath(trayIconAsset)
  if (img.isEmpty()) {
    log.warn('托盘图标加载为空', { path: trayIconAsset })
  }
  return img
}

export function createTray(mainWindow: BrowserWindow): Tray {
  const tray = new Tray(loadTrayIcon())
  tray.setToolTip('Prism')

  const toggleWindow = (): void => {
    if (mainWindow.isDestroyed()) return
    if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
      mainWindow.hide()
    } else {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  }

  const showWindow = (): void => {
    if (mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }

  const openDataDir = (): void => {
    const p = getPaths().data
    void shell.openPath(p).then((err) => {
      if (err) log.warn('打开数据目录失败', { path: p, err })
    })
  }

  const openSettings = (): void => {
    showWindow()
    // 不能改 preload / ipc-channels，所以这里用一个非契约通道广播给渲染端。
    // 渲染端目前没监听也无妨，留作将来接入；至少先确保窗口聚焦让用户手动点设置。
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('platform:navigate-settings')
    }
  }

  const rebuildMenu = (): void => {
    const isVisible =
      !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized()
    const menu = Menu.buildFromTemplate([
      {
        label: isVisible ? '隐藏窗口' : '显示窗口',
        click: toggleWindow
      },
      { type: 'separator' },
      {
        label: '打开数据目录',
        click: openDataDir
      },
      {
        label: '设置',
        click: openSettings
      },
      { type: 'separator' },
      {
        label: '退出 Prism',
        click: () => {
          // 直接 app.quit()。window-all-closed 不会在托盘模式下退出（一般我们会
          // 在那里阻止退出让托盘继续工作），所以需要手动 quit。
          app.quit()
        }
      }
    ])
    tray.setContextMenu(menu)
  }

  rebuildMenu()

  // 可见性变了菜单标签也要跟着变
  mainWindow.on('show', rebuildMenu)
  mainWindow.on('hide', rebuildMenu)
  mainWindow.on('minimize', rebuildMenu)
  mainWindow.on('restore', rebuildMenu)

  tray.on('click', showWindow)
  tray.on('double-click', showWindow)

  app.on('before-quit', () => {
    if (!tray.isDestroyed()) {
      tray.destroy()
    }
  })

  log.info('托盘已创建')
  return tray
}
