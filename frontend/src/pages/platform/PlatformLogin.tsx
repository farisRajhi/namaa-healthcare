import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'
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
    navigate('/platform', { replace: true })
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
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-lg shadow-lg p-8 space-y-5"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-slate-500">
              {t('platform.brand')}
            </div>
            <h1 className="text-2xl font-semibold text-slate-900">{t('platform.title')}</h1>
            <p className="text-sm text-slate-500 mt-1">{t('platform.tagline')}</p>
          </div>
          <button
            type="button"
            onClick={() => i18n.changeLanguage(isRTL ? 'en' : 'ar')}
            className="text-xs text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 mt-1"
          >
            <Globe className="w-3.5 h-3.5" />
            {t('platform.auth.switchLang')}
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            {t('platform.auth.email')}
          </label>
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-slate-300 rounded px-3 py-2 focus:ring-2 focus:ring-slate-800 focus:border-slate-800 outline-none"
            dir="ltr"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            {t('platform.auth.password')}
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-slate-300 rounded px-3 py-2 focus:ring-2 focus:ring-slate-800 focus:border-slate-800 outline-none"
            dir="ltr"
          />
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-slate-900 text-white py-2 rounded hover:bg-slate-800 disabled:opacity-60"
        >
          {submitting ? t('platform.auth.signingIn') : t('platform.auth.signIn')}
        </button>
      </form>
    </div>
  )
}
