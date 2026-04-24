import { ipcMain } from 'electron'
import { registerWorkspaceHandlers } from './workspace'
import { registerSettingsHandlers } from './settings'
import { registerSystemHandlers } from './system'
import { registerContentHandlers } from './content'

export function registerIpcHandlers(): void {
  registerWorkspaceHandlers()
  registerSettingsHandlers()
  registerSystemHandlers()
  registerContentHandlers()
}

export function unregisterAllIpcHandlers(): void {
  ipcMain.removeAllListeners()
}
