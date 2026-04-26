import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { api } from '../lib/api'
import type { PlanId } from '../config/plans'

export interface UserSubscription {
  plan: PlanId | null
  status: 'active' | 'past_due' | 'cancelled' | 'expired' | null
  endDate: string | null
  trialEndsAt: string | null
  isActive: boolean
  isTrialing: boolean
  hasPaidActive: boolean
  daysRemaining: number | null
}

interface User {
  userId: string
  email: string
  org: {
    id: string
    name: string
  } | null
  subscription: UserSubscription
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, orgName: string) => Promise<void>
  logout: () => void
  /** Re-fetch /me to refresh subscription state (e.g. after a successful payment). */
  refreshSubscription: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const EMPTY_SUB: UserSubscription = {
  plan: null,
  status: null,
  endDate: null,
  trialEndsAt: null,
  isActive: false,
  isTrialing: false,
  hasPaidActive: false,
  daysRemaining: null,
}

function normalizeUser(raw: any): User {
  return {
    userId: raw.userId,
    email: raw.email,
    org: raw.org ?? null,
    subscription: raw.subscription
      ? {
          plan: raw.subscription.plan ?? null,
          status: raw.subscription.status ?? null,
          endDate: raw.subscription.endDate ?? null,
          trialEndsAt: raw.subscription.trialEndsAt ?? null,
          isActive: !!raw.subscription.isActive,
          isTrialing: !!raw.subscription.isTrialing,
          hasPaidActive: !!raw.subscription.hasPaidActive,
          daysRemaining: raw.subscription.daysRemaining ?? null,
        }
      : EMPTY_SUB,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token && typeof token === 'string' && token.split('.').length === 3) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      fetchUser()
    } else {
      if (token) localStorage.removeItem('token')
      setIsLoading(false)
    }
  }, [])

  const fetchUser = async () => {
    try {
      const response = await api.get('/api/auth/me')
      setUser(normalizeUser(response.data))
    } catch {
      localStorage.removeItem('token')
      delete api.defaults.headers.common['Authorization']
    } finally {
      setIsLoading(false)
    }
  }

  const isValidJwt = (token: string): boolean => {
    if (!token || typeof token !== 'string') return false
    const parts = token.split('.')
    return parts.length === 3
  }

  const login = async (email: string, password: string) => {
    const response = await api.post('/api/auth/login', { email, password })
    const { token } = response.data
    if (!isValidJwt(token)) {
      throw new Error('Invalid token received from server')
    }
    localStorage.setItem('token', token)
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    await fetchUser()
  }

  const register = async (email: string, password: string, orgName: string) => {
    const response = await api.post('/api/auth/register', { email, password, orgName })
    const { token } = response.data
    if (!isValidJwt(token)) {
      throw new Error('Invalid token received from server')
    }
    localStorage.setItem('token', token)
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    await fetchUser()
  }

  const logout = () => {
    localStorage.removeItem('token')
    delete api.defaults.headers.common['Authorization']
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
        refreshSubscription: fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
