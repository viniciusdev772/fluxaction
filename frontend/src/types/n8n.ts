export interface Workflow {
  id: string
  name: string
  active: boolean
  createdAt: string
  updatedAt: string
  tags?: Tag[]
  nodes?: unknown[]
  connections?: unknown
  settings?: WorkflowSettings
}

export interface Tag {
  id: string
  name: string
}

export interface WorkflowSettings {
  timezone?: string
  saveDataErrorExecution?: string
  saveDataSuccessExecution?: string
  saveExecutionProgress?: boolean
  saveManualExecutions?: boolean
}

export interface WorkflowListResponse {
  data: Workflow[]
  total: number
  limit: number
  offset: number
}

export interface WorkflowListRequest {
  limit?: number
  offset?: number
  search?: string
  filter?: 'all' | 'active' | 'inactive'
}

export interface WorkflowUpdateRequest {
  active?: boolean
  name?: string
  tags?: string[]
}

export interface ApiError {
  message: string
  code?: string
  httpStatusCode?: number
}

export interface AppConfigStatus {
  configured: boolean
}
