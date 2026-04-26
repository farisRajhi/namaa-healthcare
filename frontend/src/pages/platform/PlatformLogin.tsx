import { FormEvent, useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Globe, ShieldCheck } from 'lucide-react'
import { usePlatformAuth } from '../../context/PlatformAuthContext'
import { getErrorMessage } from '../../lib/api'
import i18n from '../../i18n'

export default function PlatformLogin() {
  const { t } = useTranslation()
  const { login, isAuthenticated } = usePlatformAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const isRTL = i18n.language === 'ar'

  if (isAuthenticated) {
    return <Navigate to="/platform" replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/platform', { replace: true })
    } catch (err) {
      const msg = getErrorMessage(err)
      setError(isRTL ? msg.ar : msg.en)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-healthcare-bg p-6"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <form
        onSubmit={handleSubmit}
        aria-busy={submitting}
        className="w-full max-w-sm card p-8 space-y-5"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary-500 text-white flex items-center justify-center shadow-btn">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-healthcare-muted font-semibold">
                {t('platform.brand')}
              </div>
              <h1 className="font-heading text-xl font-semibold text-healthcare-text leading-tight">
                {t('platform.title')}
              </h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => i18n.changeLanguage(isRTL ? 'en' : 'ar')}
            aria-label={isRTL ? 'Switch to English' : 'التبديل إلى العربية'}
            className="text-xs text-healthcare-muted hover:text-primary-600 inline-flex items-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 rounded"
          >
            <Globe className="w-3.5 h-3.5" aria-hidden="true" />
            {t('platform.auth.switchLang')}
          </button>
        </div>

        <p className="text-sm text-healthcare-muted">{t('platform.tagline')}</p>

        <div>
          <label htmlFor="platform-email" className="block text-sm font-medium text-healthcare-text mb-1.5">
            {t('platform.auth.email')}
          </label>
          <input
            id="platform-email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-describedby={error ? 'platform-login-error' : undefined}
            className="w-full bg-white border border-healthcare-border rounded-lg px-3 py-2.5 text-sm text-healthcare-text focus:outline-none focus:ring-[3px] focus:ring-primary-400 focus:border-primary-500 transition-colors"
            dir="ltr"
          />
        </div>

        <div>
          <label htmlFor="platform-password" className="block text-sm font-medium text-healthcare-text mb-1.5">
            {t('platform.auth.password')}
          </label>
          <input
            id="platform-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={error ? 'platform-login-error' : undefined}
            className="w-full bg-white border border-healthcare-border rounded-lg px-3 py-2.5 text-sm text-healthcare-text focus:outline-none focus:ring-[3px] focus:ring-primary-400 focus:border-primary-500 transition-colors"
            dir="ltr"
          />
        </div>

        {error && (
          <div id="platform-login-error" role="alert" className="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button type="submit" disabled={submitting} aria-busy={submitting} className="btn-primary w-full focus-visible:ring-2 focus-visible:ring-primary-400">
          {submitting ? t('platform.auth.signingIn') : t('platform.auth.signIn')}
        </button>
      </form>
    </div>
  )
}
