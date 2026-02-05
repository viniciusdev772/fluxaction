import { useState, type FormEvent } from 'react'
import { useApp } from '../contexts/AppContext'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card'
import { AlertCircle, Server, Key, Terminal, Settings2 } from 'lucide-react'

export function Settings() {
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

  if (isConfigured && !isExpanded) {
    return (
      <Card className="border-border/50 bg-card/50">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="h-2.5 w-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
            <span className="text-sm font-medium">Conectado ao n8n</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsExpanded(true)}
            className="h-8"
          >
            <Settings2 className="w-4 h-4 mr-2" />
            Configurações
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card className="w-full border-border/50 shadow-lg relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
      <CardHeader>
        <CardTitle className="text-xl">
          {isConfigured ? 'Atualizar configurações' : 'Bem-vindo ao Flux Action'}
        </CardTitle>
        <CardDescription>
          {isConfigured
            ? 'Gerencie suas credenciais de acesso ao n8n.'
            : 'Conecte-se à sua instância n8n self-hosted para começar.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
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

          <div className="space-y-2">
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

          <div className="flex flex-col gap-2 pt-2">
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
          <div className="mt-8 pt-6 border-t border-border/50">
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

        <div className="mt-6 p-4 bg-secondary/30 rounded-lg border border-border/50 text-sm">
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
}
