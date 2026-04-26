import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecallSource = 'native' | 'external'
export type RecallStatus = 'contacted' | 'booked' | 'not_interested' | 'unreachable'

export interface SuggestionReliability {
  totalVisits: number
  completionRate: number | null
  noShowCount: number
}

export interface SuggestionCard {
  source: RecallSource
  id: string
  // Native-only fields
  suggestionId?: string
  patientId?: string
  serviceId?: string
  suggestionType?: 'reminder' | 'offer'
  messageAr?: string | null
  messageEn?: string | null
  sentAt?: string | null
  sentBy?: string | null
  // External-only fields
  externalPatientId?: string
  // Shared
  patientName: string
  phoneNumber: string | null
  serviceName: string | null
  serviceNameEn: string | null
  serviceCategory: string | null
  lastCompletedAt: string | null
  dueAt: string
  overdueDays: number
  score: number
  status: string
  reliability: SuggestionReliability
}

export interface SuggestionStats {
  totalPending: number
  nativePending: number
  externalPending: number
  reminders: number
  offers: number
  sentToday: number
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePatientSuggestions(orgId: string) {
  const queryClient = useQueryClient()

  const suggestionsQuery = useQuery({
    queryKey: ['suggestions', orgId],
    queryFn: async () => {
      const res = await api.get(`/api/suggestions/${orgId}?limit=100`)
      return res.data as { data: SuggestionCard[]; pagination: any }
    },
    enabled: !!orgId,
    staleTime: 30_000,
  })

  const statsQuery = useQuery({
    queryKey: ['suggestions-stats', orgId],
    queryFn: async () => {
      const res = await api.get(`/api/suggestions/${orgId}/stats`)
      return res.data as SuggestionStats
    },
    enabled: !!orgId,
    staleTime: 30_000,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['suggestions', orgId] })
    queryClient.invalidateQueries({ queryKey: ['suggestions-stats', orgId] })
  }

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/api/suggestions/${orgId}/generate`)
      return res.data
    },
    onSuccess: invalidate,
  })

  const sendMutation = useMutation({
    mutationFn: async (params: { suggestionId: string; messageAr?: string; messageEn?: string; channel?: string }) => {
      const res = await api.patch(`/api/suggestions/${params.suggestionId}/send`, {
        messageAr: params.messageAr,
        messageEn: params.messageEn,
        channel: params.channel || 'whatsapp',
      })
      return res.data
    },
    onSuccess: invalidate,
  })

  const dismissMutation = useMutation({
    mutationFn: async (suggestionId: string) => {
      const res = await api.patch(`/api/suggestions/${suggestionId}/dismiss`)
      return res.data
    },
    onSuccess: invalidate,
  })

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

  const updateStatusMutation = useMutation({
    mutationFn: async (params: { id: string; source: RecallSource; status: RecallStatus }) => {
      const path = params.source === 'external'
        ? `/api/suggestions/external/${params.id}/status`
        : `/api/suggestions/${params.id}/status`
      const res = await api.patch(path, { status: params.status })
      return res.data
    },
    onSuccess: invalidate,
  })

  return {
    suggestions: suggestionsQuery.data?.data ?? [],
    pagination: suggestionsQuery.data?.pagination,
    stats: statsQuery.data ?? {
      totalPending: 0,
      nativePending: 0,
      externalPending: 0,
      reminders: 0,
      offers: 0,
      sentToday: 0,
    },
    isLoading: suggestionsQuery.isLoading || statsQuery.isLoading,
    generate: generateMutation.mutate,
    isGenerating: generateMutation.isPending,
    send: sendMutation.mutate,
    isSending: sendMutation.isPending,
    dismiss: dismissMutation.mutate,
    editMessage: editMessageMutation.mutate,
    updateStatus: updateStatusMutation.mutate,
    isUpdatingStatus: updateStatusMutation.isPending,
  }
}
