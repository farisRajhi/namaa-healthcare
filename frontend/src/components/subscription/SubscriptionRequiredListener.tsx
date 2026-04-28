// @ts-nocheck
// HIDDEN: billing UI — re-enable when subscriptions return.
// File kept on disk; not imported anywhere while billing is hidden.
import { useEffect, useState } from 'react'
import { SUBSCRIPTION_REQUIRED_EVENT, type SubscriptionRequiredPayload } from '../../lib/api'
import UpgradeOverlay from './UpgradeOverlay'
import type { PlanId } from '../../config/plans'

/**
 * Global listener that renders an UpgradeOverlay modal when the API returns 402
 * with a SUBSCRIPTION_REQUIRED or PLAN_UPGRADE_REQUIRED code. The overlay is
 * shown on top of whatever page the user is on so they don't lose their state.
 *
 * Suppressed on public pages and on /billing, /pricing — those already have
 * their own upgrade flows, and auth pages shouldn't see the modal.
 */
export default function SubscriptionRequiredListener() {
  const [payload, setPayload] = useState<SubscriptionRequiredPayload | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      const path = window.location.pathname
      // Don't double up on pages that already surface upgrade prompts.
      if (
        path === '/' ||
        path.startsWith('/login') ||
        path.startsWith('/register') ||
        path.startsWith('/pricing') ||
        path.startsWith('/billing') ||
        path.includes('/dashboard/billing')
      ) {
        return
      }
      const detail = (e as CustomEvent<SubscriptionRequiredPayload>).detail
      if (detail) setPayload(detail)
    }
    window.addEventListener(SUBSCRIPTION_REQUIRED_EVENT, handler)
    return () => window.removeEventListener(SUBSCRIPTION_REQUIRED_EVENT, handler)
  }, [])

  if (!payload) return null

  const kind = payload.code === 'PLAN_UPGRADE_REQUIRED' ? 'plan' : 'subscription'
  const requiredPlan = (payload.requiredPlan as PlanId | undefined) ?? null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-healthcare-text/40 backdrop-blur-sm p-4 animate-fade-in"
      onClick={() => setPayload(null)}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <UpgradeOverlay
          kind={kind}
          requiredPlan={requiredPlan}
          fullPage={false}
          onBack={() => setPayload(null)}
        />
      </div>
    </div>
  )
}
