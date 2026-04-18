import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'
import { usePlatformAuth } from '../../context/PlatformAuthContext'
import i18n from '../../i18n'

export default function PlatformLayout() {
  const { t } = useTranslation()
  const { admin, logout } = usePlatformAuth()
  const navigate = useNavigate()
  const isRTL = i18n.language === 'ar'

  const NAV = [
    { to: '/platform', label: t('platform.nav.dashboard'), end: true },
    { to: '/platform/orgs', label: t('platform.nav.orgs') },
    { to: '/platform/subscriptions', label: t('platform.nav.subscriptions') },
    { to: '/platform/audit', label: t('platform.nav.audit') },
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
    <div className="min-h-screen bg-slate-100 flex" dir={isRTL ? 'rtl' : 'ltr'}>
      <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col">
        <div className="p-5 border-b border-slate-800">
          <div className="text-xs uppercase tracking-widest text-slate-500">
            {t('platform.brand')}
          </div>
          <div className="text-lg font-semibold">{t('platform.title')}</div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded px-3 py-2 text-sm transition-colors ${
                  isActive ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-800 space-y-2">
          <button
            onClick={toggleLang}
            className="w-full flex items-center gap-2 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded px-3 py-2 transition-colors"
          >
            <Globe className="w-3.5 h-3.5" />
            {t('platform.auth.switchLang')}
          </button>
          <div>
            <div className="text-xs text-slate-400 mb-1">
              {t('platform.auth.signedInAs')}
            </div>
            <div className="text-sm mb-3 truncate" title={admin?.email}>
              {admin?.email}
            </div>
            <button
              onClick={handleLogout}
              className="w-full text-start text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded px-3 py-2"
            >
              {t('platform.auth.logout')}
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
