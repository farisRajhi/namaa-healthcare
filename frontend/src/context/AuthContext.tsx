import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { api } from '../lib/api'

interface User {
  userId: string
  email: string
  org: {
    id: string
    name: string
  } | null
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, orgName: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

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
      setUser(response.data)
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
