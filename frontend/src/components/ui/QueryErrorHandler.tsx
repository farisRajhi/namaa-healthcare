import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from './Toast'
import axios from 'axios'

/**
 * Global React Query error handler — shows toast on mutation failures
 * that don't have their own onError handler.
 * Must be rendered inside both QueryClientProvider and ToastProvider.
 */
export default function QueryErrorHandler() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  useEffect(() => {
    const defaults = queryClient.getDefaultOptions()
    queryClient.setDefaultOptions({
      ...defaults,
      mutations: {
        ...defaults.mutations,
        onError: (error) => {
          // Only fire for mutations that don't have their own onError
          // (mutations with onError will have already handled it)
          let message = 'An unexpected error occurred'
          if (axios.isAxiosError(error)) {
            message = error.response?.data?.error || error.response?.data?.message || error.message
            if (error.code === 'ERR_NETWORK') {
              message = 'تعذر الاتصال بالخادم / Unable to connect to server'
            }
          }
          addToast({
            type: 'error',
            title: message,
          })
        },
      },
    })
  }, [queryClient, addToast])

  return null
}
