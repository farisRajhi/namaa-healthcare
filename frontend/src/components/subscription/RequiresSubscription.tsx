import { type ReactNode } from 'react'
import { useSubscription } from '../../hooks/useSubscription'
import type { PlanFeature } from '../../config/planFeatures'
import type { PlanId } from '../../config/plans'
import { FEATURE_MATRIX } from '../../config/planFeatures'
import UpgradeOverlay from './UpgradeOverlay'

interface RequiresSubscriptionProps {
  /** Optional feature key — if provided, checks plan-tier access in addition to subscription status. */
  feature?: PlanFeature
  children: ReactNode
}

/**
 * Route / section guard. Renders an UpgradeOverlay in place of `children`
 * when the user lacks an active subscription OR their plan does not unlock
 * the requested feature.
 *
 * Trialing users are treated as Professional (see useSubscription.effectivePlan).
 * Use on routes like <RequiresSubscription feature="campaigns"><Campaigns /></RequiresSubscription>.
 */
export default function RequiresSubscription({ feature, children }: RequiresSubscriptionProps) {
  const sub = useSubscription()

  if (!sub.isActive) {
    return <UpgradeOverlay kind="subscription" />
  }

  if (feature && !sub.canAccess(feature)) {
    // Compute the lowest plan that unlocks this feature.
    const allowed = FEATURE_MATRIX[feature]
    const requiredPlan: PlanId | null = allowed[0] ?? null
    return <UpgradeOverlay kind="plan" requiredPlan={requiredPlan} />
  }

  return <>{children}</>
}
