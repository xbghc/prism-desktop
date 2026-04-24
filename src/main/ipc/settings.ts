import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { getSettings, updateSettings } from '../settings'
import { serializeError } from '../../shared/errors'
import type { Settings } from '../../shared/types'

export function registerSettingsHandlers(): void {
  ipcMain.handle(IPC.SETTINGS_GET, () => getSettings())

  ipcMain.handle(IPC.SETTINGS_UPDATE, (_evt, patch: Partial<Settings>) => {
    try {
      return updateSettings(patch)
    } catch (err) {
      throw serializeError(err)
    }
  })
}
