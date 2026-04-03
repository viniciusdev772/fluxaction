import { useEffect, useMemo, useState, type HTMLAttributes, type AnchorHTMLAttributes, type LiHTMLAttributes, type OlHTMLAttributes, type TableHTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { Bot, RefreshCw, Save, Sparkles, X } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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

interface StatusDialogState {
  tone: 'success' | 'error' | 'info'
  message: string
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

const markdownComponents = {
  a: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      {...props}
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-primary underline underline-offset-4"
    >
      {children}
    </a>
  ),
  p: ({ children, ...props }: HTMLAttributes<HTMLParagraphElement>) => (
    <p {...props} className="leading-6 [&:not(:last-child)]:mb-3">
      {children}
    </p>
  ),
  ul: ({ children, ...props }: HTMLAttributes<HTMLUListElement>) => (
    <ul {...props} className="mb-3 list-disc space-y-1 pl-5">
      {children}
    </ul>
  ),
  ol: ({ children, ...props }: OlHTMLAttributes<HTMLOListElement>) => (
    <ol {...props} className="mb-3 list-decimal space-y-1 pl-5">
      {children}
    </ol>
  ),
  li: ({ children, ...props }: LiHTMLAttributes<HTMLLIElement>) => (
    <li {...props} className="leading-6">
      {children}
    </li>
  ),
  code: ({ children, className, ...props }: HTMLAttributes<HTMLElement>) => (
    <code
      {...props}
      className={`rounded bg-secondary/70 px-1.5 py-0.5 font-mono text-[0.9em] ${className || ''}`}
    >
      {children}
    </code>
  ),
  pre: ({ children, ...props }: HTMLAttributes<HTMLPreElement>) => (
    <pre
      {...props}
      className="mb-3 overflow-x-auto rounded-xl border border-border/60 bg-background p-3 text-sm"
    >
      {children}
    </pre>
  ),
  blockquote: ({ children, ...props }: HTMLAttributes<HTMLElement>) => (
    <blockquote
      {...props}
      className="mb-3 border-l-2 border-primary/40 pl-4 italic text-muted-foreground"
    >
      {children}
    </blockquote>
  ),
  h1: ({ children, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
    <h1 {...props} className="mb-3 text-xl font-semibold tracking-tight">
      {children}
    </h1>
  ),
  h2: ({ children, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
    <h2 {...props} className="mb-3 text-lg font-semibold tracking-tight">
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
    <h3 {...props} className="mb-2 text-base font-semibold tracking-tight">
      {children}
    </h3>
  ),
  table: ({ children, ...props }: TableHTMLAttributes<HTMLTableElement>) => (
    <div className="mb-3 overflow-x-auto">
      <table {...props} className="w-full border-collapse text-sm">
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) => (
    <th {...props} className="border border-border/60 bg-secondary/40 px-2 py-2 text-left font-medium">
      {children}
    </th>
  ),
  td: ({ children, ...props }: TdHTMLAttributes<HTMLTableCellElement>) => (
    <td {...props} className="border border-border/60 px-2 py-2 align-top">
      {children}
    </td>
  ),
}

export function AiAgentEditor({ workflowId, onClose }: AiAgentEditorProps) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [drafts, setDrafts] = useState<AiAgentDraft[]>([])
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [isMounted, setIsMounted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusDialog, setStatusDialog] = useState<StatusDialogState | null>(null)

  const loadWorkflow = async () => {
    setIsLoading(true)
    setError(null)
    setStatusDialog(null)

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
    setStatusDialog(null)

    try {
      const changedVisibleDrafts = visibleDrafts.filter(draft => draft.systemMessage !== draft.originalSystemMessage)

      if (changedVisibleDrafts.length === 0) {
        setStatusDialog({
          tone: 'info',
          message: 'Nenhuma alteracao pendente para salvar',
        })
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
      setStatusDialog({
        tone: 'success',
        message: 'System message atualizado no n8n',
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao salvar alterações'
      setError(message)
      setStatusDialog({
        tone: 'error',
        message,
      })
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

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">System Message</label>
                        <span className="text-xs text-muted-foreground">Markdown suportado</span>
                      </div>
                      <textarea
                        value={draft.systemMessage}
                        onChange={event => updateDraft(draft.key, 'systemMessage', event.target.value)}
                        rows={10}
                        className="min-h-[240px] w-full rounded-md border border-input bg-background px-3 py-3 text-sm leading-6 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        placeholder="Mensagem de sistema para controlar o comportamento do agente"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Preview</label>
                        <span className="text-xs text-muted-foreground">Renderizacao segura</span>
                      </div>
                      <div className="min-h-[240px] rounded-md border border-border/60 bg-card/50 px-4 py-3 text-sm">
                        {draft.systemMessage.trim() ? (
                          <div className="max-w-none text-sm text-foreground">
                            <Markdown
                              remarkPlugins={[remarkGfm]}
                              components={markdownComponents}
                            >
                              {draft.systemMessage}
                            </Markdown>
                          </div>
                        ) : (
                          <p className="text-muted-foreground">
                            A previa Markdown do system message aparece aqui.
                          </p>
                        )}
                      </div>
                    </div>
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

      {statusDialog && (
        <div className="absolute inset-0 z-[102] flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-md rounded-2xl border border-border/60 bg-background p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h5 className="text-base font-semibold">
                  {statusDialog.tone === 'success'
                    ? 'Salvo'
                    : statusDialog.tone === 'error'
                      ? 'Erro'
                      : 'Aviso'}
                </h5>
                <p className="mt-2 text-sm text-muted-foreground">{statusDialog.message}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setStatusDialog(null)}
                aria-label="Fechar aviso"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4 flex justify-end">
              <Button onClick={() => setStatusDialog(null)}>
                Entendi
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}
