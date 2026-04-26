import { useTranslation } from 'react-i18next'
import { CheckCircle, Zap, Stethoscope, Crown, ArrowRight, ArrowLeft } from 'lucide-react'
import type { Plan, PlanAccent } from '../../config/plans'

const ACCENT: Record<PlanAccent, { iconBg: string; iconText: string; ring: string; popularBg: string }> = {
  primary: {
    iconBg: 'bg-primary-50',
    iconText: 'text-primary-600',
    ring: 'border-primary-200',
    popularBg: 'bg-primary-500',
  },
  secondary: {
    iconBg: 'bg-secondary-50',
    iconText: 'text-secondary-700',
    ring: 'border-secondary-300',
    popularBg: 'bg-secondary-500',
  },
  success: {
    iconBg: 'bg-success-50',
    iconText: 'text-success-700',
    ring: 'border-success-200',
    popularBg: 'bg-success-500',
  },
}

const ICONS: Record<Plan['id'], typeof Zap> = {
  starter: Zap,
  professional: Stethoscope,
  enterprise: Crown,
}

interface PricingCardProps {
  plan: Plan
  isCurrent?: boolean
  onSelect: (plan: Plan) => void
  /** When true (dashboard variant), we surface a "Current plan" chip instead of a CTA. */
  variant?: 'landing' | 'dashboard'
}

export default function PricingCard({ plan, isCurrent, onSelect, variant = 'landing' }: PricingCardProps) {
  const { t, i18n } = useTranslation()
  const isRTL = i18n.language === 'ar'
  const Icon = ICONS[plan.id]
  const accent = ACCENT[plan.accent]
  const ChevronCta = isRTL ? ArrowLeft : ArrowRight

  const name = t(`pricing.plans.${plan.id}.name`)
  const description = t(`pricing.plans.${plan.id}.description`)
  const features = t(`pricing.plans.${plan.id}.features`, { returnObjects: true }) as string[]

  return (
    <div
      className={`relative card p-7 flex flex-col ${
        plan.popular
          ? `${accent.ring} border-2 shadow-card-hover`
          : isCurrent
          ? `${accent.ring} border-2`
          : 'border-healthcare-border/40'
      }`}
    >
      {plan.popular && (
        <div
          className={`absolute -top-3 start-1/2 -translate-x-1/2 ${accent.popularBg} text-white text-xs font-bold tracking-wide px-3 py-1 rounded-full shadow-btn whitespace-nowrap`}
        >
          {t('pricing.popular')}
        </div>
      )}

      <div className="mb-5">
        <div className={`inline-flex p-3 rounded-xl mb-4 ${accent.iconBg} ${accent.iconText}`}>
          <Icon className="w-6 h-6" />
        </div>
        <h2 className="font-heading text-2xl font-semibold text-healthcare-text">{name}</h2>
        <p className="text-healthcare-muted text-sm mt-1">{description}</p>
      </div>

      <div className="mb-6 pb-5 border-b border-healthcare-border/40">
        <div className="flex items-baseline gap-2">
          <span className="font-heading text-4xl font-bold text-healthcare-text tracking-tight tabular-nums">
            {plan.priceSar}
          </span>
          <span className="text-healthcare-muted text-sm">{t('pricing.perMonth')}</span>
        </div>
      </div>

      <ul className="space-y-3 mb-7 flex-grow">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2 text-healthcare-text text-sm leading-relaxed">
            <CheckCircle className="w-4 h-4 text-primary-500 flex-shrink-0 mt-0.5" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {isCurrent ? (
        <button
          disabled
          className="w-full py-2.5 rounded-lg bg-primary-50 text-primary-700 text-sm font-semibold cursor-default border border-primary-200"
        >
          {t('pricing.cta.current')}
        </button>
      ) : (
        <button
          onClick={() => onSelect(plan)}
          className={plan.popular ? 'btn-primary w-full' : 'btn-outline w-full'}
        >
          {variant === 'dashboard'
            ? t('pricing.cta.switch')
            : t('pricing.cta.subscribe', { plan: name })}
          <ChevronCta className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
