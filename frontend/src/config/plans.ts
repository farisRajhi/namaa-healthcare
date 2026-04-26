/**
 * Single source of truth for pricing plans — used by Landing page, Pricing page,
 * Billing page, and any UpgradeOverlay. Backend mirror lives in
 * `backend/src/services/billing/plans.ts` (PLAN_PRICES). If numbers change here,
 * change them there too.
 *
 * Channel is WhatsApp only. SMS, Voice AI, Web Chat and Custom AI Agent copy
 * have been removed from customer-facing tiers.
 */

export type PlanId = 'starter' | 'professional' | 'enterprise'

export type PlanAccent = 'primary' | 'secondary' | 'success'

export interface Plan {
  id: PlanId
  /** Halalas (SAR cents) — kept for parity with backend PLAN_PRICES. */
  amount: number
  /** SAR major units for display. */
  priceSar: number
  accent: PlanAccent
  /** i18n key for the feature bullet list — resolves to an array via returnObjects. */
  featuresKey: string
  popular?: boolean
  /** Quantitative limits surfaced in copy and usage-tracking. */
  limits: {
    providers: number | 'unlimited'
    conversationsPerMonth: number
    /** Monthly AI token budget — must match backend PLAN_TOKEN_LIMIT. */
    tokensPerMonth: number
    branches: number | 'unlimited'
  }
}

export const PLANS: Plan[] = [
  {
    id: 'starter',
    priceSar: 199,
    amount: 19900,
    accent: 'primary',
    featuresKey: 'pricing.plans.starter.features',
    limits: {
      providers: 15,
      conversationsPerMonth: 1_000,
      tokensPerMonth: 20_000_000,
      branches: 1,
    },
  },
  {
    id: 'professional',
    priceSar: 449,
    amount: 44900,
    accent: 'secondary',
    featuresKey: 'pricing.plans.professional.features',
    popular: true,
    limits: {
      providers: 25,
      conversationsPerMonth: 5_000,
      tokensPerMonth: 100_000_000,
      branches: 1,
    },
  },
  {
    id: 'enterprise',
    priceSar: 749,
    amount: 74900,
    accent: 'success',
    featuresKey: 'pricing.plans.enterprise.features',
    limits: {
      providers: 'unlimited',
      conversationsPerMonth: 10_000,
      tokensPerMonth: 250_000_000,
      branches: 'unlimited',
    },
  },
]

export function getPlan(id: PlanId): Plan {
  const p = PLANS.find((x) => x.id === id)
  if (!p) throw new Error(`Unknown plan id: ${id}`)
  return p
}

/** Rank used for plan-tier comparisons (higher = more features). */
export const PLAN_RANK: Record<PlanId, number> = {
  starter: 1,
  professional: 2,
  enterprise: 3,
}

export function planAtLeast(current: PlanId | null | undefined, required: PlanId): boolean {
  if (!current) return false
  return PLAN_RANK[current] >= PLAN_RANK[required]
}
