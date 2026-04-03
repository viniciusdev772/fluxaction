import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bot, RefreshCw, Save, Sparkles, X } from 'lucide-react'
import { n8nApi } from '../services/n8nApi'
import type { Workflow, WorkflowNode } from '../types/n8n'
import { Button } from './ui/button'
import { Card } from './ui/card'

interface AiAgentEditorProps {
  workflowId: string
  onClose: () => void
}

interface AiAgentDraft {
  key: string
  name: string
  type: string
  modelLabel: string
  systemMessage: string
  originalSystemMessage: string
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const isAiAgentNode = (node: WorkflowNode): boolean => {
  const type = node.type.toLowerCase()
  return type.includes('langchain.agent') || type.includes('toolaiagent') || type.includes('aiagent')
}

const getNodeOptions = (node: WorkflowNode): Record<string, unknown> => (
  isRecord(node.parameters.options) ? node.parameters.options : {}
)

const isChatModelNode = (node: WorkflowNode): boolean => {
  const type = node.type.toLowerCase()
  return type.includes('lmchat') || type.includes('chatmodel') || type.includes('.model')
}

const getConnectedNodeNames = (workflow: Workflow, nodeName: string): string[] => {
  if (!isRecord(workflow.connections)) {
    return []
  }

  const connected = new Set<string>()

  for (const [sourceName, sourceValue] of Object.entries(workflow.connections)) {
    if (!isRecord(sourceValue)) continue

    for (const [connectionType, branches] of Object.entries(sourceValue)) {
      const normalizedType = connectionType.toLowerCase()
      if (
        !normalizedType.includes('model')
        && !normalizedType.includes('ai')
        && !normalizedType.includes('language')
      ) {
        continue
      }

      if (!Array.isArray(branches)) continue

      for (const branch of branches) {
        if (!Array.isArray(branch)) continue

        for (const entry of branch) {
          if (!isRecord(entry) || typeof entry.node !== 'string') continue

          if (sourceName === nodeName) {
            connected.add(entry.node)
          }

          if (entry.node === nodeName) {
            connected.add(sourceName)
          }
        }
      }
    }
  }

  return [...connected]
}

const getModelLabel = (workflow: Workflow, node: WorkflowNode): string => {
  const connectedNames = getConnectedNodeNames(workflow, node.name)
  const connectedModelNode = (workflow.nodes || []).find(candidate => (
    connectedNames.includes(candidate.name) && isChatModelNode(candidate)
  ))

  if (!connectedModelNode) {
    return 'Modelo nao detectado'
  }

  const directModel = connectedModelNode.parameters.model
  if (typeof directModel === 'string' && directModel.trim()) {
    return `${connectedModelNode.name} (${directModel})`
  }

  if (isRecord(directModel)) {
    const candidateValues = [
      directModel.value,
      directModel.model,
      directModel.name,
    ]
    const selectedValue = candidateValues.find(value => typeof value === 'string' && value.trim())
    if (typeof selectedValue === 'string') {
      return `${connectedModelNode.name} (${selectedValue})`
    }
  }

  const options = getNodeOptions(connectedModelNode)
  const optionModel = options.model
  if (typeof optionModel === 'string' && optionModel.trim()) {
    return `${connectedModelNode.name} (${optionModel})`
  }

  if (isRecord(optionModel)) {
    const optionValues = [
      optionModel.value,
      optionModel.model,
      optionModel.name,
    ]
    const selectedOptionValue = optionValues.find(value => typeof value === 'string' && value.trim())
    if (typeof selectedOptionValue === 'string') {
      return `${connectedModelNode.name} (${selectedOptionValue})`
    }
  }

  return connectedModelNode.name
}

const createDraft = (workflow: Workflow, node: WorkflowNode): AiAgentDraft => {
  const options = getNodeOptions(node)

  return {
    key: node.id || node.name,
    name: node.name,
    type: node.type,
    modelLabel: getModelLabel(workflow, node),
    systemMessage: typeof options.systemMessage === 'string' ? options.systemMessage : '',
    originalSystemMessage: typeof options.systemMessage === 'string' ? options.systemMessage : '',
  }
}

export function AiAgentEditor({ workflowId, onClose }: AiAgentEditorProps) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [drafts, setDrafts] = useState<AiAgentDraft[]>([])
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [isMounted, setIsMounted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const loadWorkflow = async () => {
    setIsLoading(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const result = await n8nApi.getWorkflow(workflowId)
      const nextDrafts = (result.nodes || []).filter(isAiAgentNode).map(node => createDraft(result, node))
      setWorkflow(result)
      setDrafts(nextDrafts)
      setSelectedKeys(nextDrafts.map(draft => draft.key))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao carregar o workflow'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadWorkflow()
  }, [workflowId])

  const aiAgentCount = useMemo(() => drafts.length, [drafts])
  const visibleDrafts = useMemo(
    () => drafts.filter(draft => selectedKeys.includes(draft.key)),
    [drafts, selectedKeys]
  )

  useEffect(() => {
    setIsMounted(true)
    return () => setIsMounted(false)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const updateDraft = (key: string, field: keyof AiAgentDraft, value: string | boolean) => {
    setDrafts(prev => prev.map(draft => (
      draft.key === key ? { ...draft, [field]: value } : draft
    )))
  }

  const toggleDraftVisibility = (key: string) => {
    setSelectedKeys(prev => {
      if (prev.includes(key)) {
        return prev.length === 1 ? prev : prev.filter(item => item !== key)
      }
      return [...prev, key]
    })
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const changedVisibleDrafts = visibleDrafts.filter(draft => draft.systemMessage !== draft.originalSystemMessage)

      if (changedVisibleDrafts.length === 0) {
        setSuccessMessage('Nenhuma alteracao pendente para salvar')
        return
      }

      const updatedWorkflow = await n8nApi.updateAiAgentSystemMessages(
        workflowId,
        changedVisibleDrafts.map(draft => ({
          nodeKey: draft.key,
          systemMessage: draft.systemMessage,
        }))
      )

      const nextDrafts = (updatedWorkflow.nodes || []).filter(isAiAgentNode).map(node => createDraft(updatedWorkflow, node))
      setWorkflow(updatedWorkflow)
      setDrafts(nextDrafts)
      setSelectedKeys(prev => {
        const allowedKeys = new Set(nextDrafts.map(draft => draft.key))
        const filtered = prev.filter(key => allowedKeys.has(key))
        return filtered.length > 0 ? filtered : nextDrafts.map(draft => draft.key)
      })
      setSuccessMessage('Prompt do AI Agent atualizado no n8n')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao salvar alterações'
      setError(message)
    } finally {
      setIsSaving(false)
    }
  }

  if (!isMounted) {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      <Card className="relative z-[101] flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border-border/60 bg-background shadow-2xl sm:h-[85vh] sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border/50 px-4 py-4 sm:px-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h4 className="text-base font-semibold">AI Agent System Message</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              Edite o system message dos nós de AI Agent detectados neste workflow.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void loadWorkflow()} disabled={isLoading || isSaving}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Recarregar
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar editor">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {error && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="mt-4 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">
              {successMessage}
            </div>
          )}

          {isLoading ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Carregando definição do workflow...
            </div>
          ) : aiAgentCount === 0 ? (
            <div className="mt-4 rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              Nenhum nó de AI Agent foi detectado neste workflow.
            </div>
          ) : (
            <div className="space-y-4">
              {aiAgentCount > 1 && (
                <div className="rounded-lg border border-border/50 bg-card/50 p-4">
                  <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h5 className="text-sm font-medium">Filtrar AI Agents</h5>
                      <p className="text-xs text-muted-foreground">
                        Escolha quais agentes deseja exibir no modal.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedKeys(drafts.map(draft => draft.key))}
                      >
                        Todos
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedKeys(drafts.slice(0, 1).map(draft => draft.key))}
                      >
                        Somente 1
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {drafts.map(draft => {
                      const isSelected = selectedKeys.includes(draft.key)
                      return (
                        <button
                          key={draft.key}
                          type="button"
                          onClick={() => toggleDraftVisibility(draft.key)}
                          className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                            isSelected
                              ? 'border-primary/40 bg-primary/10 text-primary'
                              : 'border-border bg-background text-muted-foreground'
                          }`}
                        >
                          {draft.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {visibleDrafts.map(draft => (
                <div key={draft.key} className="rounded-lg border border-border/50 bg-background/40 p-4">
                  <div className="mb-4 flex items-start gap-3">
                    <div className="rounded-full bg-primary/10 p-2 text-primary">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div>
                      <h5 className="font-medium">{draft.name}</h5>
                      <p className="text-xs text-muted-foreground">{draft.type}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Modelo: <span className="text-foreground">{draft.modelLabel}</span>
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">System Message</label>
                    <textarea
                      value={draft.systemMessage}
                      onChange={event => updateDraft(draft.key, 'systemMessage', event.target.value)}
                      rows={8}
                      className="min-h-[220px] w-full rounded-md border border-input bg-background px-3 py-3 text-sm leading-6 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder="Mensagem de sistema para controlar o comportamento do agente"
                    />
                  </div>
                </div>
              ))}

              {visibleDrafts.length === 0 && (
                <div className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                  Nenhum AI Agent está selecionado no filtro.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-border/50 px-4 py-4 sm:px-6">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {aiAgentCount > 1
                ? `${visibleDrafts.length} de ${aiAgentCount} AI Agents visíveis`
                : aiAgentCount === 1
                  ? '1 AI Agent detectado'
                  : 'Nenhum AI Agent detectado'}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Fechar
              </Button>
              <Button onClick={() => void handleSave()} disabled={isSaving || aiAgentCount === 0}>
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? 'Salvando...' : 'Salvar no n8n'}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>,
    document.body
  )
}
