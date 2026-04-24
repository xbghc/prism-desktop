import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC } from '../shared/ipc-channels'
import type {
  ContentStreamEvent,
  ContentType,
  Settings,
  Workspace,
  WorkspaceProgressEvent
} from '../shared/types'

type UnsubscribeFn = () => void

function subscribe<T>(channel: string, cb: (evt: T) => void): UnsubscribeFn {
  const listener = (_: unknown, evt: T): void => cb(evt)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.off(channel, listener)
  }
}

const api = {
  workspace: {
    create: (url: string) => ipcRenderer.invoke(IPC.WORKSPACE_CREATE, url) as Promise<Workspace>,
    get: (id: string) =>
      ipcRenderer.invoke(IPC.WORKSPACE_GET, id) as Promise<Workspace | null>,
    list: () => ipcRenderer.invoke(IPC.WORKSPACE_LIST) as Promise<Workspace[]>,
    delete: (id: string) => ipcRenderer.invoke(IPC.WORKSPACE_DELETE, id) as Promise<void>,
    onProgress: (cb: (evt: WorkspaceProgressEvent) => void): UnsubscribeFn =>
      subscribe<WorkspaceProgressEvent>(IPC.WORKSPACE_PROGRESS, cb)
  },
  content: {
    generate: (workspaceId: string, contentType: ContentType) =>
      ipcRenderer.invoke(IPC.CONTENT_GENERATE, { workspaceId, contentType }) as Promise<void>,
    cancel: (workspaceId: string, contentType: ContentType) =>
      ipcRenderer.invoke(IPC.CONTENT_CANCEL, { workspaceId, contentType }) as Promise<void>,
    onStream: (cb: (evt: ContentStreamEvent) => void): UnsubscribeFn =>
      subscribe<ContentStreamEvent>(IPC.CONTENT_STREAM, cb)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.SETTINGS_GET) as Promise<Settings>,
    update: (patch: Partial<Settings>) =>
      ipcRenderer.invoke(IPC.SETTINGS_UPDATE, patch) as Promise<Settings>
  },
  system: {
    openFolder: (path: string) =>
      ipcRenderer.invoke(IPC.SYSTEM_OPEN_FOLDER, path) as Promise<void>,
    openUrl: (url: string) => ipcRenderer.invoke(IPC.SYSTEM_OPEN_URL, url) as Promise<void>,
    showItemInFolder: (path: string) =>
      ipcRenderer.invoke(IPC.SYSTEM_SHOW_ITEM, path) as Promise<void>,
    getPaths: () =>
      ipcRenderer.invoke(IPC.SYSTEM_GET_PATHS) as Promise<{ data: string; temp: string }>
  }
}

export type PrismApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('prism', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.prism = api
}
