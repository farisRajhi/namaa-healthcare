import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { usePatientAuth } from '../../context/PatientAuthContext'
import { Home, Calendar, User, LogOut } from 'lucide-react'
import { cn } from '../../lib/utils'
import LoadingSpinner from '../ui/LoadingSpinner'

export default function PortalLayout() {
  const { t, i18n } = useTranslation()
  const { patient, isLoading, logout } = usePatientAuth()
  const navigate = useNavigate()
  const isRTL = i18n.language === 'ar'

  const navItems = [
    { name: t('portal.nav.home'), href: '/patient/dashboard', icon: Home, end: true },
    { name: t('portal.nav.appointments'), href: '/patient/dashboard/appointments', icon: Calendar },
    { name: t('portal.nav.profile'), href: '/patient/dashboard/profile', icon: User },
  ]

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <LoadingSpinner size="lg" text={t('common.loading')} />
      </div>
    )
  }

  if (!patient) {
    navigate('/patient')
    return null
  }

  const handleLogout = () => {
    logout()
    navigate('/patient')
  }

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-lg mx-auto flex items-center justify-between px-4 h-14">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-sm">✚</span>
            </div>
            <div>
              <h1 className="font-bold text-sm text-slate-800 leading-none">{t('portal.brand')}</h1>
              <p className="text-[9px] text-slate-400 tracking-wide">{t('portal.brandSub')}</p>
            </div>
          </div>

          {/* Patient name + logout */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600 font-medium">
              {patient.firstName}
            </span>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title={t('portal.logout')}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Page Content */}
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-4 pb-24">
        <Outlet />
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 z-30 safe-area-bottom">
        <div className="max-w-lg mx-auto flex items-center justify-around h-16 px-2">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors min-w-[60px]',
                  isActive
                    ? 'text-primary-600'
                    : 'text-slate-400 hover:text-slate-600'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div className={cn(
                    'p-1.5 rounded-xl transition-colors',
                    isActive ? 'bg-primary-50' : ''
                  )}>
                    <item.icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-medium">{item.name}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
