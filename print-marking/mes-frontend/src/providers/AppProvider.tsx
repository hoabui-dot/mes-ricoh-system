import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { authService } from '@/services/identity.service'
import { tokenStorage } from '@/services/api-client'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: (failureCount, error) => {
        // Don't retry auth errors
        if ((error as { status?: number }).status === 401) return false
        if ((error as { status?: number }).status === 403) return false
        return failureCount < 2
      },
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: false,
    },
  },
})

interface AppProviderProps {
  children: React.ReactNode
}

function SessionWatcher() {
  const logout = useAuthStore((s) => s.logout)

  React.useEffect(() => {
    const handler = () => logout()
    window.addEventListener('mes:session-expired', handler)
    return () => window.removeEventListener('mes:session-expired', handler)
  }, [logout])

  return null
}

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, setUser, setLoading, logout } = useAuthStore()
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    async function init() {
      const token = tokenStorage.getAccessToken()
      if (!token || !isAuthenticated) {
        setReady(true)
        return
      }
      setLoading(true)
      try {
        const res = await authService.me()
        if (res.success && res.data) {
          setUser(res.data)
        } else {
          logout()
        }
      } catch {
        logout()
      } finally {
        setLoading(false)
        setReady(true)
      }
    }
    void init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--color-bg-base)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 40, height: 40,
            border: '3px solid rgba(249,115,22,0.2)',
            borderTopColor: '#F97316',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Initializing MES Platform...</span>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export function AppProvider({ children }: AppProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionWatcher />
      <AuthInitializer>{children}</AuthInitializer>
    </QueryClientProvider>
  )
}

export { queryClient }
