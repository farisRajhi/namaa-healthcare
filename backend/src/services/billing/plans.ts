export type PlanKey = 'starter' | 'professional' | 'enterprise';

// Prices in halalas (SAR * 100). Mirrored from tap.ts halala convention.
export const PLAN_PRICES: Record<PlanKey, number> = {
  starter: 29900,
  professional: 49900,
  enterprise: 79900,
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
