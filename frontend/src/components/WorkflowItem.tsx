import { useState } from 'react'
import sanitize from 'sanitize-filename'
import { n8nApi } from '../services/n8nApi'
import type { Workflow } from '../types/n8n'
import { Card } from './ui/card'
import { Switch } from './ui/switch'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Download, AlertCircle, Clock, Tag, Sparkles } from 'lucide-react'
import { cn } from '../lib/utils'
import { AiAgentEditor } from './AiAgentEditor'

interface WorkflowItemProps {
  workflow: Workflow
  onStatusChange: (id: string, active: boolean) => void
}

export function WorkflowItem({ workflow, onStatusChange }: WorkflowItemProps) {
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAiEditorOpen, setIsAiEditorOpen] = useState(false)

  const handleToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newState = e.target.checked
    setIsUpdating(true)
    setError(null)
    try {
      if (newState) {
        await n8nApi.activateWorkflow(workflow.id)
      } else {
        await n8nApi.deactivateWorkflow(workflow.id)
      }
      onStatusChange(workflow.id, newState)
    } catch (err) {
      const message = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Falha ao atualizar status'

      let finalMessage = message

      // Translation/Normalization
      if (message.includes('does not contain any node which triggers the workflow')) {
        finalMessage = 'Este fluxo não possui um gatilho (Trigger) e não pode ser ativado.'
      } else if (message.includes('Workflow cannot be activated')) {
        finalMessage = 'O fluxo não pode ser ativado. Verifique se há gatilhos configurados.'
      }

      setError(finalMessage)
      // Revert state change in UI would be complicated without controlled component
      // But typically we rely on optimistic update or error message
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(workflow, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    // Sanitize filename to prevent directory traversal and malicious names
    const sanitizedName = sanitize(workflow.name) || 'workflow'
    a.download = `${sanitizedName}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const getStatusBadge = () => {
    if (workflow.active) {
      return <Badge variant="success" className="animate-pulse">Ativo</Badge>
    }
    return <Badge variant="neutral">Inativo</Badge>
  }

  return (
    <Card className="transition-all duration-200 hover:border-primary/50 hover:shadow-md group">
      <div className="flex flex-col md:flex-row md:items-center justify-between p-4 gap-4">

        {/* Header Section: Name + ID + Tags */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center justify-between md:justify-start gap-3">
            <h3 className="font-semibold truncate text-lg">{workflow.name}</h3>
            {getStatusBadge()}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <code className="bg-secondary/50 px-1.5 py-0.5 rounded text-[10px] font-mono border border-border/50">
              ID: {workflow.id}
            </code>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(workflow.updatedAt).toLocaleDateString()}
            </span>

            {workflow.tags && workflow.tags.length > 0 && (
              <>
                <span>•</span>
                <div className="flex items-center gap-1">
                  <Tag className="w-3 h-3" />
                  {workflow.tags.map(tag => (
                    <span key={typeof tag === 'object' ? tag.id : tag} className="bg-orange-500/10 text-orange-400 px-1 rounded">
                      {typeof tag === 'object' ? tag.name : tag}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Actions Section */}
        <div className="flex items-center gap-4 justify-end shrink-0">
          <div className="flex items-center gap-2">
            <span className={cn("text-xs font-medium transition-colors", workflow.active ? "text-green-500" : "text-muted-foreground")}>
              {workflow.active ? "ON" : "OFF"}
            </span>
            <Switch
              checked={workflow.active}
              onChange={handleToggle}
              disabled={isUpdating}
            />
          </div>

          <div className="h-6 w-px bg-border/50 mx-1 hidden md:block" />

          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="h-9 px-3 border-border/60 hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
          >
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAiEditorOpen(prev => !prev)}
            className="h-9 px-3 border-border/60 hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {isAiEditorOpen ? 'Fechar AI Agent' : 'AI Agent'}
          </Button>
        </div>
      </div>

      {/* Error Footer */}
      {error && (
        <div className="px-4 pb-4 animate-in slide-in-from-top-2">
          <div className="bg-destructive/60 border border-destructive/80 text-white text-sm px-3 py-2 rounded-md flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        </div>
      )}

      {isAiEditorOpen && (
        <AiAgentEditor
          workflowId={workflow.id}
          onClose={() => setIsAiEditorOpen(false)}
        />
      )}
    </Card>
  )
}
