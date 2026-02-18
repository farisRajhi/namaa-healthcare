import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import {
  LayoutDashboard,
  Users,
  Calendar,
  Settings,
  LogOut,
  Menu,
  X,
  Phone,
  UserCog,
  FolderTree,
  Building2,
  Pill,
  HelpCircle,
  Megaphone,
  Bell,
  BarChart3,
  Truck,
  ShieldCheck,
  Plug,
  FileText,
  Search,
  Globe,
  ChevronDown,
  Briefcase,
  Activity,
  MessageSquare,
  ClipboardList,
  Workflow,
  FileBarChart,
} from 'lucide-react'
import { cn } from '../../lib/utils'

interface NavItem {
  name: string
  href: string
  icon: React.ElementType
  end?: boolean
}

interface NavGroup {
  group: string
  items: NavItem[]
}

// Navigation structure with groups — matching App.tsx routes
const getNavigation = (t: (key: string) => string): NavGroup[] => [
  {
    group: t('nav.groups.main'),
    items: [
      { name: t('nav.dashboard'), href: '/dashboard', icon: LayoutDashboard, end: true },
    ],
  },
  {
    group: t('nav.groups.operations'),
    items: [
      { name: t('nav.callCenter'), href: '/dashboard/call-center', icon: Phone },
      { name: t('nav.appointments'), href: '/dashboard/appointments', icon: Calendar },
      { name: t('nav.prescriptions'), href: '/dashboard/prescriptions', icon: Pill },
      { name: t('nav.reminders'), href: '/dashboard/reminders', icon: Bell },
      { name: t('nav.waitlist'), href: '/dashboard/waitlist', icon: ClipboardList },
      { name: t('nav.agentBuilder'), href: '/dashboard/agent-builder', icon: Workflow },
    ],
  },
  {
    group: t('nav.groups.management'),
    items: [
      { name: t('nav.patients'), href: '/dashboard/patients', icon: Users },
      { name: t('nav.providers'), href: '/dashboard/providers', icon: UserCog },
      { name: t('nav.departments'), href: '/dashboard/departments', icon: FolderTree },
      { name: t('nav.facilities'), href: '/dashboard/facilities', icon: Building2 },
      { name: t('nav.services'), href: '/dashboard/services', icon: Briefcase },
    ],
  },
  {
    group: t('nav.groups.marketing'),
    items: [
      { name: t('nav.campaigns'), href: '/dashboard/campaigns', icon: Megaphone },
      { name: t('nav.smsTemplates'), href: '/dashboard/sms-templates', icon: MessageSquare },
      { name: t('nav.faq'), href: '/dashboard/faq', icon: HelpCircle },
    ],
  },
  {
    group: t('nav.groups.analytics'),
    items: [
      { name: t('nav.analyticsDashboard'), href: '/dashboard/analytics', icon: BarChart3 },
      { name: t('nav.fleet'), href: '/dashboard/fleet', icon: Truck },
      { name: t('nav.quality'), href: '/dashboard/quality', icon: ShieldCheck },
      { name: t('nav.reports'), href: '/dashboard/reports', icon: FileBarChart },
      { name: t('nav.audit'), href: '/dashboard/audit', icon: FileText },
    ],
  },
  {
    group: t('nav.groups.system'),
    items: [
      { name: t('nav.generalManagement'), href: '/dashboard/management', icon: Activity },
      { name: t('nav.integrations'), href: '/dashboard/integrations', icon: Plug },
      { name: t('nav.settings'), href: '/dashboard/settings', icon: Settings },
    ],
  },
]

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userDropdown, setUserDropdown] = useState(false)
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const navigation = getNavigation(t)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const toggleLanguage = () => {
    const newLang = i18n.language === 'ar' ? 'en' : 'ar'
    i18n.changeLanguage(newLang)
  }

  const SidebarContent = () => (
    <>
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="w-10 h-10 bg-teal-gradient rounded-xl flex items-center justify-center flex-shrink-0 shadow-btn">
          <span className="text-white font-bold text-lg">✚</span>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-heading font-bold text-lg text-healthcare-text leading-none">{t('landing.brand')}</h1>
          <p className="text-[10px] text-healthcare-muted font-medium tracking-wide">NAMAA HEALTH AI</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {navigation.map((group) => (
          <div key={group.group}>
            <p className="nav-group-title">{group.group}</p>
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                end={item.end}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  cn('nav-link mb-0.5', isActive && 'nav-link-active')
                }
              >
                <item.icon className="h-[18px] w-[18px] flex-shrink-0" />
                <span className="truncate">{item.name}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer — User */}
      <div className="sidebar-footer">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
            <span className="text-primary-700 font-bold text-sm">
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-healthcare-text truncate">
              {user?.org?.name || t('common.organization')}
            </p>
            <p className="text-xs text-healthcare-muted truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="mt-3 w-full nav-link text-danger-500 hover:bg-danger-50 hover:text-danger-600"
        >
          <LogOut className="h-[18px] w-[18px]" />
          <span>{t('common.signOut')}</span>
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-healthcare-bg">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 start-0 z-50 w-[280px] bg-white transform transition-transform duration-300 ease-smooth lg:hidden shadow-2xl',
          sidebarOpen ? 'translate-x-0 rtl:-translate-x-0' : '-translate-x-full rtl:translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Close button */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="absolute top-4 end-4 btn-icon btn-ghost p-2 min-w-[36px] min-h-[36px] z-10"
          >
            <X className="h-5 w-5" />
          </button>
          <SidebarContent />
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:fixed lg:inset-y-0 lg:start-0 lg:z-40">
        <div className="sidebar flex flex-col">
          <SidebarContent />
        </div>
      </div>

      {/* Main content */}
      <div className="lg:ps-[280px]">
        {/* Top header */}
        <div className="top-header flex items-center gap-4 px-4 lg:px-6">
          {/* Mobile menu button */}
          <button
            className="lg:hidden btn-icon btn-ghost p-2 -ms-2"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Search bar */}
          <div className="hidden sm:flex flex-1 max-w-md relative">
            <Search className="search-icon" />
            <input
              type="text"
              placeholder={t('common.quickSearch')}
              className="search-input text-sm"
            />
          </div>

          <div className="flex-1 sm:hidden" />

          {/* Right side actions */}
          <div className="flex items-center gap-2">
            {/* Language toggle */}
            <button
              onClick={toggleLanguage}
              className="btn-ghost btn-icon p-2 min-w-[40px] min-h-[40px] rounded-lg text-sm font-semibold"
              title="Toggle Language"
            >
              <Globe className="h-4 w-4" />
              <span className="text-xs">{i18n.language === 'ar' ? 'EN' : 'AR'}</span>
            </button>

            {/* Notifications */}
            <button className="btn-ghost btn-icon p-2 min-w-[40px] min-h-[40px] rounded-lg relative">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 end-1.5 w-2 h-2 bg-danger-500 rounded-full" />
            </button>

            {/* User dropdown */}
            <div className="relative">
              <button
                onClick={() => setUserDropdown(!userDropdown)}
                className="btn-ghost rounded-lg flex items-center gap-2 py-1.5 px-2 min-h-[40px]"
              >
                <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
                  <span className="text-primary-700 font-bold text-xs">
                    {user?.email?.charAt(0).toUpperCase() || 'U'}
                  </span>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-healthcare-muted hidden sm:block" />
              </button>

              {userDropdown && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setUserDropdown(false)} />
                  <div className="absolute end-0 mt-2 w-56 bg-white rounded-xl shadow-modal border border-healthcare-border/30 py-2 z-30 animate-scale-in">
                    <div className="px-4 py-2 border-b border-healthcare-border/20">
                      <p className="text-sm font-semibold text-healthcare-text truncate">
                        {user?.org?.name || t('common.organization')}
                      </p>
                      <p className="text-xs text-healthcare-muted truncate">{user?.email}</p>
                    </div>
                    <NavLink
                      to="/dashboard/settings"
                      onClick={() => setUserDropdown(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-healthcare-muted hover:bg-primary-50 hover:text-primary-600 transition-colors"
                    >
                      <Settings className="h-4 w-4" />
                      {t('nav.settings')}
                    </NavLink>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-danger-500 hover:bg-danger-50 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      {t('common.signOut')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="p-4 lg:p-6 xl:p-8 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
