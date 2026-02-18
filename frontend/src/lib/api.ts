import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor — attach auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      // Only redirect if not already on auth pages
      if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

/**
 * Extract a user-friendly error message from an Axios error
 */
export function getErrorMessage(error: unknown, fallbackAr = 'حدث خطأ غير متوقع', fallbackEn = 'An unexpected error occurred'): { ar: string; en: string } {
  if (axios.isAxiosError(error)) {
    const msg = error.response?.data?.error || error.response?.data?.message
    if (msg) return { ar: msg, en: msg }
    if (error.code === 'ERR_NETWORK') return { ar: 'تعذر الاتصال بالخادم', en: 'Unable to connect to server' }
  }
  return { ar: fallbackAr, en: fallbackEn }
}
