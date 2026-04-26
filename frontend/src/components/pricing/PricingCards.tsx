import { PLANS, type Plan, type PlanId } from '../../config/plans'
import PricingCard from './PricingCard'

interface PricingCardsProps {
  onSelectPlan: (plan: Plan) => void
  currentPlan?: PlanId | null
  variant?: 'landing' | 'dashboard'
}

export default function PricingCards({ onSelectPlan, currentPlan, variant = 'landing' }: PricingCardsProps) {
  return (
    <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
      {PLANS.map((plan) => (
        <PricingCard
          key={plan.id}
          plan={plan}
          isCurrent={currentPlan === plan.id}
          onSelect={onSelectPlan}
          variant={variant}
        />
      ))}
    </div>
  )
}
