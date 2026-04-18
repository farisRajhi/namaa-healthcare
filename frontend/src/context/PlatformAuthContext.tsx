import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import { platformApi, clearPlatformToken, getPlatformToken, setPlatformToken } from '../lib/platformApi'

interface PlatformAdmin {
  platformAdminId: string
  email: string
  name: string | null
  lastLogin: string | null
  createdAt: string
}

interface PlatformAuthContextType {
  admin: PlatformAdmin | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const PlatformAuthContext = createContext<PlatformAuthContextType | undefined>(undefined)

export function PlatformAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<PlatformAdmin | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchMe = useCallback(async () => {
    try {
      const token = getPlatformToken()
      if (!token) {
        setIsLoading(false)
        return
      }
      const { data } = await platformApi.get('/api/platform/auth/me')
      setAdmin(data)
    } catch {
      clearPlatformToken()
      setAdmin(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMe()
  }, [fetchMe])

  const login = async (email: string, password: string) => {
    const { data } = await platformApi.post('/api/platform/auth/login', { email, password })
    setPlatformToken(data.token)
    await fetchMe()
  }

  const logout = async () => {
    try {
      await platformApi.post('/api/platform/auth/logout')
    } catch {
      // ignore
    }
    clearPlatformToken()
    setAdmin(null)
  }

  return (
    <PlatformAuthContext.Provider
      value={{
        admin,
        isAuthenticated: !!admin,
        isLoading,
        login,
        logout,
        refresh: fetchMe,
      }}
    >
      {children}
    </PlatformAuthContext.Provider>
  )
}

export function usePlatformAuth() {
  const ctx = useContext(PlatformAuthContext)
  if (!ctx) throw new Error('usePlatformAuth must be used within PlatformAuthProvider')
  return ctx
}
