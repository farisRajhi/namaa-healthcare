import { Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function NotActivatedOverlay() {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md w-full rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
          <Lock className="h-7 w-7 text-amber-700" />
        </div>
        <h2 className="mt-5 text-xl font-bold text-amber-900">
          {t('activation.title', 'Your account is awaiting activation')}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-amber-800">
          {t(
            'activation.body',
            'A Tawafud team member will activate your clinic shortly. Once activated, all features will unlock.',
          )}
        </p>
        <p className="mt-4 text-xs text-amber-700">
          {t('activation.contactCta', 'Need help? Contact Tawafud support.')}
        </p>
      </div>
    </div>
  )
}
