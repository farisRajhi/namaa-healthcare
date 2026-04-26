import { useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { canAccessFeature, TRIAL_PLAN, type PlanFeature } from '../config/planFeatures'
import type { PlanId } from '../config/plans'

interface SubscriptionHelpers {
  plan: PlanId | null
  /** Effective plan used for gating — trial maps to TRIAL_PLAN. */
  effectivePlan: PlanId | null
  status: 'active' | 'past_due' | 'cancelled' | 'expired' | null
  isActive: boolean
  isTrialing: boolean
  isExpired: boolean
  hasPaidActive: boolean
  daysRemaining: number | null
  endDate: string | null
  trialEndsAt: string | null
  /** Returns true if the user can use this feature under their current plan (or trial). */
  canAccess: (feature: PlanFeature) => boolean
}

/**
 * Read-only helpers for subscription/plan state. Pulls from AuthContext so the
 * data is already loaded after login — no extra round-trip.
 */
export function useSubscription(): SubscriptionHelpers {
  const { user } = useAuth()

  return useMemo<SubscriptionHelpers>(() => {
    const s = user?.subscription
    const plan = s?.plan ?? null
    const isTrialing = !!s?.isTrialing
    const hasPaidActive = !!s?.hasPaidActive
    const effectivePlan: PlanId | null = hasPaidActive
      ? plan
      : isTrialing
      ? TRIAL_PLAN
      : null

    return {
      plan,
      effectivePlan,
      status: s?.status ?? null,
      isActive: !!s?.isActive,
      isTrialing,
      hasPaidActive,
      isExpired: !s?.isActive && !!plan,
      daysRemaining: s?.daysRemaining ?? null,
      endDate: s?.endDate ?? null,
      trialEndsAt: s?.trialEndsAt ?? null,
      canAccess: (feature) => canAccessFeature(effectivePlan, feature),
    }
  }, [user])
}
