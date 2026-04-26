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
            className="text-xs text-healthcare-muted hover:text-primary-600 inline-flex items-center gap-1 transition-colors"
          >
            <Globe className="w-3.5 h-3.5" />
            {t('platform.auth.switchLang')}
          </button>
        </div>

        <p className="text-sm text-healthcare-muted">{t('platform.tagline')}</p>

        <div>
          <label className="block text-sm font-medium text-healthcare-text mb-1.5">
            {t('platform.auth.email')}
          </label>
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-white border border-healthcare-border rounded-lg px-3 py-2.5 text-sm text-healthcare-text focus:outline-none focus:ring-[3px] focus:ring-primary-400 focus:border-primary-500 transition-colors"
            dir="ltr"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-healthcare-text mb-1.5">
            {t('platform.auth.password')}
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-white border border-healthcare-border rounded-lg px-3 py-2.5 text-sm text-healthcare-text focus:outline-none focus:ring-[3px] focus:ring-primary-400 focus:border-primary-500 transition-colors"
            dir="ltr"
          />
        </div>

        {error && (
          <div className="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? t('platform.auth.signingIn') : t('platform.auth.signIn')}
        </button>
      </form>
    </div>
  )
}
