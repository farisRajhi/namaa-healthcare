import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  CheckCircle2,
  XCircle,
  Clock,
  CreditCard,
  ArrowLeft,
  ArrowRight,
  X,
  Zap,
  Stethoscope,
  Crown,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import TapCardForm from '../components/billing/TapCardForm'

type PlanId = 'starter' | 'professional' | 'enterprise'

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

interface SubscriptionResponse {
  subscription: Subscription | null
  payments: Payment[]
  isActive: boolean
}

interface VerifyResponse {
  charge: { id: string; status: string }
  localPayment: Payment | null
}

interface PlanMeta {
  id: PlanId
  nameAr: string
  nameEn: string
  price: number
  icon: typeof Zap
  color: 'blue' | 'purple' | 'gold'
  descriptionAr: string
  descriptionEn: string
}

const PLANS: PlanMeta[] = [
  { id: 'starter', nameAr: 'المبتدئ', nameEn: 'Starter', price: 299, icon: Zap, color: 'blue', descriptionAr: 'للعيادات الصغيرة', descriptionEn: 'For small clinics' },
  { id: 'professional', nameAr: 'الاحترافي', nameEn: 'Professional', price: 499, icon: Stethoscope, color: 'purple', descriptionAr: 'للمنشآت المتوسطة', descriptionEn: 'For medium-sized facilities' },
  { id: 'enterprise', nameAr: 'المؤسسي', nameEn: 'Enterprise', price: 799, icon: Crown, color: 'gold', descriptionAr: 'للمستشفيات والمجموعات', descriptionEn: 'For hospitals & groups' },
]

const PLAN_LABELS: Record<string, { ar: string; en: string }> = {
  starter: { ar: 'المبتدئ', en: 'Starter' },
  professional: { ar: 'الاحترافي', en: 'Professional' },
  enterprise: { ar: 'المؤسسي', en: 'Enterprise' },
}

interface BillingProps {
  lang?: 'ar' | 'en'
}

export default function Billing({ lang = 'en' }: BillingProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const [data, setData] = useState<SubscriptionResponse | null>(null)
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [upgradePlan, setUpgradePlan] = useState<PlanMeta | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelSubmitting, setCancelSubmitting] = useState(false)
  const [resumeSubmitting, setResumeSubmitting] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const isRTL = lang === 'ar'

  const chargeId = searchParams.get('tap_id') || searchParams.get('chargeId')

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
  const currentPlan = useMemo(() => PLANS.find((p) => p.id === sub?.plan) ?? null, [sub])

  const renewsLabel = (() => {
    if (!sub) return null
    if (sub.status === 'cancelled') return isRTL ? 'ينتهي في' : 'Ends on'
    if (sub.status === 'expired') return isRTL ? 'انتهى في' : 'Expired on'
    return isRTL ? 'التجديد التالي' : 'Renews on'
  })()

  const statusBadge = (() => {
    if (!sub) return null
    if (sub.status === 'active' && data?.isActive)
      return { label: isRTL ? 'نشط' : 'Active', cls: 'bg-green-500/10 text-green-300 border-green-500/30' }
    if (sub.status === 'past_due')
      return { label: isRTL ? 'متأخر السداد' : 'Past due', cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30' }
    if (sub.status === 'cancelled')
      return { label: isRTL ? 'ملغى' : 'Cancelled', cls: 'bg-orange-500/10 text-orange-300 border-orange-500/30' }
    return { label: isRTL ? 'منتهي' : 'Expired', cls: 'bg-red-500/10 text-red-300 border-red-500/30' }
  })()

  const handleUpgradeTokenized = async (tokenId: string) => {
    if (!upgradePlan) return
    const response = await api.post('/api/subscription/upgrade', {
      plan: upgradePlan.id,
      tokenId,
      callbackUrl: `${window.location.origin}/billing?payment=callback&plan=${upgradePlan.id}`,
    })
    const result = response.data as { transactionUrl?: string; chargeId: string; status: string }
    if (result.transactionUrl) {
      const url = new URL(result.transactionUrl)
      if (url.protocol === 'https:' && url.hostname.endsWith('.tap.company')) {
        window.location.href = result.transactionUrl
        return
      }
      throw new Error('Invalid payment redirect URL')
    }
    setUpgradePlan(null)
    setSearchParams({ chargeId: result.chargeId })
    await reload()
  }

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

  return (
    <div
      className={`min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-12 px-4 ${isRTL ? 'rtl' : 'ltr'}`}
    >
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-white">
            {isRTL ? 'الفواتير والاشتراك' : 'Billing & Subscription'}
          </h1>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm"
          >
            {isRTL ? (
              <>
                {isRTL ? 'الرئيسية' : 'Dashboard'}
                <ArrowLeft className="w-4 h-4" />
              </>
            ) : (
              <>
                <ArrowLeft className="w-4 h-4" />
                Dashboard
              </>
            )}
          </Link>
        </div>

        {chargeId && (
          <div
            className={`mb-8 rounded-2xl border p-6 ${
              isSuccess
                ? 'bg-green-500/10 border-green-500/30'
                : isFailure
                ? 'bg-red-500/10 border-red-500/30'
                : 'bg-yellow-500/10 border-yellow-500/30'
            }`}
          >
            <div className="flex items-start gap-3">
              {isSuccess ? (
                <CheckCircle2 className="w-6 h-6 text-green-400 flex-shrink-0 mt-0.5" />
              ) : isFailure ? (
                <XCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
              ) : (
                <Clock className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <h2 className="text-lg font-bold text-white">
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
                <p className="text-slate-300 text-sm mt-1">
                  {isRTL ? 'رقم العملية:' : 'Charge ID:'} <code>{chargeId}</code>
                </p>
                {isSuccess && (
                  <p className="text-slate-300 text-sm mt-2">
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
          <div className="mb-6 bg-blue-500/10 border border-blue-500/30 text-blue-200 rounded-xl p-4 text-sm">
            {actionMessage}
          </div>
        )}

        {loading && (
          <div className="text-center py-16 text-slate-400">
            {isRTL ? 'جاري التحميل...' : 'Loading…'}
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-4">
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* Current subscription card */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 mb-8">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                    {isRTL ? 'الاشتراك الحالي' : 'Current subscription'}
                  </div>
                  {sub ? (
                    <h2 className="text-2xl font-bold text-white">
                      {isRTL
                        ? PLAN_LABELS[sub.plan]?.ar ?? sub.plan
                        : PLAN_LABELS[sub.plan]?.en ?? sub.plan}
                      {currentPlan && (
                        <span className="text-slate-400 text-base font-normal ml-3">
                          {currentPlan.price} {isRTL ? 'ريال/شهر' : 'SAR/month'}
                        </span>
                      )}
                    </h2>
                  ) : (
                    <h2 className="text-2xl font-bold text-white">
                      {isRTL ? 'لا يوجد اشتراك' : 'No subscription'}
                    </h2>
                  )}
                </div>
                {statusBadge && (
                  <span className={`text-xs font-medium border rounded-full px-3 py-1 ${statusBadge.cls}`}>
                    {statusBadge.label}
                  </span>
                )}
              </div>

              {sub ? (
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
              ) : null}

              {sub?.status === 'past_due' && (
                <div className="mt-5 flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 text-amber-200 rounded-lg px-4 py-3 text-sm">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    {isRTL
                      ? 'فشل تجديد البطاقة. سنحاول مرة أخرى تلقائياً. لتفادي انقطاع الخدمة، حدّث بطاقتك بترقية الخطة أدناه.'
                      : 'Your renewal payment failed — we’ll auto-retry, but updating your card now (via Change plan) is the fastest way to avoid losing access.'}
                  </div>
                </div>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                {sub?.status === 'cancelled' && new Date(sub.endDate) > new Date() && (
                  <button
                    onClick={handleResume}
                    disabled={resumeSubmitting}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-semibold disabled:opacity-60"
                  >
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
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-500/30 text-red-300 hover:bg-red-500/10 text-sm font-semibold"
                  >
                    {isRTL ? 'إلغاء الاشتراك' : 'Cancel subscription'}
                  </button>
                )}
              </div>
            </div>

            {/* Plan picker */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 mb-8">
              <h2 className="text-xl font-bold text-white mb-1">
                {sub ? (isRTL ? 'تغيير الخطة' : 'Change plan') : isRTL ? 'اختر خطة' : 'Choose a plan'}
              </h2>
              <p className="text-slate-400 text-sm mb-5">
                {isRTL
                  ? 'يتم تحديث الخطة فوراً وتُعتمد البطاقة الجديدة للتجديد التلقائي.'
                  : 'Plan change takes effect immediately. The new card is used for auto-renewal.'}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {PLANS.map((plan) => {
                  const Icon = plan.icon
                  const isCurrent = sub?.plan === plan.id && data.isActive
                  return (
                    <div
                      key={plan.id}
                      className={`rounded-xl border p-5 flex flex-col ${
                        isCurrent
                          ? 'border-purple-500 bg-purple-500/5'
                          : 'border-slate-700 bg-slate-900/30'
                      }`}
                    >
                      <div
                        className={`inline-flex p-2 rounded-lg mb-3 self-start ${
                          plan.color === 'blue'
                            ? 'bg-blue-500/20 text-blue-400'
                            : plan.color === 'purple'
                            ? 'bg-purple-500/20 text-purple-400'
                            : 'bg-yellow-500/20 text-yellow-400'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="text-lg font-bold text-white">
                        {isRTL ? plan.nameAr : plan.nameEn}
                      </div>
                      <div className="text-slate-400 text-xs mb-3">
                        {isRTL ? plan.descriptionAr : plan.descriptionEn}
                      </div>
                      <div className="flex items-baseline gap-1 mb-4">
                        <span className="text-2xl font-bold text-white">{plan.price}</span>
                        <span className="text-slate-500 text-xs">
                          {isRTL ? 'ريال/شهر' : 'SAR/mo'}
                        </span>
                      </div>
                      {isCurrent ? (
                        <button
                          disabled
                          className="mt-auto w-full py-2 rounded-lg bg-slate-700 text-slate-300 text-sm font-semibold cursor-default"
                        >
                          {isRTL ? 'خطتك الحالية' : 'Current plan'}
                        </button>
                      ) : (
                        <button
                          onClick={() => setUpgradePlan(plan)}
                          className="mt-auto w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold flex items-center justify-center gap-1"
                        >
                          {sub ? (isRTL ? 'انتقل إلى هذه الخطة' : 'Switch to this plan') : isRTL ? 'اشترك' : 'Subscribe'}
                          <ArrowRight className={`w-3.5 h-3.5 ${isRTL ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Payment history */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
              <h2 className="text-xl font-bold text-white mb-4">
                {isRTL ? 'سجل المدفوعات' : 'Payment history'}
              </h2>
              {data.payments.length === 0 ? (
                <p className="text-slate-400 text-sm">
                  {isRTL ? 'لا توجد مدفوعات بعد.' : 'No payments yet.'}
                </p>
              ) : (
                <div className="divide-y divide-slate-700">
                  {data.payments.map((p) => (
                    <div key={p.id} className="py-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <CreditCard className="w-4 h-4 text-slate-500 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm text-white truncate">
                            {p.description || p.plan || 'Subscription'}
                            {p.kind && p.kind !== 'initial' && (
                              <span className="ml-2 text-[10px] uppercase text-slate-500 tracking-wider">
                                {p.kind}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500">
                            {new Date(p.createdAt).toLocaleString(isRTL ? 'ar-SA' : 'en-US')}
                            {p.cardBrand && p.lastFour && (
                              <span className="ml-2">
                                · {p.cardBrand} •••• {p.lastFour}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-end flex-shrink-0">
                        <div className="text-sm text-white font-medium">
                          {(p.amount / 100).toFixed(2)} {p.currency}
                        </div>
                        <div
                          className={`text-xs ${
                            p.status === 'paid'
                              ? 'text-green-400'
                              : p.status === 'failed' || p.status === 'cancelled'
                              ? 'text-red-400'
                              : 'text-slate-400'
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
          </>
        )}
      </div>

      {/* Upgrade modal */}
      {upgradePlan && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setUpgradePlan(null)}
        >
          <div
            className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-md p-6 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute top-4 end-4 text-slate-400 hover:text-white"
              onClick={() => setUpgradePlan(null)}
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-4">
              <h3 className="text-xl font-bold text-white">
                {sub ? (isRTL ? 'تغيير إلى ' : 'Switch to ') : isRTL ? 'الاشتراك في ' : 'Subscribe to '}
                {isRTL ? upgradePlan.nameAr : upgradePlan.nameEn}
              </h3>
              <p className="text-slate-400 text-sm mt-1">
                {isRTL
                  ? `${upgradePlan.price} ريال شهرياً • تجديد تلقائي • يمكنك الإلغاء في أي وقت`
                  : `${upgradePlan.price} SAR / month • auto-renews • cancel anytime`}
              </p>
            </div>

            <TapCardForm
              amount={upgradePlan.price}
              currency="SAR"
              customer={{ userId: user?.userId, email: user?.email }}
              isRTL={isRTL}
              submitLabel={
                sub
                  ? isRTL
                    ? `أكّد التغيير — ${upgradePlan.price} ريال`
                    : `Confirm switch — ${upgradePlan.price} SAR`
                  : undefined
              }
              onTokenized={handleUpgradeTokenized}
            />
          </div>
        </div>
      )}

      {/* Cancel confirm modal */}
      {showCancelConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => !cancelSubmitting && setShowCancelConfirm(false)}
        >
          <div
            className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-white">
              {isRTL ? 'هل أنت متأكد من الإلغاء؟' : 'Cancel subscription?'}
            </h3>
            <p className="text-slate-300 text-sm mt-3">
              {isRTL
                ? `ستظل لديك صلاحية كاملة حتى ${sub ? new Date(sub.endDate).toLocaleDateString('ar-SA') : ''}، ثم سيتوقف الوصول. لن نحاسبك مرة أخرى.`
                : `You’ll keep full access until ${sub ? new Date(sub.endDate).toLocaleDateString('en-US') : ''}, then it’ll be turned off. You won’t be charged again.`}
            </p>
            <div className="mt-5 flex gap-2 justify-end">
              <button
                onClick={() => setShowCancelConfirm(false)}
                disabled={cancelSubmitting}
                className="px-4 py-2 text-sm border border-slate-600 rounded-lg text-slate-200 hover:bg-slate-700"
              >
                {isRTL ? 'تراجع' : 'Keep subscription'}
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelSubmitting}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold disabled:opacity-60"
              >
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

function Field({
  label,
  value,
  valueClass = 'text-white',
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div>
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={`text-base font-medium mt-1 ${valueClass}`}>{value}</div>
    </div>
  )
}
