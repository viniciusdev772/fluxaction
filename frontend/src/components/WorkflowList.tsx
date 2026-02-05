import { useState, useEffect, useCallback } from 'react'
import { useApp } from '../contexts/AppContext'
import { n8nApi } from '../services/n8nApi'
import type { Workflow } from '../types/n8n'
import { WorkflowItem } from './WorkflowItem'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { Search, X, RefreshCw, ChevronLeft, ChevronRight, Filter } from 'lucide-react'
import { Badge } from './ui/badge'

const PAGE_SIZES = [5, 10, 20, 50, 100] as const

export function WorkflowList() {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [pageSize, setPageSize] = useState<number>(5)
  const [pageIndex, setPageIndex] = useState(0)
  const [totalWorkflows, setTotalWorkflows] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const { isConfigured } = useApp()

  const translateError = (message: string) => {
    const normalized = message.trim()
    if (!normalized) return 'Falha ao carregar fluxos'
    if (normalized === 'Failed to fetch workflows') return 'Falha ao carregar fluxos'
    if (normalized === 'Failed to reach n8n server') return 'Falha ao alcançar o servidor n8n'
    if (normalized === 'serverUrl and apiKey are required') return 'URL do servidor e chave de API são obrigatórias'
    return normalized.replace(/workflow/gi, 'fluxo')
  }

  const loadPage = useCallback(async (index: number, search: string, statusFilter: typeof filter) => {
    setIsLoading(true)
    setError(null)
    try {
      const offset = index * pageSize
      const response = await n8nApi.getWorkflows({
        limit: pageSize,
        offset,
        search,
        filter: statusFilter
      })
      setWorkflows(response.data)
      setTotalWorkflows(response.total)
      setPageIndex(index)
    } catch (err) {
      const message = err && typeof err === 'object' && 'message' in err
        ? `${(err as { message?: unknown }).message ?? ''}`
        : 'Falha ao carregar fluxos'
      setError(translateError(message || 'Falha ao carregar fluxos'))
    } finally {
      setIsLoading(false)
    }
  }, [pageSize])

  useEffect(() => {
    if (!isConfigured) return
    const timer = setTimeout(() => {
      loadPage(0, searchTerm, filter)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchTerm, filter, pageSize, isConfigured, loadPage])

  const handleStatusChange = useCallback((id: string, active: boolean) => {
    setWorkflows((prev: Workflow[]) =>
      prev.map((wf: Workflow) =>
        wf.id === id ? { ...wf, active } : wf
      )
    )
  }, [])

  const handleNextPage = () => {
    if (isLoading || (pageIndex + 1) * pageSize >= totalWorkflows) return
    loadPage(pageIndex + 1, searchTerm, filter)
  }

  const handlePrevPage = () => {
    if (pageIndex === 0 || isLoading) return
    loadPage(pageIndex - 1, searchTerm, filter)
  }

  const handleRefresh = () => {
    loadPage(pageIndex, searchTerm, filter)
  }

  const handlePageSizeChange = (value: number) => {
    setPageSize(value)
    setPageIndex(0)
  }

  const totalPages = Math.ceil(totalWorkflows / pageSize)

  const filterLabels = {
    all: 'Todos',
    active: 'Ativos',
    inactive: 'Inativos',
  }

  const FilterButton = ({ value, label }: { value: typeof filter, label: string }) => (
    <Button
      variant={filter === value ? "default" : "outline"}
      size="sm"
      onClick={() => setFilter(value)}
      className="h-8"
    >
      {label}
    </Button>
  )

  if (isLoading && workflows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-muted-foreground">Carregando fluxos...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 md:max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Pesquisar por nome..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchTerm && (
            <button
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              onClick={() => setSearchTerm('')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="secondary" className="px-2 py-1 font-normal">
            Total: <strong className="ml-1 text-foreground">{totalWorkflows}</strong>
          </Badge>
          <span className="hidden sm:inline">•</span>
          <span className="hidden sm:inline">Mostrando {workflows.length}</span>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-card/50 p-3 rounded-lg border border-border/50">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <div className="flex bg-background/50 p-1 rounded-md border border-border/50 gap-1">
            <FilterButton value="all" label="Todos" />
            <FilterButton value="active" label="Ativos" />
            <FilterButton value="inactive" label="Inativos" />
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="pageSize" className="text-muted-foreground whitespace-nowrap">Por página</label>
          <select
            id="pageSize"
            value={pageSize}
            onChange={event => handlePageSizeChange(Number(event.target.value))}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {PAGE_SIZES.map(size => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/15 p-4 text-destructive border border-destructive/20 flex items-center justify-between">
          <p>{error}</p>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="border-destructive/30 hover:bg-destructive/20 text-destructive">
            <RefreshCw className="mr-2 h-3 w-3" />
            Tentar novamente
          </Button>
        </div>
      )}

      <div className="grid gap-4">
        {workflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center animate-in fade-in zoom-in-95 duration-500">
            <div className="rounded-full bg-secondary/50 p-4 mb-4">
              <RefreshCw className="h-8 w-8 text-muted-foreground" />
            </div>
            {searchTerm ? (
              <p className="text-muted-foreground">Nenhum fluxo encontrado para "{searchTerm}"</p>
            ) : filter === 'all' ? (
              <>
                <p className="text-lg font-medium">Nenhum fluxo disponível</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Aguarde a sincronização ou verifique sua conexão com o n8n
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">Nenhum fluxo {filterLabels[filter].toLowerCase()}</p>
            )}
          </div>
        ) : (
          workflows.map(workflow => (
            <WorkflowItem
              key={workflow.id}
              workflow={workflow}
              onStatusChange={handleStatusChange}
            />
          ))
        )}
      </div>

      <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between border-t border-border pt-4">
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevPage}
            disabled={isLoading || pageIndex === 0}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground min-w-[100px] text-center">
            Página <span className="text-foreground font-medium">{pageIndex + 1}</span> de <span className="text-foreground font-medium">{totalPages || 1}</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={isLoading || (pageIndex + 1) * pageSize >= totalWorkflows}
          >
            Próxima
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center justify-center gap-2">
          {isLoading && workflows.length > 0 && (
            <span className="text-xs text-muted-foreground animate-pulse flex items-center">
              <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
              Sincronizando...
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`mr-2 h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>
    </div>
  )
}
