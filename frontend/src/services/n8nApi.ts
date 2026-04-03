import type {
  Workflow,
  WorkflowListResponse,
  WorkflowListRequest,
  WorkflowUpdateRequest,
  WorkflowDefinitionUpdateRequest,
  AiAgentSystemMessageUpdate,
  ApiError,
  AppConfigStatus
} from '../types/n8n'

class N8nApiService {
  private csrfToken: string | null = null

  private async getCsrfToken(): Promise<string | null> {
    if (this.csrfToken) {
      return this.csrfToken
    }

    try {
      const response = await fetch('/api/csrf-token', {
        credentials: 'include',
      })
      
      if (response.ok) {
        const data = await response.json()
        this.csrfToken = data.csrfToken
        return this.csrfToken
      }
    } catch (error) {
      console.warn('Failed to get CSRF token:', error)
    }
    
    return null
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const error: ApiError = {
        message: `HTTP Error: ${response.status} ${response.statusText}`,
        httpStatusCode: response.status,
      }

      try {
        const errorData = await response.json()
        error.message = errorData.message || error.message
        error.code = errorData.code
      } catch {
        // Use default error message if JSON parsing fails
      }

      throw error
    }

    if (response.status === 204) {
      return {} as T
    }

    return response.json() as Promise<T>
  }

  private async postHeaders(): Promise<HeadersInit> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }

    const csrfToken = await this.getCsrfToken()
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken
    }

    return headers
  }

  async getConfig(): Promise<AppConfigStatus> {
    const response = await fetch('/api/v1/config', {
      credentials: 'include',
    })
    return this.handleResponse<AppConfigStatus>(response)
  }

  async setConfig(serverUrl: string, apiKey: string): Promise<void> {
    const response = await fetch('/api/v1/config', {
      method: 'POST',
      headers: await this.postHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        serverUrl,
        apiKey,
      }),
    })

    await this.handleResponse(response)
  }

  async clearConfig(): Promise<void> {
    const response = await fetch('/api/v1/config', {
      method: 'DELETE',
      headers: await this.postHeaders(),
      credentials: 'include',
    })

    if (response.status !== 204) {
      await this.handleResponse(response)
    }
  }

  async getWorkflows(request?: WorkflowListRequest): Promise<WorkflowListResponse> {
    const response = await fetch('/api/v1/workflows', {
      method: 'POST',
      headers: await this.postHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        limit: request?.limit,
        offset: request?.offset,
        search: request?.search,
        filter: request?.filter,
      }),
    })

    return this.handleResponse<WorkflowListResponse>(response)
  }

  async getWorkflow(id: string): Promise<Workflow> {
    const response = await fetch(`/api/v1/workflows/${id}`, {
      credentials: 'include',
    })
    return this.handleResponse<Workflow>(response)
  }

  async updateWorkflow(id: string, updates: WorkflowUpdateRequest): Promise<Workflow> {
    // Note: O backend unificou ativação/desativação em endpoints específicos
    if (typeof updates.active === 'boolean') {
      return updates.active ? this.activateWorkflow(id) : this.deactivateWorkflow(id)
    }

    throw new Error('Update not supported on unified v1 API')
  }

  async updateWorkflowDefinition(id: string, updates: WorkflowDefinitionUpdateRequest): Promise<Workflow> {
    const response = await fetch(`/api/v1/workflows/${id}`, {
      method: 'PUT',
      headers: await this.postHeaders(),
      credentials: 'include',
      body: JSON.stringify(updates),
    })

    return this.handleResponse<Workflow>(response)
  }

  async updateAiAgentSystemMessages(id: string, updates: AiAgentSystemMessageUpdate[]): Promise<Workflow> {
    const response = await fetch(`/api/v1/workflows/${id}/ai-system-message`, {
      method: 'PATCH',
      headers: await this.postHeaders(),
      credentials: 'include',
      body: JSON.stringify({ updates }),
    })

    return this.handleResponse<Workflow>(response)
  }

  async activateWorkflow(id: string): Promise<Workflow> {
    const response = await fetch(`/api/v1/workflows/${id}/activate`, {
      method: 'POST',
      headers: await this.postHeaders(),
      credentials: 'include',
    })

    return this.handleResponse<Workflow>(response)
  }

  async deactivateWorkflow(id: string): Promise<Workflow> {
    const response = await fetch(`/api/v1/workflows/${id}/deactivate`, {
      method: 'POST',
      headers: await this.postHeaders(),
      credentials: 'include',
    })

    return this.handleResponse<Workflow>(response)
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.getWorkflows({ limit: 1 })
      return true
    } catch {
      return false
    }
  }
}

export const n8nApi = new N8nApiService()
