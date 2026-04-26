import { useTranslation } from 'react-i18next'
import { ShieldCheck, Lock } from 'lucide-react'
import PricingCards from './PricingCards'
import type { Plan, PlanId } from '../../config/plans'

interface PricingSectionProps {
  id?: string
  onSelectPlan: (plan: Plan) => void
  currentPlan?: PlanId | null
  variant?: 'landing' | 'dashboard'
  /** Hide the trust/payments-row (e.g. when embedded in the billing tab). */
  hideTrust?: boolean
}

export default function PricingSection({
  id,
  onSelectPlan,
  currentPlan,
  variant = 'landing',
  hideTrust,
}: PricingSectionProps) {
  const { t } = useTranslation()

  return (
    <section id={id} className={variant === 'landing' ? 'py-20 bg-healthcare-bg px-4 sm:px-6 lg:px-8' : ''}>
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12 max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-primary-600 bg-primary-50 border border-primary-100 rounded-full px-3 py-1 mb-4">
            <ShieldCheck className="w-3.5 h-3.5" />
            {t('pricing.badge')}
          </span>
          <h2 className="font-heading text-3xl sm:text-4xl md:text-5xl font-bold text-healthcare-text mb-4">
            {t('pricing.title')}
          </h2>
          <p className="text-healthcare-muted text-lg">{t('pricing.subtitle')}</p>
        </div>

        <PricingCards
          onSelectPlan={onSelectPlan}
          currentPlan={currentPlan}
          variant={variant}
        />

        {!hideTrust && (
          <div className="mt-12 text-center max-w-3xl mx-auto">
            <p className="text-healthcare-muted text-sm flex items-center justify-center gap-1.5 flex-wrap">
              <Lock className="w-3.5 h-3.5" />
              {t('pricing.trust.secure')}{' '}
              <span className="text-healthcare-text font-semibold">Tap Payments</span>
              <span className="text-healthcare-border">·</span>
              <span>{t('pricing.trust.ssl')}</span>
              <span className="text-healthcare-border">·</span>
              <span>{t('pricing.trust.pdpl')}</span>
            </p>
            <div className="flex justify-center gap-6 md:gap-8 mt-4 text-healthcare-muted text-xs">
              <span>VISA</span>
              <span>MASTERCARD</span>
              <span>mada</span>
              <span>AMEX</span>
              <span>3D Secure</span>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
