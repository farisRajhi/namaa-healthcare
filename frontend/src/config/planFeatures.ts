/**
 * Feature gating matrix — which plan tier(s) unlock which feature.
 * A feature is accessible if the user's current plan is in the allowlist,
 * or if the user is trialing (trial is treated as Professional — everything
 * except Enterprise-only features like multi-branch / EHR).
 *
 * The backend mirrors this in `plugins/planGuard.ts`. Keep them in sync.
 */

import type { PlanId } from './plans'

export type PlanFeature =
  | 'reminders'
  | 'campaigns'
  | 'patientEngagement'
  | 'patientSuggestions'
  | 'patientIntelligence'
  | 'agentBuilder'
  | 'analytics'
  | 'reports'
  | 'multiBranch'
  | 'ehrIntegration'

export const FEATURE_MATRIX: Record<PlanFeature, PlanId[]> = {
  reminders: ['starter', 'professional', 'enterprise'],
  campaigns: ['professional', 'enterprise'],
  patientEngagement: ['professional', 'enterprise'],
  patientSuggestions: ['professional', 'enterprise'],
  patientIntelligence: ['starter', 'professional', 'enterprise'],
  agentBuilder: ['professional', 'enterprise'],
  analytics: ['starter', 'professional', 'enterprise'],
  reports: ['professional', 'enterprise'],
  multiBranch: ['enterprise'],
  ehrIntegration: ['enterprise'],
}

/** Trial access maps to this plan for gating purposes. */
export const TRIAL_PLAN: PlanId = 'professional'

export function canAccessFeature(
  plan: PlanId | null | undefined,
  feature: PlanFeature,
): boolean {
  if (!plan) return false
  return FEATURE_MATRIX[feature].includes(plan)
}
