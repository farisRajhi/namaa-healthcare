export type PlanKey = 'starter' | 'professional' | 'enterprise';

// Prices in halalas (SAR * 100). Mirrored from tap.ts halala convention.
// Keep aligned with frontend/src/config/plans.ts.
export const PLAN_PRICES: Record<PlanKey, number> = {
  starter: 19900,       // 199 SAR
  professional: 44900,  // 449 SAR
  enterprise: 74900,    // 749 SAR
};

/** Monthly conversation cap per plan — used by usage tracking (soft limit at MVP). */
export const PLAN_CONVERSATION_LIMIT: Record<PlanKey, number> = {
  starter: 1_000,
  professional: 5_000,
  enterprise: 10_000,
};

/**
 * Monthly token budget per plan (hard cap).
 * Assumption: avg conversation ~20K tokens (short FAQ 5–10K, full booking 25–50K).
 * Adjust these numbers to protect margins as real usage data comes in.
 */
export const PLAN_TOKEN_LIMIT: Record<PlanKey, number> = {
  starter: 20_000_000,       // ~1,000 avg conversations
  professional: 100_000_000, // ~5,000 avg conversations
  enterprise: 250_000_000,   // ~10–12K avg conversations
};

/** Hard cap on tokens within a single conversation — prevents runaway/abusive sessions. */
export const CONVERSATION_TOKEN_CAP = 80_000;

/**
 * Max active providers per org, per plan. Mirrors `limits.providers` in
 * frontend/src/config/plans.ts. `Infinity` = unlimited.
 * Enforced in backend/src/routes/providers.ts.
 */
export const PLAN_PROVIDER_LIMIT: Record<PlanKey, number> = {
  starter: 15,
  professional: 25,
  enterprise: Infinity,
};

export const PLAN_KEYS: PlanKey[] = ['starter', 'professional', 'enterprise'];

export function isPlanKey(v: unknown): v is PlanKey {
  return typeof v === 'string' && (PLAN_KEYS as string[]).includes(v);
}

/**
 * Given a list of active subscriptions, return monthly revenue in SAR.
 * Assumes PLAN_PRICES are monthly prices.
 */
export function monthlyRevenueFromSubscriptions(
  subs: { plan: string | null }[],
): number {
  let halalas = 0;
  for (const s of subs) {
    if (s.plan && isPlanKey(s.plan)) {
      halalas += PLAN_PRICES[s.plan];
    }
  }
  return halalas / 100;
}
