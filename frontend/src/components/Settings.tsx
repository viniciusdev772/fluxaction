import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../contexts/AppContext'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card'
import { cn } from '../lib/utils'
import { AlertCircle, Server, Key, Terminal, Settings2, X } from 'lucide-react'

interface SettingsProps {
  compact?: boolean
}

export function Settings({ compact = false }: SettingsProps) {
  const { setConfig, clearConfig, isConfigured, testConnection, error: contextError } = useApp()
  const [serverUrl, setServerUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [isExpanded, setIsExpanded] = useState(!isConfigured)
  const [isTesting, setIsTesting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLocalError(null)

    if (!serverUrl.trim() || !apiKey.trim()) {
      setLocalError('Informe a URL do servidor e a chave de API')
      return
    }

    let normalizedUrl = serverUrl.trim()
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = `https://${normalizedUrl}`
    }

    setIsTesting(true)

    try {
      await setConfig(normalizedUrl, apiKey.trim())
      const success = await testConnection()
      if (success) {
        setIsExpanded(false)
      } else {
        await clearConfig()
      }
    } finally {
      setIsTesting(false)
    }
  }

  const handleClear = async () => {
    await clearConfig()
    setServerUrl('')
    setApiKey('')
    setIsExpanded(true)
    setLocalError(null)
  }

  const error = localError || contextError

  useEffect(() => {
    if (!compact || !isExpanded) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsExpanded(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [compact, isExpanded])

  const settingsCard = (
    <Card className="relative w-full overflow-hidden border-border/50 shadow-lg">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
      <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3">
        <CardTitle className="text-lg sm:text-xl">
          {isConfigured ? 'Atualizar configurações' : 'Bem-vindo ao Flux Action'}
        </CardTitle>
        <CardDescription>
          {isConfigured
            ? 'Gerencie suas credenciais de acesso ao n8n.'
            : 'Conecte-se à sua instância n8n self-hosted para começar.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="serverUrl" className="text-sm font-medium flex items-center gap-2">
              <Server className="w-4 h-4 text-primary" />
              URL do servidor n8n
            </label>
            <Input
              id="serverUrl"
              type="url"
              value={serverUrl}
              onChange={e => setServerUrl(e.target.value)}
              placeholder="https://n8n.seudominio.com"
              required
              className="bg-background/50"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="apiKey" className="text-sm font-medium flex items-center gap-2">
              <Key className="w-4 h-4 text-primary" />
              Chave de API
            </label>
            <Input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="n8n_api_..."
              required
              className="bg-background/50"
            />
            <p className="text-xs text-muted-foreground">
              Encontrada em Configurações do n8n → API
            </p>
          </div>

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md flex items-center gap-2 border border-destructive/20">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2 pt-1">
            <Button type="submit" disabled={isTesting} className="w-full">
              {isTesting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                  Testando conexão...
                </>
              ) : (
                isConfigured ? 'Atualizar conexão' : 'Conectar'
              )}
            </Button>

            {isConfigured && (
              <Button type="button" variant="ghost" onClick={() => setIsExpanded(false)}>
                Cancelar
              </Button>
            )}
          </div>
        </form>

        {isConfigured && (
          <div className="mt-5 border-t border-border/50 pt-4">
            <h4 className="text-sm font-medium text-destructive mb-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Zona de perigo
            </h4>
            <Button
              type="button"
              variant="destructive"
              onClick={handleClear}
              className="w-full bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20"
            >
              Desconectar e limpar dados
            </Button>
          </div>
        )}

        <div className="mt-5 rounded-lg border border-border/50 bg-secondary/30 p-3 text-sm">
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-primary" />
            Como obter sua chave
          </h4>
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground ml-1">
            <li>Abra seu n8n.</li>
            <li>Vá em <strong>Configurações</strong> &gt; <strong>API</strong>.</li>
            <li>Crie uma nova chave e copie.</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  )

  if (isConfigured && !isExpanded) {
    return (
      <Card className={cn('border-border/50 bg-card/50', compact && 'border-none bg-transparent shadow-none')}>
        <div className={cn('flex items-center justify-between p-4', compact && 'gap-3 p-0')}>
          <div className="flex items-center gap-3">
            <div className="h-2.5 w-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
            <span className={cn('text-sm font-medium', compact && 'hidden md:inline')}>Conectado ao n8n</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsExpanded(true)}
            className={cn('h-8', compact && 'bg-background/80 px-2 sm:px-3')}
          >
            <Settings2 className={cn('w-4 h-4', compact ? 'mr-0 sm:mr-2' : 'mr-2')} />
            <span className={cn(compact && 'hidden sm:inline')}>Configurações</span>
          </Button>
        </div>
      </Card>
    )
  }

  if (compact) {
    return createPortal(
      <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6">
        <div className="absolute inset-0" onClick={() => setIsExpanded(false)} aria-hidden="true" />
        <div className="relative z-[96] flex max-h-[88vh] w-full max-w-xl flex-col p-0">
          <div className="absolute right-3 top-3 z-[97] sm:right-4 sm:top-4">
            <Button variant="ghost" size="icon" onClick={() => setIsExpanded(false)} aria-label="Fechar configurações">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="overflow-y-auto px-0 pb-0">
            {settingsCard}
          </div>
        </div>
      </div>,
      document.body
    )
  }

  return settingsCard
}
