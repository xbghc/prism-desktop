import { BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type { ContentStreamEvent, WorkspaceProgressEvent } from '../shared/types'

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}

export function emitWorkspaceProgress(evt: WorkspaceProgressEvent): void {
  broadcast(IPC.WORKSPACE_PROGRESS, evt)
}

export function emitContentStream(evt: ContentStreamEvent): void {
  broadcast(IPC.CONTENT_STREAM, evt)
}
