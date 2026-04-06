import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useEffect, useRef, useState } from 'react'

interface PatientFilter {
  minAge?: number
  maxAge?: number
  sex?: string
  conditions?: string[]
  lastVisitDaysAgo?: number
  noAppointmentDays?: number
  previousServiceIds?: string[]
  excludeWithUpcoming?: boolean
  patientIds?: string[]
  tags?: string[]
  serviceInterests?: string[]
  minEngagementScore?: number
  maxEngagementScore?: number
  minReturnLikelihood?: number
  maxReturnLikelihood?: number
  channelPreference?: string
}

interface AudiencePreview {
  totalMatching: number
  withConsent: number
  breakdown: {
    byEngagement: { bucket: string; min: number; max: number; count: number }[]
    bySex: { sex: string; count: number }[]
  }
}

export function useAudiencePreview(
  orgId: string | undefined,
  filter: PatientFilter,
  channel: 'whatsapp' | 'sms' = 'whatsapp',
  debounceMs = 500,
) {
  const [debouncedFilter, setDebouncedFilter] = useState(filter)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setDebouncedFilter(filter)
    }, debounceMs)
    return () => clearTimeout(timerRef.current)
  }, [JSON.stringify(filter), debounceMs])

  const hasFilter = Object.keys(debouncedFilter).some(
    (k) => debouncedFilter[k as keyof PatientFilter] !== undefined,
  )

  return useQuery<AudiencePreview>({
    queryKey: ['audience-preview', orgId, debouncedFilter, channel],
    queryFn: async () => {
      const { data } = await api.post(`/api/audience/${orgId}/preview`, {
        targetFilter: debouncedFilter,
        channel,
      })
      return data
    },
    enabled: !!orgId && hasFilter,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
}

export type { PatientFilter, AudiencePreview }
