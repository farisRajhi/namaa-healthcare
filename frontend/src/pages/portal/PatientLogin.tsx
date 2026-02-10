import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePatientAuth } from '../../context/PatientAuthContext'
import { Phone, CalendarDays, ArrowLeft, Shield } from 'lucide-react'

export default function PatientLogin() {
  const [phone, setPhone] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { login, isAuthenticated } = usePatientAuth()
  const navigate = useNavigate()

  // Redirect if already logged in
  if (isAuthenticated) {
    navigate('/patient/dashboard', { replace: true })
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      await login(phone, dateOfBirth)
      navigate('/patient/dashboard')
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.errorEn || 'حدث خطأ في تسجيل الدخول'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50 flex flex-col">
      {/* Header */}
      <div className="px-6 pt-8 pb-4 text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-200">
          <span className="text-white font-bold text-2xl">✚</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-800">نماء</h1>
        <p className="text-sm text-slate-500 mt-1">بوابة المريض</p>
        <p className="text-xs text-slate-400 mt-0.5">Patient Portal</p>
      </div>

      {/* Form */}
      <div className="flex-1 flex items-start justify-center px-6 pt-4">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-1">تسجيل الدخول</h2>
            <p className="text-sm text-slate-500 mb-6">
              أدخل رقم هاتفك وتاريخ ميلادك للدخول
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
                  رقم الهاتف
                  <span className="text-slate-400 text-xs font-normal mr-1">Phone Number</span>
                </label>
                <div className="relative">
                  <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+966 5X XXX XXXX"
                    required
                    dir="ltr"
                    className="w-full pr-10 pl-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors text-left"
                  />
                </div>
              </div>

              {/* Date of Birth */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  تاريخ الميلاد
                  <span className="text-slate-400 text-xs font-normal mr-1">Date of Birth</span>
                </label>
                <div className="relative">
                  <CalendarDays className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    required
                    dir="ltr"
                    className="w-full pr-10 pl-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors text-left"
                  />
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-teal-500 to-teal-600 text-white py-3 rounded-xl font-medium text-sm hover:from-teal-600 hover:to-teal-700 transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm shadow-teal-200"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    دخول
                    <ArrowLeft className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Trust indicators */}
          <div className="mt-6 flex items-center justify-center gap-2 text-slate-400">
            <Shield className="w-4 h-4" />
            <p className="text-xs">بياناتك محمية ومشفرة بالكامل</p>
          </div>
        </div>
      </div>
    </div>
  )
}
