// @ts-nocheck
// HIDDEN: billing UI — re-enable when subscriptions return.
// File kept on disk; not imported anywhere while billing is hidden.
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  CheckCircle2,
  XCircle,
  Clock,
  CreditCard,
  ArrowLeft,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import PricingSection from '../components/pricing/PricingSection'
import { PLANS, type PlanId } from '../config/plans'

interface Subscription {
  id: string
  plan: PlanId
  status: 'active' | 'past_due' | 'cancelled' | 'expired'
  startDate: string
  endDate: string
  cancelledAt: string | null
  cardBrand?: string | null
  lastFour?: string | null
  failedAttempts?: number
}

interface Payment {
  id: string
  amount: number
  currency: string
  status: string
  plan: string | null
  tapChargeId: string | null
  description: string | null
  createdAt: string
  kind?: string
  cardBrand?: string | null
  lastFour?: string | null
}

interface Usage {
  tokensUsed: number
  tokensLimit: number
  remaining: number
  percentage: number
  responseCount: number
  avgTokensPerConversation: number
  year: number
  month: number
  daysUntilReset: number
  status: 'healthy' | 'warning' | 'critical' | 'blocked'
}

interface SubscriptionResponse {
  subscription: Subscription | null
  payments: Payment[]
  isActive: boolean
  usage?: Usage
}

interface VerifyResponse {
  charge: { id: string; status: string }
  localPayment: Payment | null
}

type TabKey = 'subscription' | 'plans' | 'history'

export default function Billing() {
  const { t, i18n } = useTranslation()
  const isRTL = i18n.language === 'ar'
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { refreshSubscription } = useAuth()
  const [data, setData] = useState<SubscriptionResponse | null>(null)
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelSubmitting, setCancelSubmitting] = useState(false)
  const [resumeSubmitting, setResumeSubmitting] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  const chargeId = searchParams.get('tap_id') || searchParams.get('chargeId')
  const activeTab = (searchParams.get('tab') as TabKey | null) || 'subscription'

  const setTab = (tab: TabKey) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }

  const reload = async () => {
    setLoading(true)
    setError(null)
    try {
      if (chargeId) {
        const verify = await api.get<VerifyResponse>(`/api/payments/verify/${chargeId}`)
        setVerifyResult(verify.data)
      }
      const sub = await api.get<SubscriptionResponse>('/api/subscription')
      setData(sub.data)
      await refreshSubscription()
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load billing')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        if (chargeId) {
          const verify = await api.get<VerifyResponse>(`/api/payments/verify/${chargeId}`)
          if (!cancelled) setVerifyResult(verify.data)
        }
        const sub = await api.get<SubscriptionResponse>('/api/subscription')
        if (!cancelled) setData(sub.data)
        if (!cancelled) await refreshSubscription()
      } catch (err: any) {
        if (!cancelled) setError(err?.response?.data?.error || err?.message || 'Failed to load billing')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [chargeId])

  const chargeStatus = verifyResult?.charge?.status?.toUpperCase()
  const isSuccess = chargeStatus === 'CAPTURED'
  const isPending = chargeStatus === 'INITIATED' || chargeStatus === 'AUTHORIZED'
  const isFailure = chargeStatus && !isSuccess && !isPending

  const sub = data?.subscription
  const currentPlanMeta = useMemo(() => PLANS.find((p) => p.id === sub?.plan) ?? null, [sub])

  const renewsLabel = (() => {
    if (!sub) return null
    if (sub.status === 'cancelled') return isRTL ? 'ينتهي في' : 'Ends on'
    if (sub.status === 'expired') return isRTL ? 'انتهى في' : 'Expired on'
    return isRTL ? 'التجديد التالي' : 'Renews on'
  })()

  const statusBadge = (() => {
    if (!sub) return null
    if (sub.status === 'active' && data?.isActive)
      return { label: isRTL ? 'نشط' : 'Active', cls: 'bg-success-50 text-success-700 border-success-200' }
    if (sub.status === 'past_due')
      return { label: isRTL ? 'متأخر السداد' : 'Past due', cls: 'bg-warning-50 text-warning-700 border-warning-200' }
    if (sub.status === 'cancelled')
      return { label: isRTL ? 'ملغى' : 'Cancelled', cls: 'bg-secondary-50 text-secondary-700 border-secondary-200' }
    return { label: isRTL ? 'منتهي' : 'Expired', cls: 'bg-danger-50 text-danger-700 border-danger-200' }
  })()

  const handleCancel = async () => {
    setCancelSubmitting(true)
    setActionMessage(null)
    try {
      await api.post('/api/subscription/cancel')
      setShowCancelConfirm(false)
      setActionMessage(
        isRTL
          ? 'تم إلغاء اشتراكك. ستظل لديك صلاحية الوصول حتى تاريخ انتهاء الفترة الحالية.'
          : 'Your subscription was cancelled. Access continues until the end of the current period.',
      )
      await reload()
    } catch (err: any) {
      setActionMessage(err?.response?.data?.error || err?.message || 'Cancellation failed')
    } finally {
      setCancelSubmitting(false)
    }
  }

  const handleResume = async () => {
    setResumeSubmitting(true)
    setActionMessage(null)
    try {
      await api.post('/api/subscription/resume')
      setActionMessage(isRTL ? 'تم استئناف اشتراكك.' : 'Subscription resumed.')
      await reload()
    } catch (err: any) {
      setActionMessage(err?.response?.data?.error || err?.message || 'Resume failed')
    } finally {
      setResumeSubmitting(false)
    }
  }


  const tabs: { key: TabKey; labelKey: string }[] = [
    { key: 'subscription', labelKey: 'billing.tabs.subscription' },
    { key: 'plans', labelKey: 'billing.tabs.plans' },
    { key: 'history', labelKey: 'billing.tabs.history' },
  ]

  return (
    <div
      className={`min-h-screen bg-healthcare-bg py-12 px-4 ${isRTL ? 'rtl' : 'ltr'}`}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="max-w-5xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="font-heading text-3xl font-semibold text-healthcare-text">
            {t('billing.title')}
          </h1>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 text-healthcare-muted hover:text-primary-600 text-sm transition-colors"
          >
            <ArrowLeft className={`w-4 h-4 ${isRTL ? 'rotate-180' : ''}`} />
            {isRTL ? 'الرئيسية' : 'Dashboard'}
          </Link>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex flex-wrap gap-2 border-b border-healthcare-border/40">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
                activeTab === tab.key
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-healthcare-muted hover:text-healthcare-text'
              }`}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        {/* Post-payment callback banner (shown on all tabs) */}
        {chargeId && (
          <div
            className={`mb-8 rounded-xl border p-5 ${
              isSuccess
                ? 'bg-success-50 border-success-200'
                : isFailure
                ? 'bg-danger-50 border-danger-200'
                : 'bg-warning-50 border-warning-200'
            }`}
          >
            <div className="flex items-start gap-3">
              {isSuccess ? (
                <CheckCircle2 className="w-6 h-6 text-success-600 flex-shrink-0 mt-0.5" />
              ) : isFailure ? (
                <XCircle className="w-6 h-6 text-danger-600 flex-shrink-0 mt-0.5" />
              ) : (
                <Clock className="w-6 h-6 text-warning-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <h2 className="font-heading text-lg font-semibold text-healthcare-text">
                  {isSuccess
                    ? isRTL
                      ? 'تم الدفع بنجاح'
                      : 'Payment successful'
                    : isFailure
                    ? isRTL
                      ? 'فشل الدفع'
                      : 'Payment failed'
                    : isRTL
                    ? 'جاري معالجة الدفع...'
                    : 'Payment processing…'}
                </h2>
                <p className="text-healthcare-muted text-sm mt-1">
                  {isRTL ? 'رقم العملية:' : 'Charge ID:'}{' '}
                  <code className="text-xs bg-white/60 px-1.5 py-0.5 rounded border border-healthcare-border/40">
                    {chargeId}
                  </code>
                </p>
                {isSuccess && (
                  <p className="text-healthcare-text text-sm mt-2">
                    {isRTL
                      ? 'تم تفعيل اشتراكك. جميع ميزات المنصة أصبحت متاحة الآن.'
                      : 'Your subscription is now active. All platform features are unlocked.'}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {actionMessage && (
          <div className="mb-6 bg-primary-50 border border-primary-200 text-primary-700 rounded-xl p-4 text-sm">
            {actionMessage}
          </div>
        )}

        {loading && (
          <div className="text-center py-16 text-healthcare-muted text-sm">
            {isRTL ? 'جاري التحميل...' : 'Loading…'}
          </div>
        )}

        {error && !loading && (
          <div className="bg-danger-50 border border-danger-200 text-danger-700 rounded-xl p-4 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && data && activeTab === 'subscription' && (
          <div className="card p-6">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <div className="text-xs text-healthcare-muted uppercase tracking-widest mb-1">
                  {isRTL ? 'الاشتراك الحالي' : 'Current subscription'}
                </div>
                {sub ? (
                  <h2 className="font-heading text-2xl font-semibold text-healthcare-text">
                    {t(`pricing.plans.${sub.plan}.name`)}
                    {currentPlanMeta && (
                      <span className="text-healthcare-muted text-base font-normal ms-3">
                        {currentPlanMeta.priceSar} {t('pricing.perMonth')}
                      </span>
                    )}
                  </h2>
                ) : (
                  <h2 className="font-heading text-2xl font-semibold text-healthcare-text">
                    {isRTL ? 'لا يوجد اشتراك' : 'No subscription'}
                  </h2>
                )}
              </div>
              {statusBadge && (
                <span className={`text-xs font-semibold border rounded-full px-3 py-1 ${statusBadge.cls}`}>
                  {statusBadge.label}
                </span>
              )}
            </div>

            {sub ? (
              <>
                {data.usage && (
                  <UsageCard usage={data.usage} isRTL={isRTL} onUpgrade={() => setTab('plans')} />
                )}
                <div className="mt-5 grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Field
                    label={isRTL ? 'تاريخ البدء' : 'Started'}
                    value={new Date(sub.startDate).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US')}
                  />
                  {renewsLabel && (
                    <Field
                      label={renewsLabel}
                      value={new Date(sub.endDate).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US')}
                    />
                  )}
                  {sub.cardBrand && sub.lastFour && (
                    <Field
                      label={isRTL ? 'البطاقة المحفوظة' : 'Saved card'}
                      value={`${sub.cardBrand} •••• ${sub.lastFour}`}
                    />
                  )}
                </div>
              </>
            ) : (
              <p className="text-healthcare-muted text-sm mt-4">
                {isRTL
                  ? 'لا يوجد اشتراك مفعّل. انتقل إلى تبويب "الخطط والأسعار" لاختيار خطة.'
                  : 'No active subscription. Switch to the "Plans & Pricing" tab to choose a plan.'}
              </p>
            )}

            {sub?.status === 'past_due' && (
              <div className="mt-5 flex items-start gap-3 bg-warning-50 border border-warning-200 text-warning-800 rounded-lg px-4 py-3 text-sm">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-warning-600" />
                <div>
                  {isRTL
                    ? 'فشل تجديد البطاقة. سنحاول مرة أخرى تلقائياً. لتفادي انقطاع الخدمة، حدّث بطاقتك من تبويب "الخطط والأسعار".'
                    : 'Your renewal payment failed — we’ll auto-retry, but updating your card via the Plans tab is the fastest way to avoid losing access.'}
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              {sub?.status === 'cancelled' && new Date(sub.endDate) > new Date() && (
                <button onClick={handleResume} disabled={resumeSubmitting} className="btn-success">
                  <RefreshCw className="w-4 h-4" />
                  {resumeSubmitting
                    ? isRTL
                      ? 'جاري الاستئناف...'
                      : 'Resuming…'
                    : isRTL
                    ? 'استئناف الاشتراك'
                    : 'Resume subscription'}
                </button>
              )}
              {sub && sub.status !== 'cancelled' && sub.status !== 'expired' && (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="btn border-2 border-danger-300 text-danger-700 bg-transparent hover:bg-danger-50"
                >
                  {isRTL ? 'إلغاء الاشتراك' : 'Cancel subscription'}
                </button>
              )}
            </div>
          </div>
        )}

        {!loading && !error && activeTab === 'plans' && (
          <div className="bg-white rounded-xl p-6 border border-healthcare-border/40">
            <PricingSection
              onSelectPlan={(plan) => navigate(`/billing/checkout/${plan.id}`)}
              currentPlan={sub?.plan ?? null}
              variant="dashboard"
            />
          </div>
        )}

        {!loading && !error && data && activeTab === 'history' && (
          <div className="card p-6">
            <h2 className="font-heading text-xl font-semibold text-healthcare-text mb-4">
              {t('billing.tabs.history')}
            </h2>
            {data.payments.length === 0 ? (
              <p className="text-healthcare-muted text-sm">
                {isRTL ? 'لا توجد مدفوعات بعد.' : 'No payments yet.'}
              </p>
            ) : (
              <div className="divide-y divide-healthcare-border/40">
                {data.payments.map((p) => (
                  <div key={p.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center flex-shrink-0">
                        <CreditCard className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm text-healthcare-text font-medium truncate">
                          {p.description || p.plan || 'Subscription'}
                          {p.kind && p.kind !== 'initial' && (
                            <span className="ms-2 text-[10px] uppercase text-healthcare-muted tracking-wider font-semibold">
                              {p.kind}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-healthcare-muted">
                          {new Date(p.createdAt).toLocaleString(isRTL ? 'ar-SA' : 'en-US')}
                          {p.cardBrand && p.lastFour && (
                            <span className="ms-2">
                              · {p.cardBrand} •••• {p.lastFour}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-end flex-shrink-0">
                      <div className="text-sm text-healthcare-text font-semibold tabular-nums">
                        {(p.amount / 100).toFixed(2)} {p.currency}
                      </div>
                      <div
                        className={`text-xs font-medium ${
                          p.status === 'paid'
                            ? 'text-success-600'
                            : p.status === 'failed' || p.status === 'cancelled'
                            ? 'text-danger-600'
                            : 'text-healthcare-muted'
                        }`}
                      >
                        {p.status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cancel confirm modal */}
      {showCancelConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-healthcare-text/40 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => !cancelSubmitting && setShowCancelConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl border border-healthcare-border/40 shadow-modal w-full max-w-md p-6 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
            dir={isRTL ? 'rtl' : 'ltr'}
          >
            <h3 className="font-heading text-xl font-semibold text-healthcare-text">
              {isRTL ? 'هل أنت متأكد من الإلغاء؟' : 'Cancel subscription?'}
            </h3>
            <p className="text-healthcare-muted text-sm mt-3 leading-relaxed">
              {isRTL
                ? `ستظل لديك صلاحية كاملة حتى ${sub ? new Date(sub.endDate).toLocaleDateString('ar-SA') : ''}، ثم سيتوقف الوصول. لن نحاسبك مرة أخرى.`
                : `You'll keep full access until ${sub ? new Date(sub.endDate).toLocaleDateString('en-US') : ''}, then it'll be turned off. You won't be charged again.`}
            </p>
            <div className="mt-5 flex gap-2 justify-end">
              <button
                onClick={() => setShowCancelConfirm(false)}
                disabled={cancelSubmitting}
                className="btn-outline"
              >
                {isRTL ? 'تراجع' : 'Keep subscription'}
              </button>
              <button onClick={handleCancel} disabled={cancelSubmitting} className="btn-danger">
                {cancelSubmitting
                  ? isRTL
                    ? 'جاري الإلغاء...'
                    : 'Cancelling…'
                  : isRTL
                  ? 'تأكيد الإلغاء'
                  : 'Confirm cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-healthcare-muted uppercase tracking-wide">{label}</div>
      <div className="text-base font-medium mt-1 text-healthcare-text tabular-nums">{value}</div>
    </div>
  )
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function UsageCard({
  usage,
  isRTL,
  onUpgrade,
}: {
  usage: Usage
  isRTL: boolean
  onUpgrade: () => void
}) {
  const barColor =
    usage.status === 'blocked' || usage.status === 'critical'
      ? 'bg-danger-500'
      : usage.status === 'warning'
        ? 'bg-warning-500'
        : 'bg-success-500'

  const borderColor =
    usage.status === 'blocked'
      ? 'border-danger-200 bg-danger-50/40'
      : usage.status === 'critical'
        ? 'border-danger-200 bg-danger-50/40'
        : usage.status === 'warning'
          ? 'border-warning-200 bg-warning-50/40'
          : 'border-healthcare-border/40 bg-white'

  return (
    <div className={`mt-5 rounded-xl border p-5 ${borderColor}`}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-heading text-sm font-semibold text-healthcare-text uppercase tracking-wider">
          {isRTL ? 'استهلاك الذكاء الاصطناعي هذا الشهر' : 'AI usage this month'}
        </h3>
        {usage.status === 'blocked' && (
          <span className="text-xs font-semibold bg-danger-100 text-danger-700 px-2.5 py-1 rounded-full">
            {isRTL ? 'تم الوصول للحد الأقصى' : 'Limit reached'}
          </span>
        )}
      </div>

      <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
        <div className="text-2xl font-bold text-healthcare-text tabular-nums">
          {formatTokens(usage.tokensUsed)}{' '}
          <span className="text-base text-healthcare-muted font-normal">
            / {formatTokens(usage.tokensLimit)}
          </span>
        </div>
        <div className="text-sm text-healthcare-muted tabular-nums">
          {usage.percentage}%
        </div>
      </div>

      <div className="h-2.5 bg-healthcare-border/30 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.min(100, usage.percentage)}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-healthcare-muted flex-wrap gap-2">
        <div>
          {isRTL
            ? `${usage.responseCount.toLocaleString('ar-SA')} محادثة · متوسط ${formatTokens(usage.avgTokensPerConversation)} رمز للمحادثة`
            : `${usage.responseCount.toLocaleString()} conversations · avg ${formatTokens(usage.avgTokensPerConversation)} tokens/conv`}
        </div>
        <div>
          {isRTL
            ? `يُعاد التعيين خلال ${usage.daysUntilReset} يوم`
            : `Resets in ${usage.daysUntilReset} day${usage.daysUntilReset === 1 ? '' : 's'}`}
        </div>
      </div>

      {usage.status === 'blocked' && (
        <div className="mt-4 pt-4 border-t border-danger-200 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-danger-600 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm text-danger-800 font-medium mb-2">
              {isRTL
                ? 'تم إيقاف الذكاء الاصطناعي مؤقتاً. يرجى الترقية لاستئناف الخدمة.'
                : 'AI responses are paused. Upgrade your plan to resume service.'}
            </div>
            <button onClick={onUpgrade} className="btn-primary text-sm">
              {isRTL ? 'ترقية الخطة' : 'Upgrade plan'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
