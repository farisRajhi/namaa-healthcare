import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import {
  TapCard,
  tokenize,
  Currencies,
  Direction,
  Edges,
  Locale,
  Theme,
} from '@tap-payments/card-sdk'
import { Lock, AlertTriangle, Mail } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'

interface TapConfig {
  enabled: boolean
  publicKey: string
  merchantId: string
}

const ENV_PUBLIC_KEY = import.meta.env.VITE_TAP_PUBLIC_KEY || ''
const ENV_MERCHANT_ID = import.meta.env.VITE_TAP_MERCHANT_ID || ''

export interface TapFormState {
  ready: boolean
  valid: boolean
  submitting: boolean
}

export interface TapCardFormHandle {
  submit: () => Promise<void>
}

interface TapCardFormProps {
  amount: number
  currency?: keyof typeof Currencies
  customer: { userId?: string; email?: string; firstName?: string }
  isRTL?: boolean
  submitLabel?: string
  disabled?: boolean
  /** When true, the internal Pay button is not rendered — parent drives submit via ref. */
  hideDefaultSubmit?: boolean
  onTokenized: (tokenId: string) => Promise<void> | void
  onError?: (message: string) => void
  /** Fires whenever ready/valid/submitting change — lets the parent render its own CTA. */
  onStateChange?: (state: TapFormState) => void
}

const TapCardForm = forwardRef<TapCardFormHandle, TapCardFormProps>(function TapCardForm(
  {
    amount,
    currency = 'SAR',
    customer,
    isRTL = false,
    submitLabel,
    disabled = false,
    hideDefaultSubmit = false,
    onTokenized,
    onError,
    onStateChange,
  },
  ref,
) {
  const { t } = useTranslation()
  const [cardReady, setCardReady] = useState(false)
  const [cardValid, setCardValid] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [config, setConfig] = useState<TapConfig | null>(
    ENV_PUBLIC_KEY ? { enabled: true, publicKey: ENV_PUBLIC_KEY, merchantId: ENV_MERCHANT_ID } : null,
  )
  const [configChecked, setConfigChecked] = useState(false)
  const tokenResolver = useRef<((tok: string) => void) | null>(null)
  const tokenRejecter = useRef<((err: Error) => void) | null>(null)
  const hasInteracted = useRef(false)

  useEffect(() => {
    setCardReady(false)
    setCardValid(false)
    setError(null)
    hasInteracted.current = false
  }, [amount, currency])

  useEffect(() => {
    onStateChange?.({ ready: cardReady, valid: cardValid, submitting })
  }, [cardReady, cardValid, submitting, onStateChange])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.get<TapConfig>('/api/payments/config')
        if (!cancelled) setConfig(res.data)
      } catch {
        // Keep optimistic env config on network/auth error.
      } finally {
        if (!cancelled) setConfigChecked(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const reportError = (msg: string) => {
    setError(msg)
    onError?.(msg)
  }

  const handlePay = async () => {
    if (submitting || disabled) return
    setError(null)
    setSubmitting(true)
    try {
      const tokenId = await new Promise<string>((resolve, reject) => {
        tokenResolver.current = resolve
        tokenRejecter.current = reject
        tokenize()
        setTimeout(() => reject(new Error(t('billing.errors.timeout'))), 20000)
      })
      await onTokenized(tokenId)
    } catch (err: any) {
      const code: string | undefined = err?.response?.data?.code
      const serverMessage: string | undefined =
        err?.response?.data?.message || err?.response?.data?.error
      const localized = code ? t(`billing.errors.${code}`, { defaultValue: '' }) : ''
      reportError(localized || serverMessage || err?.message || t('billing.errors.unknown'))
    } finally {
      tokenResolver.current = null
      tokenRejecter.current = null
      setSubmitting(false)
    }
  }

  useImperativeHandle(ref, () => ({ submit: handlePay }), [submitting, disabled])

  if (!configChecked && !config) {
    return (
      <div className="flex items-center justify-center py-10 text-healthcare-muted text-sm">
        <span className="inline-flex items-center gap-2">
          <span className="w-3.5 h-3.5 border-2 border-healthcare-border border-t-primary-500 rounded-full animate-spin" />
          {isRTL ? 'جاري التحضير...' : 'Preparing payment form…'}
        </span>
      </div>
    )
  }

  if (config && !config.enabled) {
    return (
      <div className="bg-warning-50 border border-warning-200 text-warning-900 rounded-xl p-4 text-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-warning-600" />
          <div className="flex-1">
            <div className="font-semibold mb-1">{t('billing.unavailable.title')}</div>
            <p className="text-warning-800 mb-3">{t('billing.unavailable.message')}</p>
            <a
              href="mailto:support@tawafud.ai"
              className="inline-flex items-center gap-1.5 text-warning-900 font-semibold underline-offset-2 hover:underline"
            >
              <Mail className="w-3.5 h-3.5" />
              {t('billing.unavailable.contact')}
            </a>
          </div>
        </div>
      </div>
    )
  }

  const publicKey = config?.publicKey || ENV_PUBLIC_KEY
  const merchantId = config?.merchantId || ENV_MERCHANT_ID

  if (!publicKey) {
    return (
      <div className="bg-warning-50 border border-warning-200 text-warning-900 rounded-xl p-4 text-sm">
        <div className="font-semibold mb-1">{t('billing.unavailable.title')}</div>
        <p>{t('billing.unavailable.message')}</p>
      </div>
    )
  }

  const formattedSubmit =
    submitLabel ??
    (isRTL ? `ادفع ${amount} ${currency === 'SAR' ? 'ريال' : currency}` : `Pay ${amount} ${currency}`)

  return (
    <div>
      <div
        className="relative min-h-[200px]"
        aria-busy={!cardReady}
      >
        {!cardReady && <CardFieldsSkeleton isRTL={isRTL} />}
        <div
          className={[
            'relative transition-opacity duration-300',
            cardReady ? 'opacity-100' : 'opacity-0 pointer-events-none',
          ].join(' ')}
        >
          <TapCard
          publicKey={publicKey}
          merchant={merchantId ? { id: merchantId } : undefined}
          transaction={{
            amount,
            currency: Currencies[currency],
          }}
          customer={{
            name: [
              {
                lang: isRTL ? Locale.AR : Locale.EN,
                first: customer.firstName || customer.email?.split('@')[0] || 'Customer',
                last: '',
              },
            ],
            editable: true,
            contact: { email: customer.email },
          }}
          acceptance={{
            supportedBrands: ['VISA', 'MASTERCARD', 'MADA', 'AMEX'],
            supportedCards: ['CREDIT', 'DEBIT'],
          }}
          fields={{ cardHolder: false }}
          addons={{ displayPaymentBrands: true, loader: false, saveCard: false }}
          interface={{
            locale: isRTL ? Locale.AR : Locale.EN,
            theme: Theme.LIGHT,
            edges: Edges.STRAIGHT,
            direction: isRTL ? Direction.RTL : Direction.LTR,
          }}
          onReady={() => setCardReady(true)}
          onValidInput={() => {
            hasInteracted.current = true
            setCardValid(true)
          }}
          onInvalidInput={() => {
            hasInteracted.current = true
            setCardValid(false)
          }}
          onError={(data: any) => {
            console.error('[TapCardForm] Tap SDK error', data)
            try {
              console.error('[TapCardForm] Tap SDK error (expanded)', JSON.stringify(data, null, 2))
            } catch {
              // circular refs — ignore
            }
            const firstSubError = Array.isArray(data?.errors) ? data.errors[0] : undefined
            const sdkMessage: string | undefined =
              data?.message ||
              data?.description ||
              firstSubError?.message ||
              firstSubError?.description
            const sdkCode: string | undefined =
              data?.code || data?.kind || firstSubError?.code || firstSubError?.kind
            const shouldSurface =
              hasInteracted.current || !!tokenRejecter.current || !!sdkMessage
            if (!shouldSurface) return
            const msg =
              sdkMessage ||
              (sdkCode
                ? `${t('billing.errors.invalid_card')} (${sdkCode})`
                : t('billing.errors.invalid_card'))
            reportError(msg)
            if (tokenRejecter.current) {
              tokenRejecter.current(new Error(msg))
              tokenResolver.current = null
              tokenRejecter.current = null
            }
          }}
          onSuccess={(data: any) => {
            const id = data?.id || data?.token?.id || data?.tokenId
            if (id && tokenResolver.current) {
              tokenResolver.current(id)
              tokenResolver.current = null
              tokenRejecter.current = null
            }
          }}
        />
        </div>
      </div>

      {error && !hideDefaultSubmit && (
        <div
          role="alert"
          className="mt-3 bg-danger-50 border border-danger-200 text-danger-700 rounded-lg px-3 py-2 text-sm"
        >
          {error}
        </div>
      )}

      {!hideDefaultSubmit && (
        <>
          <button
            onClick={handlePay}
            disabled={!cardReady || !cardValid || submitting || disabled}
            className="btn-primary w-full mt-4"
          >
            {submitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {isRTL ? 'جاري المعالجة...' : 'Processing...'}
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                {formattedSubmit}
              </>
            )}
          </button>

          <p className="text-healthcare-muted text-xs text-center mt-3">
            {isRTL
              ? 'يتم معالجة الدفع بأمان عبر Tap Payments'
              : 'Payments processed securely by Tap Payments'}
          </p>
        </>
      )}
    </div>
  )
})

export default TapCardForm

function CardFieldsSkeleton({ isRTL }: { isRTL: boolean }) {
  return (
    <div
      className="absolute inset-0 flex flex-col gap-3 px-1 pt-1 animate-pulse"
      aria-hidden
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <SkeletonField label={isRTL ? 'رقم البطاقة' : 'Card number'} wide />
      <div className="flex gap-3">
        <SkeletonField label={isRTL ? 'تاريخ الانتهاء' : 'Expiry'} />
        <SkeletonField label={isRTL ? 'رمز التحقق' : 'CVC'} />
      </div>
    </div>
  )
}

function SkeletonField({ label, wide }: { label: string; wide?: boolean }) {
  return (
    <div className={wide ? 'w-full' : 'flex-1'}>
      <div className="h-2.5 w-20 rounded bg-healthcare-border/40 mb-1.5" aria-hidden />
      <div className="h-10 rounded-md border border-healthcare-border/50 bg-healthcare-bg/60 flex items-center px-3">
        <span className="sr-only">{label}</span>
        <span className="h-2 w-24 rounded bg-healthcare-border/35" aria-hidden />
      </div>
    </div>
  )
}

