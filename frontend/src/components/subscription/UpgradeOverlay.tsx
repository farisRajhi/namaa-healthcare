import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Lock, ArrowRight, ArrowLeft } from 'lucide-react'
import type { PlanId } from '../../config/plans'

interface UpgradeOverlayProps {
  /** Kind of gate — controls the copy shown. */
  kind?: 'subscription' | 'plan'
  /** When kind='plan', the plan tier required. */
  requiredPlan?: PlanId | null
  /** Navigate back instead of showing "go back" — used by route-wrapper version. */
  hideBack?: boolean
  /** Optional explicit onBack for modal variants. */
  onBack?: () => void
  /** When true, renders as a page card; when false, as a compact inline block. */
  fullPage?: boolean
}

export default function UpgradeOverlay({
  kind = 'subscription',
  requiredPlan,
  hideBack,
  onBack,
  fullPage = true,
}: UpgradeOverlayProps) {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const isRTL = i18n.language === 'ar'
  const Chevron = isRTL ? ArrowLeft : ArrowRight

  const title = t('subscription.upgradeOverlay.title')
  const planLabel = requiredPlan
    ? t(`pricing.plans.${requiredPlan}.name`)
    : ''
  const message =
    kind === 'plan' && requiredPlan
      ? t('subscription.upgradeOverlay.messagePlan', { plan: planLabel })
      : t('subscription.upgradeOverlay.messageSubscription')

  const goToPlans = () => navigate('/dashboard/billing?tab=plans')
  const goBack = onBack ?? (() => navigate(-1))

  const card = (
    <div className="card p-8 max-w-md w-full text-center">
      <div className="w-14 h-14 rounded-2xl bg-primary-50 text-primary-600 flex items-center justify-center mx-auto mb-5">
        <Lock className="w-6 h-6" />
      </div>
      <h2 className="font-heading text-2xl font-semibold text-healthcare-text mb-2">{title}</h2>
      <p className="text-healthcare-muted text-sm leading-relaxed mb-6">{message}</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <button onClick={goToPlans} className="btn-primary flex-1">
          {t('subscription.upgradeOverlay.cta')}
          <Chevron className="w-4 h-4" />
        </button>
        {!hideBack && (
          <button onClick={goBack} className="btn-outline flex-1">
            {t('subscription.upgradeOverlay.back')}
          </button>
        )}
      </div>
    </div>
  )

  if (!fullPage) return card

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6" dir={isRTL ? 'rtl' : 'ltr'}>
      {card}
    </div>
  )
}
