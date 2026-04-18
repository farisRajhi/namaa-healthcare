import { useEffect, useRef, useState } from 'react'
import { TapCard, tokenize, Currencies, Direction, Edges, Locale, Theme } from '@tap-payments/card-sdk'
import { Lock } from 'lucide-react'

const TAP_PUBLIC_KEY = import.meta.env.VITE_TAP_PUBLIC_KEY || ''
const TAP_MERCHANT_ID = import.meta.env.VITE_TAP_MERCHANT_ID || ''

interface TapCardFormProps {
  amount: number
  currency?: keyof typeof Currencies
  customer: { userId?: string; email?: string; firstName?: string }
  isRTL?: boolean
  /** Submit button label override. */
  submitLabel?: string
  /** Disable the submit button externally (e.g. while parent is processing). */
  disabled?: boolean
  /**
   * Called with the tokenized card id when the user submits.
   * The parent is responsible for sending it to the backend and handling redirect/result.
   */
  onTokenized: (tokenId: string) => Promise<void> | void
  /** Called when an external token request fails (so parent can clear loading state). */
  onError?: (message: string) => void
}

/**
 * Tap card iframe + tokenize button. Reused from /pricing and /billing upgrade modal.
 * Configuration is gated on VITE_TAP_PUBLIC_KEY — renders an inline error if missing.
 */
export default function TapCardForm({
  amount,
  currency = 'SAR',
  customer,
  isRTL = false,
  submitLabel,
  disabled = false,
  onTokenized,
  onError,
}: TapCardFormProps) {
  const [cardReady, setCardReady] = useState(false)
  const [cardValid, setCardValid] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tokenResolver = useRef<((tok: string) => void) | null>(null)
  const tokenRejecter = useRef<((err: Error) => void) | null>(null)

  useEffect(() => {
    setCardReady(false)
    setCardValid(false)
    setError(null)
  }, [amount, currency])

  if (!TAP_PUBLIC_KEY) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm">
        {isRTL
          ? 'خدمة الدفع غير مهيأة. يرجى التواصل مع الدعم.'
          : 'Payment gateway is not configured. Please contact support.'}
      </div>
    )
  }

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
        setTimeout(() => reject(new Error('Tokenization timed out')), 20000)
      })
      await onTokenized(tokenId)
    } catch (err: any) {
      reportError(err?.message || 'Payment failed')
    } finally {
      tokenResolver.current = null
      tokenRejecter.current = null
      setSubmitting(false)
    }
  }

  const formattedSubmit =
    submitLabel ??
    (isRTL ? `ادفع ${amount} ${currency === 'SAR' ? 'ريال' : currency}` : `Pay ${amount} ${currency}`)

  return (
    <div>
      <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-700">
        <TapCard
          publicKey={TAP_PUBLIC_KEY}
          merchant={TAP_MERCHANT_ID ? { id: TAP_MERCHANT_ID } : undefined}
          transaction={{
            amount,
            currency: Currencies[currency],
          }}
          customer={{
            id: customer.userId,
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
          fields={{ cardHolder: true }}
          addons={{ displayPaymentBrands: true, loader: true, saveCard: false }}
          interface={{
            locale: isRTL ? Locale.AR : Locale.EN,
            theme: Theme.DARK,
            edges: Edges.CURVED,
            direction: isRTL ? Direction.RTL : Direction.LTR,
          }}
          onReady={() => setCardReady(true)}
          onValidInput={() => setCardValid(true)}
          onInvalidInput={() => setCardValid(false)}
          onError={(data: any) => {
            const msg = data?.message || 'Card error'
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

      {error && (
        <div className="mt-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={handlePay}
        disabled={!cardReady || !cardValid || submitting || disabled}
        className="mt-4 w-full py-3 px-6 rounded-xl font-bold text-white bg-purple-600 hover:bg-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

      <p className="text-slate-500 text-xs text-center mt-3">
        {isRTL ? 'يتم معالجة الدفع بأمان عبر Tap Payments' : 'Payments processed securely by Tap Payments'}
      </p>
    </div>
  )
}
