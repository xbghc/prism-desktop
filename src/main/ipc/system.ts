import { ipcMain, shell } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { getPaths } from '../paths'

export function registerSystemHandlers(): void {
  ipcMain.handle(IPC.SYSTEM_OPEN_FOLDER, async (_evt, path: string) => {
    await shell.openPath(path)
  })

  ipcMain.handle(IPC.SYSTEM_OPEN_URL, async (_evt, url: string) => {
    await shell.openExternal(url)
  })

  ipcMain.handle(IPC.SYSTEM_SHOW_ITEM, (_evt, path: string) => {
    shell.showItemInFolder(path)
  })

  ipcMain.handle(IPC.SYSTEM_GET_PATHS, () => {
    const p = getPaths()
    return { data: p.data, temp: p.temp }
  })
}
