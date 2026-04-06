import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api } from '../lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RankedPatient {
  patientId: string
  patientName: string
  priorityScore: number      // 0-100, computed
  returnLikelihood: number   // 0-100
  riskScore: number          // 0-100
  careGapId?: string
  ruleName?: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  source: 'care_gap' | 'segment' | 'both'
}

interface CareGapQueueItem {
  careGapId: string
  patientId: string
  patientName: string
  riskScore: number
  ruleName: string
  priority: string
  action: string
}

interface SegmentPatient {
  patientId: string
  firstName: string
  lastName: string
  score: number
  engagementScore: number
  returnLikelihood: number
}

interface Segment {
  key: string
  count: number
  avgScore: number
  topPatients: SegmentPatient[]
}

export interface EngagementStats {
  toContact: number
  sentToday: number
  activeOffers: number
  reminderConfirmRate: number
}

// ---------------------------------------------------------------------------
// Priority helpers
// ---------------------------------------------------------------------------

function computePriority(score: number): RankedPatient['priority'] {
  if (score >= 80) return 'critical'
  if (score >= 60) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePatientEngagementQueue(orgId: string) {
  // 1. Care gap outreach queue
  const careGapQuery = useQuery<{ data: CareGapQueueItem[] }>({
    queryKey: ['care-gap-queue', orgId],
    queryFn: async () => {
      const res = await api.get(`/api/care-gaps/queue/${orgId}?limit=100`)
      return res.data
    },
    enabled: !!orgId,
    staleTime: 60_000,
  })

  // 2. Audience segments (for return likelihood data)
  const segmentsQuery = useQuery<{ segments: Segment[] }>({
    queryKey: ['audience-segments', orgId],
    queryFn: async () => {
      const res = await api.get(`/api/audience/${orgId}/segments`)
      return res.data
    },
    enabled: !!orgId,
    staleTime: 60_000,
  })

  // 3. SMS logs for "sent today" stat
  const smsQuery = useQuery({
    queryKey: ['sms-stats-engagement', orgId],
    queryFn: async () => {
      const res = await api.get(`/api/sms-logs/${orgId}?limit=1`)
      return res.data
    },
    enabled: !!orgId,
    staleTime: 30_000,
  })

  // 4. Active offers count
  const offersQuery = useQuery({
    queryKey: ['offers-engagement', orgId],
    queryFn: async () => {
      const res = await api.get(`/api/offers/${orgId}`)
      const list = res.data?.data || res.data || []
      return Array.isArray(list) ? list : []
    },
    enabled: !!orgId,
    staleTime: 60_000,
  })

  // 5. Reminder stats
  const reminderQuery = useQuery({
    queryKey: ['reminders-engagement', orgId],
    queryFn: async () => {
      const res = await api.get(`/api/reminders/stats/${orgId}`)
      return res.data
    },
    enabled: !!orgId,
    staleTime: 60_000,
  })

  // Merge care gaps + segments into a ranked list
  const patients = useMemo<RankedPatient[]>(() => {
    const queue = careGapQuery.data?.data || []
    const segments = segmentsQuery.data?.segments || []

    // Build a lookup of patientId → returnLikelihood from segment topPatients
    const likelihoodMap = new Map<string, number>()
    for (const seg of segments) {
      for (const p of seg.topPatients || []) {
        const existing = likelihoodMap.get(p.patientId)
        if (existing === undefined || p.returnLikelihood > existing) {
          likelihoodMap.set(p.patientId, p.returnLikelihood)
        }
      }
    }

    // Track which patients are already in the queue
    const seenIds = new Set<string>()
    const merged: RankedPatient[] = []

    // Primary: care gap queue patients
    for (const item of queue) {
      seenIds.add(item.patientId)
      const rl = likelihoodMap.get(item.patientId) ?? 50
      const score = Math.round(0.5 * rl + 0.5 * item.riskScore)
      merged.push({
        patientId: item.patientId,
        patientName: item.patientName,
        priorityScore: score,
        returnLikelihood: rl,
        riskScore: item.riskScore,
        careGapId: item.careGapId,
        ruleName: item.ruleName,
        priority: computePriority(score),
        source: likelihoodMap.has(item.patientId) ? 'both' : 'care_gap',
      })
    }

    // Secondary: high-return-likelihood patients not in care gap queue
    for (const seg of segments) {
      for (const p of seg.topPatients || []) {
        if (seenIds.has(p.patientId)) continue
        if (p.returnLikelihood < 60) continue // only add warm+ leads
        seenIds.add(p.patientId)
        const score = Math.round(0.5 * p.returnLikelihood + 0.5 * 50)
        merged.push({
          patientId: p.patientId,
          patientName: `${p.firstName} ${p.lastName}`,
          priorityScore: score,
          returnLikelihood: p.returnLikelihood,
          riskScore: 0,
          priority: computePriority(score),
          source: 'segment',
        })
      }
    }

    // Sort descending by priority score
    merged.sort((a, b) => b.priorityScore - a.priorityScore)
    return merged
  }, [careGapQuery.data, segmentsQuery.data])

  // Compute stats
  const stats = useMemo<EngagementStats>(() => {
    const offers = offersQuery.data || []
    const activeOffers = Array.isArray(offers) ? offers.filter((o: any) => o.status === 'active').length : 0

    const rStats = reminderQuery.data || {}
    const sent = rStats.sent || 0
    const confirmed = rStats.confirmed || 0
    const rate = sent > 0 ? Math.round((confirmed / sent) * 100) : 0

    const smsTotal = smsQuery.data?.total || smsQuery.data?.data?.length || 0

    return {
      toContact: patients.length,
      sentToday: smsTotal,
      activeOffers,
      reminderConfirmRate: rate,
    }
  }, [patients, offersQuery.data, reminderQuery.data, smsQuery.data])

  return {
    patients,
    stats,
    isLoading: careGapQuery.isLoading || segmentsQuery.isLoading,
  }
}
