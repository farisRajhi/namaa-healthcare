import axios from 'axios'

const PLATFORM_TOKEN_KEY = 'platform_token'

export const platformApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: { 'Content-Type': 'application/json' },
})

platformApi.interceptors.request.use((config) => {
  const token = localStorage.getItem(PLATFORM_TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

platformApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(PLATFORM_TOKEN_KEY)
      if (!window.location.pathname.startsWith('/platform/login')) {
        window.location.href = '/platform/login'
      }
    }
    return Promise.reject(error)
  },
)

export function getPlatformToken(): string | null {
  return localStorage.getItem(PLATFORM_TOKEN_KEY)
}

export function setPlatformToken(token: string): void {
  localStorage.setItem(PLATFORM_TOKEN_KEY, token)
}

export function clearPlatformToken(): void {
  localStorage.removeItem(PLATFORM_TOKEN_KEY)
}
