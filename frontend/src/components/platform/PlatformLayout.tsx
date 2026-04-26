import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Globe,
  LayoutDashboard,
  Building2,
  CreditCard,
  FileClock,
  LogOut,
  ShieldCheck,
} from 'lucide-react'
import { usePlatformAuth } from '../../context/PlatformAuthContext'
import i18n from '../../i18n'

export default function PlatformLayout() {
  const { t } = useTranslation()
  const { admin, logout } = usePlatformAuth()
  const navigate = useNavigate()
  const isRTL = i18n.language === 'ar'

  const NAV = [
    { to: '/platform', label: t('platform.nav.dashboard'), icon: LayoutDashboard, end: true },
    { to: '/platform/orgs', label: t('platform.nav.orgs'), icon: Building2 },
    { to: '/platform/subscriptions', label: t('platform.nav.subscriptions'), icon: CreditCard },
    { to: '/platform/audit', label: t('platform.nav.audit'), icon: FileClock },
  ]

  const handleLogout = async () => {
    await logout()
    navigate('/platform/login', { replace: true })
  }

  const toggleLang = () => {
    const next = i18n.language === 'ar' ? 'en' : 'ar'
    i18n.changeLanguage(next)
  }

  return (
    <div className="min-h-screen bg-healthcare-bg flex" dir={isRTL ? 'rtl' : 'ltr'}>
      <a
        href="#platform-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-50 focus:bg-primary-600 focus:text-white focus:rounded-md focus:px-3 focus:py-2 focus:text-sm"
      >
        {t('platform.skipToMain', { defaultValue: 'Skip to main content' })}
      </a>
      <aside className="w-64 bg-white border-e border-healthcare-border/40 shadow-sidebar flex flex-col" aria-label={t('platform.title')}>
        {/* Brand header */}
        <div className="p-5 border-b border-healthcare-border/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary-500 text-white flex items-center justify-center shadow-btn">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-healthcare-muted font-semibold">
                {t('platform.brand')}
              </div>
              <div className="font-heading text-base font-semibold text-healthcare-text leading-tight">
                {t('platform.title')}
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-healthcare-muted hover:bg-healthcare-bg hover:text-healthcare-text'
                  }`
                }
              >
                <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        {/* Footer: lang + signed-in user + logout */}
        <div className="p-3 border-t border-healthcare-border/40 space-y-2">
          <button
            onClick={toggleLang}
            aria-label={isRTL ? 'Switch to English' : 'التبديل إلى العربية'}
            className="w-full flex items-center gap-2 text-xs font-medium text-healthcare-muted hover:text-primary-600 hover:bg-healthcare-bg rounded-lg px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
          >
            <Globe className="w-3.5 h-3.5" aria-hidden="true" />
            {t('platform.auth.switchLang')}
          </button>
          <div className="px-3 py-2">
            <div className="text-[10px] uppercase tracking-widest text-healthcare-muted font-semibold mb-0.5">
              {t('platform.auth.signedInAs')}
            </div>
            <div className="text-sm text-healthcare-text font-medium truncate" title={admin?.email}>
              {admin?.email}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 text-sm font-medium text-danger-600 hover:bg-danger-50 rounded-lg px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-400"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            {t('platform.auth.logout')}
          </button>
        </div>
      </aside>

      <main id="platform-main" className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
