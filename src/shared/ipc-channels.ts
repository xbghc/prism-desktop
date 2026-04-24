export const IPC = {
  WORKSPACE_CREATE: 'workspace:create',
  WORKSPACE_GET: 'workspace:get',
  WORKSPACE_LIST: 'workspace:list',
  WORKSPACE_DELETE: 'workspace:delete',
  WORKSPACE_PROGRESS: 'workspace:progress',

  CONTENT_GENERATE: 'content:generate',
  CONTENT_CANCEL: 'content:cancel',
  CONTENT_STREAM: 'content:stream',

  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',

  SYSTEM_OPEN_FOLDER: 'system:openFolder',
  SYSTEM_OPEN_URL: 'system:openUrl',
  SYSTEM_SHOW_ITEM: 'system:showItemInFolder',
  SYSTEM_GET_PATHS: 'system:getPaths'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
