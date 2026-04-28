// @ts-nocheck
// HIDDEN: billing UI — re-enable when subscriptions return.
// File kept on disk; not imported anywhere while billing is hidden.
import { useRef, useState } from 'react'

import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Lock,
  Shield,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import TapCardForm, {
  type TapCardFormHandle,
  type TapFormState,
} from '../components/billing/TapCardForm'
import { getPlan, type Plan, type PlanId } from '../config/plans'

const PLAN_IDS = new Set<PlanId>(['starter', 'professional', 'enterprise'])

export default function BillingCheckout() {
  const { planId } = useParams<{ planId: string }>()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const isRTL = i18n.language === 'ar'
  const { user } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [formState, setFormState] = useState<TapFormState>({
    ready: false,
    valid: false,
    submitting: false,
  })
  const formRef = useRef<TapCardFormHandle>(null)

  const plan: Plan | null =
    planId && PLAN_IDS.has(planId as PlanId) ? getPlan(planId as PlanId) : null

  if (!plan) {
    return (
      <div
        dir={isRTL ? 'rtl' : 'ltr'}
        className="min-h-screen bg-healthcare-bg flex items-center justify-center p-6"
      >
        <div className="max-w-md w-full bg-white border border-healthcare-border/40 rounded-2xl p-8 text-center shadow-sm">
          <h1 className="font-heading text-xl font-semibold text-healthcare-text mb-2">
            {isRTL ? 'الخطة غير موجودة' : 'Plan not found'}
          </h1>
          <p className="text-healthcare-muted text-sm mb-5">
            {isRTL
              ? 'لم نتعرّف على الخطة المطلوبة. اختر خطة من صفحة الأسعار.'
              : 'We could not find that plan. Pick a plan from the pricing page.'}
          </p>
          <Link to="/pricing" className="btn-primary inline-flex w-full justify-center">
            {isRTL ? 'الذهاب للأسعار' : 'Go to pricing'}
          </Link>
        </div>
      </div>
    )
  }

  const isUpgrade = !!user?.subscription?.hasPaidActive
  const planName = t(`pricing.plans.${plan.id}.name`, { defaultValue: plan.id })
  const planDescription = t(`pricing.plans.${plan.id}.description`, { defaultValue: '' })
  const rawFeatures = t(plan.featuresKey, { returnObjects: true, defaultValue: [] })
  const features = Array.isArray(rawFeatures) ? (rawFeatures as string[]) : []
  const priceLabel = isRTL ? 'ر.س' : 'SAR'
  const BackArrow = isRTL ? ArrowRight : ArrowLeft

  const headline = isUpgrade
    ? isRTL ? 'ترقية اشتراكك' : 'Upgrade your subscription'
    : isRTL ? 'إتمام الاشتراك' : 'Complete your subscription'
  const subhead = isUpgrade
    ? isRTL ? `التحويل إلى خطة ${planName}` : `Switching to the ${planName} plan`
    : isRTL ? `أنت على بُعد خطوة من تفعيل ${planName}` : `You're one step away from activating ${planName}`

  const canPay = formState.ready && formState.valid && !formState.submitting

  const payButtonLabel = formState.submitting
    ? isRTL ? 'جاري المعالجة...' : 'Processing...'
    : isUpgrade
      ? isRTL ? 'تأكيد وترقية الخطة' : 'Confirm & upgrade'
      : isRTL ? 'إتمام الدفع' : 'Pay now'

  async function handleTokenized(tokenId: string) {
    if (!plan) return
    const endpoint = isUpgrade ? '/api/subscription/upgrade' : '/api/payments/create'
    try {
      const response = await api.post(endpoint, {
        plan: plan.id,
        tokenId,
        callbackUrl: `${window.location.origin}/billing?payment=callback&plan=${plan.id}`,
      })
      const result = response.data as {
        transactionUrl?: string
        chargeId: string
        status: string
      }
      if (result.transactionUrl) {
        const url = new URL(result.transactionUrl)
        if (url.protocol === 'https:' && url.hostname.endsWith('.tap.company')) {
          window.location.href = result.transactionUrl
          return
        }
        throw new Error('Invalid payment redirect URL')
      }
      navigate(`/billing?chargeId=${encodeURIComponent(result.chargeId)}`)
    } catch (err: any) {
      const code: string | undefined = err?.response?.data?.code
      const message: string | undefined =
        err?.response?.data?.message || err?.response?.data?.error
      const localized = code ? t(`billing.errors.${code}`, { defaultValue: '' }) : ''
      const final = localized || message || err?.message || t('billing.errors.unknown')
      setError(final)
      throw new Error(final)
    }
  }

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      className={`min-h-screen bg-gradient-to-b from-primary-50/50 via-healthcare-bg to-healthcare-bg ${isRTL ? 'rtl' : 'ltr'}`}
    >
      <header className="sticky top-0 z-20 border-b border-healthcare-border/40 bg-white/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            to={isUpgrade ? '/billing?tab=plans' : '/pricing'}
            className="inline-flex items-center gap-1.5 text-sm text-healthcare-muted hover:text-healthcare-text transition-colors rounded px-2 py-1.5 -mx-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <BackArrow className="w-4 h-4" />
            {isRTL ? 'رجوع' : 'Back'}
          </Link>
          <span className="font-heading font-semibold text-healthcare-text">
            {isRTL ? 'توافد' : 'Tawafud'}
          </span>
          <div className="inline-flex items-center gap-1.5 text-xs text-healthcare-muted">
            <ShieldCheck className="w-3.5 h-3.5 text-success-600" />
            <span className="hidden sm:inline">
              {isRTL ? 'دفع آمن' : 'Secure checkout'}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 lg:py-12">
        <div className="mb-8 lg:mb-10">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary-700 bg-primary-50 border border-primary-100 rounded-full px-2.5 py-1 mb-3">
            <Sparkles className="w-3 h-3" />
            {isUpgrade
              ? isRTL ? 'ترقية الاشتراك' : 'Plan upgrade'
              : isRTL ? 'اشتراك جديد' : 'New subscription'}
          </div>
          <h1 className="font-heading text-3xl lg:text-4xl font-semibold text-healthcare-text tracking-tight">
            {headline}
          </h1>
          <p className="mt-2 text-healthcare-muted text-base max-w-xl">{subhead}</p>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_400px] gap-6 lg:gap-8 items-start">
          <section className="space-y-5 min-w-0">
            <StepCard
              step={1}
              title={isRTL ? 'الحساب' : 'Account'}
              subtitle={isRTL ? 'ستُرتبط فاتورتك بهذا الحساب' : 'Your invoice will be linked to this account'}
              complete
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-healthcare-text font-medium truncate">
                    {user?.email || '—'}
                  </p>
                  {user?.org?.name && (
                    <p className="text-healthcare-muted text-sm truncate mt-0.5">
                      {user.org.name}
                    </p>
                  )}
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success-700 bg-success-50 border border-success-200 rounded-full px-2.5 py-1 flex-shrink-0">
                  <Check className="w-3 h-3" />
                  {isRTL ? 'مسجَّل الدخول' : 'Signed in'}
                </span>
              </div>
            </StepCard>

            <StepCard
              step={2}
              title={isRTL ? 'طريقة الدفع' : 'Payment method'}
              subtitle={isRTL ? 'بطاقة ائتمان أو مدى' : 'Credit, debit or mada card'}
              headerAction={
                <div className="hidden sm:flex items-center gap-1.5">
                  <CardBrandBadge label="VISA" />
                  <CardBrandBadge label="MC" />
                  <CardBrandBadge label="mada" />
                  <CardBrandBadge label="AMEX" />
                </div>
              }
            >
              <div className="space-y-4">
                <div className="sm:hidden flex items-center gap-1.5">
                  <CardBrandBadge label="VISA" />
                  <CardBrandBadge label="MC" />
                  <CardBrandBadge label="mada" />
                  <CardBrandBadge label="AMEX" />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-healthcare-text uppercase tracking-[0.06em]">
                      {isRTL ? 'بيانات البطاقة' : 'Card information'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-healthcare-muted">
                      <Lock className="w-3 h-3 text-success-600" />
                      {isRTL ? 'مشفّر من طرف لطرف' : 'End-to-end encrypted'}
                    </span>
                  </div>

                  <div className="rounded-xl border border-healthcare-border/70 bg-white p-3 sm:p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_1px_2px_rgba(16,24,40,0.04)]">
                    <div className="max-w-[340px]">
                      <TapCardForm
                        ref={formRef}
                        amount={plan.priceSar}
                        currency="SAR"
                        customer={{ userId: user?.userId, email: user?.email }}
                        isRTL={isRTL}
                        hideDefaultSubmit
                        onTokenized={handleTokenized}
                        onError={setError}
                        onStateChange={setFormState}
                      />
                    </div>
                  </div>

                  <p className="mt-2.5 text-xs text-healthcare-muted flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-success-600 flex-shrink-0" />
                    {isRTL
                      ? 'لن يتم تخزين رقم بطاقتك — المعالجة تتم عبر Tap Payments.'
                      : 'Your card is never stored — processing is handled by Tap Payments.'}
                  </p>
                </div>
              </div>
            </StepCard>

            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-healthcare-muted pt-1">
              <TrustItem icon={<Lock className="w-3.5 h-3.5 text-success-600" />}
                label={isRTL ? 'مؤمَّن عبر Tap Payments' : 'Secured by Tap Payments'} />
              <TrustItem icon={<Shield className="w-3.5 h-3.5 text-primary-600" />}
                label={isRTL ? 'متوافق مع PCI DSS' : 'PCI DSS compliant'} />
              <TrustItem icon={<span className="w-1.5 h-1.5 rounded-full bg-healthcare-muted/60" />}
                label={isRTL ? 'لا نحتفظ ببيانات بطاقتك' : 'We never store your card'} />
            </div>
          </section>

          <aside className="lg:sticky lg:top-20">
            <div className="bg-white rounded-2xl border border-healthcare-border/40 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_24px_-4px_rgba(16,24,40,0.08)] overflow-hidden">
              <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-healthcare-border/30 flex items-center justify-between gap-3">
                <h2 className="font-heading text-base font-semibold text-healthcare-text">
                  {isRTL ? 'ملخص الطلب' : 'Order summary'}
                </h2>
                <span className="text-[11px] font-medium text-healthcare-muted">
                  {isRTL ? 'اشتراك شهري' : 'Monthly plan'}
                </span>
              </div>

              <div className="px-5 sm:px-6 py-5">
                <div className="rounded-xl bg-gradient-to-br from-primary-50 via-primary-50/60 to-white border border-primary-100 p-4 mb-5">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <p className="font-heading font-semibold text-healthcare-text">
                      {planName}
                    </p>
                    {plan.popular && (
                      <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide text-primary-700 bg-white border border-primary-200 rounded-full px-2 py-0.5 flex-shrink-0">
                        {t('pricing.popular', { defaultValue: 'Most popular' })}
                      </span>
                    )}
                  </div>
                  {planDescription && (
                    <p className="text-xs text-healthcare-muted mb-3">{planDescription}</p>
                  )}
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-heading text-[28px] leading-none font-semibold text-healthcare-text tabular-nums">
                      {plan.priceSar}
                    </span>
                    <span className="text-xs text-healthcare-muted font-medium">
                      {priceLabel} {isRTL ? '/ شهريّاً' : '/ month'}
                    </span>
                  </div>
                </div>

                {features.length > 0 && (
                  <ul className="space-y-2 mb-5">
                    {features.slice(0, 4).map((f, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-[13px] text-healthcare-muted leading-relaxed"
                      >
                        <Check className="w-3.5 h-3.5 text-success-600 flex-shrink-0 mt-[3px]" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="border-t border-healthcare-border/40 pt-4 space-y-2">
                  <Row
                    label={isRTL ? 'المجموع الفرعي' : 'Subtotal'}
                    value={`${plan.priceSar} ${priceLabel}`}
                  />
                  <div className="flex items-center justify-between text-xs text-healthcare-muted">
                    <span>{isRTL ? 'ضريبة القيمة المضافة شاملة' : 'VAT included'}</span>
                    <span aria-hidden>—</span>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-healthcare-border/40">
                    <span className="font-heading font-semibold text-healthcare-text">
                      {isRTL ? 'الإجمالي اليوم' : 'Total due today'}
                    </span>
                    <span className="font-heading font-semibold text-healthcare-text text-lg tabular-nums">
                      {plan.priceSar} {priceLabel}
                    </span>
                  </div>
                </div>
              </div>

              <div className="px-5 sm:px-6 pb-5 pt-1 space-y-3 border-t border-healthcare-border/30 bg-healthcare-bg/50">
                {error && (
                  <div
                    role="alert"
                    className="rounded-lg border border-danger-200 bg-danger-50 text-danger-700 text-sm px-3 py-2"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => formRef.current?.submit()}
                  disabled={!canPay}
                  aria-busy={formState.submitting}
                  className={[
                    'w-full min-h-[48px] rounded-xl font-heading font-semibold text-white',
                    'inline-flex items-center justify-center gap-2 px-4 py-3',
                    'transition-all duration-150 ease-out',
                    'bg-gradient-to-b from-primary-600 to-primary-700 shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_2px_6px_rgba(30,64,175,0.25)]',
                    'hover:brightness-[1.04] active:brightness-[0.98] active:translate-y-[0.5px]',
                    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-300/60',
                    'disabled:bg-none disabled:bg-healthcare-border/70 disabled:text-white/80 disabled:shadow-none disabled:cursor-not-allowed',
                  ].join(' ')}
                >
                  {formState.submitting ? (
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Lock className="w-4 h-4" />
                  )}
                  <span>{payButtonLabel}</span>
                  {!formState.submitting && (
                    <span className="tabular-nums opacity-95">
                      · {plan.priceSar} {priceLabel}
                    </span>
                  )}
                </button>

                {!formState.ready && (
                  <p className="text-center text-[11px] text-healthcare-muted">
                    {isRTL ? 'جاري تحميل نموذج البطاقة...' : 'Loading card form…'}
                  </p>
                )}
                {formState.ready && !formState.valid && !formState.submitting && (
                  <p className="text-center text-[11px] text-healthcare-muted">
                    {isRTL ? 'أكمل بيانات البطاقة لتفعيل الدفع' : 'Enter card details to continue'}
                  </p>
                )}

                <p className="text-center text-[11px] text-healthcare-muted leading-relaxed">
                  {isRTL
                    ? 'بالمتابعة، أنت توافق على الاشتراك الشهري المتجدد تلقائياً. يمكنك الإلغاء في أي وقت.'
                    : 'By continuing you agree to a monthly auto-renewing subscription. Cancel anytime.'}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}

function StepCard({
  step,
  title,
  subtitle,
  complete,
  headerAction,
  children,
}: {
  step: number
  title: string
  subtitle?: string
  complete?: boolean
  headerAction?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-2xl border border-healthcare-border/40 shadow-sm overflow-hidden">
      <header className="px-5 sm:px-6 py-4 border-b border-healthcare-border/30 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={[
              'inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold flex-shrink-0',
              complete
                ? 'bg-success-50 text-success-700 ring-1 ring-success-200'
                : 'bg-primary-50 text-primary-700 ring-1 ring-primary-200',
            ].join(' ')}
            aria-hidden
          >
            {complete ? <Check className="w-3.5 h-3.5" /> : step}
          </span>
          <div className="min-w-0">
            <h2 className="font-heading text-[15px] font-semibold text-healthcare-text truncate">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-healthcare-muted truncate mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        {headerAction}
      </header>
      <div className="px-5 sm:px-6 py-5">{children}</div>
    </section>
  )
}

function CardBrandBadge({ label }: { label: string }) {
  return (
    <span className="text-[10px] font-semibold tracking-wider text-healthcare-muted bg-white border border-healthcare-border/60 rounded-md px-1.5 py-1 leading-none shadow-sm">
      {label}
    </span>
  )
}

function TrustItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      {label}
    </span>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-healthcare-muted">{label}</span>
      <span className="text-healthcare-text tabular-nums">{value}</span>
    </div>
  )
}

