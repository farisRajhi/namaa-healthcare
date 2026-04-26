import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Sparkles, ArrowRight, ArrowLeft, X } from 'lucide-react'
import { useSubscription } from '../../hooks/useSubscription'

const DISMISS_KEY = 'tawafud:trial-banner-dismissed'

/**
 * Amber trial-countdown banner shown at the top of the dashboard while the
 * 14-day trial is active. Dismissible per session; reappears on reload so the
 * urgency stays visible without being annoying mid-session.
 */
export default function TrialBanner() {
  const { t, i18n } = useTranslation()
  const sub = useSubscription()
  const isRTL = i18n.language === 'ar'
  const Chevron = isRTL ? ArrowLeft : ArrowRight

  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  if (dismissed) return null
  if (!sub.isTrialing) return null
  if (sub.hasPaidActive) return null

  const days = sub.daysRemaining ?? 0

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* no-op */
    }
    setDismissed(true)
  }

  return (
    <div className="bg-warning-50 border-b border-warning-200 text-warning-900 px-4 py-2.5 text-sm flex items-center gap-3 flex-wrap">
      <Sparkles className="w-4 h-4 text-warning-600 flex-shrink-0" />
      <span className="flex-1">
        {t('subscription.trialBanner.active', { days, count: days })}
      </span>
      <Link
        to="/dashboard/billing?tab=plans"
        className="inline-flex items-center gap-1 font-semibold text-warning-800 hover:text-warning-900 underline-offset-2 hover:underline"
      >
        {t('subscription.trialBanner.cta')}
        <Chevron className="w-3.5 h-3.5" />
      </Link>
      <button
        onClick={handleDismiss}
        className="p-1 hover:bg-warning-100 rounded transition-colors"
        aria-label="dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
