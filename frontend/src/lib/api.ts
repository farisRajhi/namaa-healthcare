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

/**
 * Shape of the 402 payload emitted by subscriptionGuard / planGuard on the backend.
 * When we see one of these, we dispatch a global event that the app shell listens
 * for and uses to show an upgrade overlay on top of whatever page the user is on.
 */
export interface SubscriptionRequiredPayload {
  error: string
  message: string
  code: 'SUBSCRIPTION_REQUIRED' | 'PLAN_UPGRADE_REQUIRED'
  requiredPlan?: 'starter' | 'professional' | 'enterprise'
  currentPlan?: string
  upgradeUrl?: string
}

export const SUBSCRIPTION_REQUIRED_EVENT = 'tawafud:subscription-required'

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    if (status === 401) {
      // Platform-admin surface has its own auth and redirect behavior — skip staff-auth cleanup.
      if (window.location.pathname.startsWith('/platform')) {
        return Promise.reject(error)
      }
      localStorage.removeItem('token')
      // Only redirect if not already on auth pages
      if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register')) {
        window.location.href = '/login'
      }
    } else if (status === 402) {
      // Subscription or plan upgrade required. Broadcast so the app shell can
      // mount an <UpgradeOverlay> regardless of which page triggered the call.
      const payload = error.response?.data as SubscriptionRequiredPayload | undefined
      if (payload?.code === 'SUBSCRIPTION_REQUIRED' || payload?.code === 'PLAN_UPGRADE_REQUIRED') {
        try {
          window.dispatchEvent(new CustomEvent(SUBSCRIPTION_REQUIRED_EVENT, { detail: payload }))
        } catch {
          /* SSR / test env — ignore */
        }
      }
    }
    return Promise.reject(error)
  },
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
