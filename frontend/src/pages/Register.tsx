import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { Eye, EyeOff, ArrowRight, Building2 } from 'lucide-react'
import { useToast } from '../components/ui/Toast'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [orgName, setOrgName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { register } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { addToast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validation
    if (!orgName.trim()) {
      setError(t('auth.orgRequired') || 'اسم المنشأة مطلوب / Organization name is required')
      return
    }
    if (password.length < 8) {
      setError(t('auth.passwordTooShort') || 'كلمة المرور يجب أن تكون 8 أحرف على الأقل / Password must be at least 8 characters')
      return
    }

    setIsLoading(true)

    try {
      await register(email, password, orgName)
      addToast({ type: 'success', title: 'تم إنشاء الحساب بنجاح! / Account created!' })
      navigate('/dashboard')
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error || t('auth.registrationFailed')
      setError(msg)
      addToast({ type: 'error', title: msg })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-healthcare-bg">
      {/* Left side — Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-green-gradient relative overflow-hidden items-center justify-center p-12">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 start-20 w-64 h-64 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-40 end-10 w-96 h-96 bg-white rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 max-w-md">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-8">
            <span className="text-white font-bold text-3xl">✚</span>
          </div>
          <h1 className="text-4xl font-heading font-bold text-white mb-4">ابدأ رحلتك مع توافد</h1>
          <p className="text-xl text-white/80 mb-2">انضم إلى مئات المنشآت الصحية</p>
          <p className="text-white/60 leading-relaxed">
            أنشئ حسابك الآن واستفد من مساعد الذكاء الاصطناعي الذي يتحدث العربية بطلاقة
          </p>
          <div className="mt-12 grid grid-cols-3 gap-4">
            {[
              { value: '500+', label: 'منشأة' },
              { value: '100K+', label: 'مريض' },
              { value: '24/7', label: 'متاح' },
            ].map((stat) => (
              <div key={stat.label} className="bg-white/10 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-white/70">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right side — Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md animate-fade-in">
          {/* Mobile brand */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-12 h-12 bg-green-gradient rounded-xl flex items-center justify-center shadow-btn">
              <span className="text-white font-bold text-xl">✚</span>
            </div>
            <div>
              <h1 className="font-heading font-bold text-xl text-healthcare-text">توافد</h1>
              <p className="text-xs text-healthcare-muted">TAWAFUD HEALTH AI</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-heading font-bold text-healthcare-text">
              {t('auth.createAccount')}
            </h2>
            <p className="mt-2 text-sm text-healthcare-muted">
              {t('auth.registerSubtitle')}
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-lg text-sm animate-slide-up">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="orgName" className="input-label">
                {t('auth.orgName')}
              </label>
              <div className="relative">
                <input
                  id="orgName"
                  name="orgName"
                  type="text"
                  required
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="input ps-11"
                  placeholder={t('auth.orgPlaceholder')}
                />
                <Building2 className="absolute start-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-healthcare-muted/50" />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="input-label">
                {t('auth.email')}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder={t('auth.emailPlaceholder')}
              />
            </div>

            <div>
              <label htmlFor="password" className="input-label">
                {t('auth.password')}
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pe-12"
                  placeholder={t('auth.passwordPlaceholder')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 p-1 text-healthcare-muted hover:text-healthcare-text transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="input-hint">{t('auth.passwordHint')}</p>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-success w-full"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {t('common.signUp')}
                  <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                </>
              )}
            </button>

            <p className="text-center text-sm text-healthcare-muted">
              {t('auth.haveAccount')}{' '}
              <Link to="/login" className="font-semibold text-primary-500 hover:text-primary-600 transition-colors">
                {t('common.signIn')}
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
