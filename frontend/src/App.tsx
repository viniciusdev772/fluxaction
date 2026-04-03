import { useApp } from './contexts/AppContext'
import { WorkflowList } from './components/WorkflowList'
import { Settings } from './components/Settings'

function App() {
  const { isConfigured, isLoading } = useApp()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased selection:bg-primary/20">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="Flux Action Logo" className="h-6 w-6" />
            <span className="text-base font-bold tracking-tight sm:text-lg">Flux Action</span>
          </div>
          {isConfigured ? (
            <div className="max-w-[56vw] sm:max-w-none">
              <Settings compact />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground hidden sm:block">Gerenciador de Fluxos n8n</p>
          )}
        </div>
      </header>

      <main className="container max-w-screen-xl mx-auto py-6 px-4 md:px-8 md:py-10">
        {isConfigured ? <WorkflowList /> : <div className="max-w-md mx-auto mt-10"><Settings /></div>}
      </main>
    </div>
  )
}

export default App
