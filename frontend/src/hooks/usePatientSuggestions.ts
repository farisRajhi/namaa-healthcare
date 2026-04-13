import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SuggestionCard {
  suggestionId: string
  orgId: string
  patientId: string
  serviceId: string
  score: number
  suggestionType: 'reminder' | 'offer'
  lastCompletedAt: string | null
  dueAt: string
  overdueDays: number
  messageAr: string | null
  messageEn: string | null
  status: string
  sentAt: string | null
  createdAt: string
  // Joined fields
  patientName: string
  phoneNumber: string | null
  serviceName: string
  serviceNameEn: string | null
  serviceCategory: string | null
}

export interface SuggestionStats {
  totalPending: number
  reminders: number
  offers: number
  sentToday: number
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePatientSuggestions(orgId: string) {
  const queryClient = useQueryClient()

  // Fetch suggestions
  const suggestionsQuery = useQuery({
    queryKey: ['suggestions', orgId],
    queryFn: async () => {
      const res = await api.get(`/api/suggestions/${orgId}?limit=100`)
      return res.data as { data: SuggestionCard[]; pagination: any }
    },
    enabled: !!orgId,
    staleTime: 30_000,
  })

  // Fetch stats
  const statsQuery = useQuery({
    queryKey: ['suggestions-stats', orgId],
    queryFn: async () => {
      const res = await api.get(`/api/suggestions/${orgId}/stats`)
      return res.data as SuggestionStats
    },
    enabled: !!orgId,
    staleTime: 30_000,
  })

  // Generate suggestions
  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/api/suggestions/${orgId}/generate`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions', orgId] })
      queryClient.invalidateQueries({ queryKey: ['suggestions-stats', orgId] })
    },
  })

  // Send a suggestion
  const sendMutation = useMutation({
    mutationFn: async (params: { suggestionId: string; messageAr?: string; messageEn?: string; channel?: string }) => {
      const res = await api.patch(`/api/suggestions/${params.suggestionId}/send`, {
        messageAr: params.messageAr,
        messageEn: params.messageEn,
        channel: params.channel || 'whatsapp',
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions', orgId] })
      queryClient.invalidateQueries({ queryKey: ['suggestions-stats', orgId] })
    },
  })

  // Dismiss a suggestion
  const dismissMutation = useMutation({
    mutationFn: async (suggestionId: string) => {
      const res = await api.patch(`/api/suggestions/${suggestionId}/dismiss`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions', orgId] })
      queryClient.invalidateQueries({ queryKey: ['suggestions-stats', orgId] })
    },
  })

  // Edit message
  const editMessageMutation = useMutation({
    mutationFn: async (params: { suggestionId: string; messageAr?: string; messageEn?: string }) => {
      const res = await api.patch(`/api/suggestions/${params.suggestionId}/message`, {
        messageAr: params.messageAr,
        messageEn: params.messageEn,
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions', orgId] })
    },
  })

  return {
    suggestions: suggestionsQuery.data?.data ?? [],
    pagination: suggestionsQuery.data?.pagination,
    stats: statsQuery.data ?? { totalPending: 0, reminders: 0, offers: 0, sentToday: 0 },
    isLoading: suggestionsQuery.isLoading || statsQuery.isLoading,
    generate: generateMutation.mutate,
    isGenerating: generateMutation.isPending,
    send: sendMutation.mutate,
    isSending: sendMutation.isPending,
    dismiss: dismissMutation.mutate,
    editMessage: editMessageMutation.mutate,
  }
}
