import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { Eye, EyeOff, ArrowRight } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.message || t('auth.invalidCredentials'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-healthcare-bg">
      {/* Left side — Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-teal-gradient relative overflow-hidden items-center justify-center p-12">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 start-20 w-64 h-64 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-40 end-10 w-96 h-96 bg-white rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 max-w-md">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-8">
            <span className="text-white font-bold text-3xl">✚</span>
          </div>
          <h1 className="text-4xl font-heading font-bold text-white mb-4">نماء</h1>
          <p className="text-xl text-white/80 mb-2">مساعد الذكاء الاصطناعي الطبي</p>
          <p className="text-white/60 leading-relaxed">
            منصة ذكية لإدارة المواعيد والتواصل مع المرضى بكفاءة عالية
          </p>
          <div className="mt-12 flex items-center gap-4">
            <div className="flex -space-s-3">
              {['🏥', '👨‍⚕️', '📋'].map((emoji, i) => (
                <div key={i} className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-lg border-2 border-white/30">
                  {emoji}
                </div>
              ))}
            </div>
            <p className="text-sm text-white/70">+500 منشأة صحية تثق بنا</p>
          </div>
        </div>
      </div>

      {/* Right side — Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md animate-fade-in">
          {/* Mobile brand */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-12 h-12 bg-teal-gradient rounded-xl flex items-center justify-center shadow-btn">
              <span className="text-white font-bold text-xl">✚</span>
            </div>
            <div>
              <h1 className="font-heading font-bold text-xl text-healthcare-text">نماء</h1>
              <p className="text-xs text-healthcare-muted">NAMAA HEALTH AI</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-heading font-bold text-healthcare-text">
              {t('auth.welcomeBack')}
            </h2>
            <p className="mt-2 text-sm text-healthcare-muted">
              {t('auth.signInSubtitle')}
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-lg text-sm animate-slide-up">
                {error}
              </div>
            )}

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
                  autoComplete="current-password"
                  required
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
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {t('common.signIn')}
                  <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                </>
              )}
            </button>

            <p className="text-center text-sm text-healthcare-muted">
              {t('auth.noAccount')}{' '}
              <Link to="/register" className="font-semibold text-primary-500 hover:text-primary-600 transition-colors">
                {t('common.signUp')}
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
