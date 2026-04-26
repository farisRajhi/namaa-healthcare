import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { usePatientAuth } from '../../context/PatientAuthContext'
import { Phone, CalendarDays, ArrowLeft, ArrowRight, Shield, Globe } from 'lucide-react'

export default function PatientLogin() {
  const { t, i18n } = useTranslation()
  const [phone, setPhone] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { login, isAuthenticated } = usePatientAuth()
  const navigate = useNavigate()
  const isRTL = i18n.language === 'ar'
  const ArrowIcon = isRTL ? ArrowLeft : ArrowRight

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar')
  }

  // Redirect if already logged in (declarative — never call navigate() during render)
  if (isAuthenticated) {
    return <Navigate to="/patient/dashboard" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!phone.trim() || !/^\+?[0-9\s\-]{7,15}$/.test(phone.trim())) {
      setError(t('portal.login.invalidPhone'))
      return
    }
    if (!dateOfBirth) {
      setError(t('portal.login.invalidDob'))
      return
    }

    setIsLoading(true)

    try {
      await login(phone, dateOfBirth)
      navigate('/patient/dashboard')
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.errorEn || t('portal.login.error')
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50 flex flex-col">
      {/* Language Toggle */}
      <div className="absolute top-4 end-4 z-10">
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 bg-white/80 backdrop-blur px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200/50 transition-colors"
        >
          <Globe className="w-4 h-4" />
          {i18n.language === 'ar' ? 'EN' : 'AR'}
        </button>
      </div>

      {/* Header */}
      <div className="px-6 pt-8 pb-4 text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-200">
          <span className="text-white font-bold text-2xl">✚</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-800">{t('portal.brand')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('portal.patientPortal')}</p>
      </div>

      {/* Form */}
      <div className="flex-1 flex items-start justify-center px-6 pt-4">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-1">{t('portal.login.title')}</h2>
            <p className="text-sm text-slate-500 mb-6">
              {t('portal.login.subtitle')}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                  {error}
                </div>
              )}

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('portal.login.phone')}
                </label>
                <div className="relative">
                  <Phone className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+966 5X XXX XXXX"
                    required
                    dir="ltr"
                    className="w-full ps-10 pe-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors text-left"
                  />
                </div>
              </div>

              {/* Date of Birth */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('portal.login.dob')}
                </label>
                <div className="relative">
                  <CalendarDays className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    required
                    dir="ltr"
                    className="w-full ps-10 pe-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors text-left"
                  />
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-primary-500 to-primary-600 text-white py-3 rounded-xl font-medium text-sm hover:from-primary-600 hover:to-primary-700 transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm shadow-primary-200"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    {t('portal.login.submit')}
                    <ArrowIcon className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Trust indicators */}
          <div className="mt-6 flex items-center justify-center gap-2 text-slate-400">
            <Shield className="w-4 h-4" />
            <p className="text-xs">{t('portal.dataProtected')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
