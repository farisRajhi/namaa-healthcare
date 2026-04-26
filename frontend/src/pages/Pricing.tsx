import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSubscription } from '../hooks/useSubscription'
import PricingSection from '../components/pricing/PricingSection'
import { type Plan } from '../config/plans'

export default function Pricing() {
  const navigate = useNavigate()
  const { plan: currentPlan } = useSubscription()
  const { i18n } = useTranslation()
  const isRTL = i18n.language === 'ar'

  function handleSubscribeClick(plan: Plan) {
    const token = localStorage.getItem('token')
    if (!token) {
      navigate(`/login?redirect=${encodeURIComponent(`/billing/checkout/${plan.id}`)}`)
      return
    }
    navigate(`/billing/checkout/${plan.id}`)
  }

  return (
    <div
      className={`min-h-screen bg-healthcare-bg py-16 px-4 ${isRTL ? 'rtl' : 'ltr'}`}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <PricingSection
        onSelectPlan={handleSubscribeClick}
        currentPlan={currentPlan}
        variant="landing"
      />
    </div>
  )
}
