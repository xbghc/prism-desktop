import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import {
  createWorkspace,
  deleteWorkspace,
  getWorkspace,
  listWorkspaces
} from '../workspace-store'
import { runWorkspacePipeline } from '../pipeline'
import { createLogger } from '../logger'
import { serializeError } from '../../shared/errors'

const log = createLogger('ipc:workspace')

export function registerWorkspaceHandlers(): void {
  ipcMain.handle(IPC.WORKSPACE_CREATE, async (_evt, url: string) => {
    try {
      const workspace = createWorkspace(url)
      // 异步启动流水线，不阻塞返回
      void runWorkspacePipeline(workspace.workspaceId).catch((err) => {
        log.error('流水线异常', { workspaceId: workspace.workspaceId, err: String(err) })
      })
      return workspace
    } catch (err) {
      log.error('创建工作区失败', { err: String(err) })
      throw serializeError(err)
    }
  })

  ipcMain.handle(IPC.WORKSPACE_GET, (_evt, workspaceId: string) => {
    return getWorkspace(workspaceId)
  })

  ipcMain.handle(IPC.WORKSPACE_LIST, () => {
    return listWorkspaces()
  })

  ipcMain.handle(IPC.WORKSPACE_DELETE, (_evt, workspaceId: string) => {
    deleteWorkspace(workspaceId)
  })
}
