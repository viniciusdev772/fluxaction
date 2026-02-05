import { createContext, useState, useEffect, type ReactNode, useContext } from 'react'
import { n8nApi } from '../services/n8nApi'

interface AppContextType {
  isConfigured: boolean
  isLoading: boolean
  error: string | null
  setConfig: (serverUrl: string, apiKey: string) => Promise<void>
  clearConfig: () => Promise<void>
  testConnection: () => Promise<boolean>
}

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [isConfigured, setIsConfigured] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const status = await n8nApi.getConfig()
        setIsConfigured(status.configured)
      } catch {
        setIsConfigured(false)
      } finally {
        setIsLoading(false)
      }
    }

    loadConfig()
  }, [])

  const setConfig = async (serverUrl: string, apiKey: string) => {
    await n8nApi.setConfig(serverUrl, apiKey)
    setIsConfigured(true)
    setError(null)
  }

  const clearConfig = async () => {
    await n8nApi.clearConfig()
    setIsConfigured(false)
    setError(null)
  }

  const testConnection = async (): Promise<boolean> => {
    setIsLoading(true)
    setError(null)
    try {
      const success = await n8nApi.testConnection()
      if (!success) {
        setError('Falha ao conectar ao n8n. Verifique as configurações.')
      }
      return success
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ocorreu um erro desconhecido'
      setError(message)
      return false
    } finally {
      setIsLoading(false)
    }
  }

  const value: AppContextType = {
    isConfigured,
    isLoading,
    error,
    setConfig,
    clearConfig,
    testConnection,
  }

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppContextType {
  const context = useContext(AppContext)
  if (context === null) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}
