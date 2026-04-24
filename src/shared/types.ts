export type WorkspaceStatus =
  | 'pending'
  | 'downloading'
  | 'transcribing'
  | 'ready'
  | 'failed'

export type ResourceType = 'video' | 'audio' | 'text'

export type ContentType =
  | 'transcript'
  | 'outline'
  | 'article'
  | 'podcast_script'
  | 'podcast_audio'

export interface WorkspaceResource {
  resourceId: string
  name: string
  resourceType: ResourceType
  storageKey?: string
  content?: string
  createdAt: string
}

export interface Workspace {
  workspaceId: string
  url: string
  title: string
  status: WorkspaceStatus
  progress: string
  error?: string
  resources: WorkspaceResource[]
  createdAt: string
  updatedAt: string
  duration?: number
}

export interface WorkspaceProgressEvent {
  workspaceId: string
  status: WorkspaceStatus
  progress: string
  error?: string
  resources?: WorkspaceResource[]
  title?: string
  duration?: number
}

export interface ContentStreamEvent {
  workspaceId: string
  contentType: ContentType
  delta?: string
  done?: boolean
  error?: string
}

export interface Settings {
  anthropicApiKey: string
  anthropicBaseUrl: string
  anthropicModel: string
  whisperApiKey: string
  whisperBaseUrl: string
  whisperModel: string
  dashscopeApiKey: string
  dashscopeSttModel: string
  xiazaitoolToken: string
  xiazaitoolApiUrl: string
  proxyUrl: string
  maxVideoDuration: number
  dataDir: string
  tempDir: string
}

export const DEFAULT_SETTINGS: Settings = {
  anthropicApiKey: '',
  anthropicBaseUrl: '',
  anthropicModel: 'claude-sonnet-4-6',
  whisperApiKey: '',
  whisperBaseUrl: '',
  whisperModel: '',
  dashscopeApiKey: '',
  dashscopeSttModel: 'paraformer-realtime-v2',
  xiazaitoolToken: '',
  xiazaitoolApiUrl: 'https://api.xiazaitool.com/api/parseVideoUrl',
  proxyUrl: '',
  maxVideoDuration: 7200,
  dataDir: '',
  tempDir: ''
}

export interface AppPaths {
  userData: string
  data: string
  temp: string
  bin: string
  logs: string
}

export interface SerializedError {
  name: string
  message: string
  code?: string
  detail?: string
}
