import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import {
  Users,
  Calendar,
  TrendingUp,
  Activity,
  UserPlus,
  Bot,
  Clock,
  CalendarCheck,
  ArrowLeft,
  Tag,
  Gift,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { formatHijriDate } from '../lib/utils'
import StatCard from '../components/ui/StatCard'
import Badge, { getStatusBadgeVariant } from '../components/ui/Badge'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import StatusDot from '../components/ui/StatusDot'

const CHART_COLORS = ['#4A7C6F', '#C4956A', '#059669', '#F59E0B', '#8B5CF6']

export default function Dashboard() {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const navigate = useNavigate()

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: async () => {
      const response = await api.get('/api/analytics/overview')
      return response.data
    },
  })

  const { data: chartData } = useQuery({
    queryKey: ['analytics', 'appointments-by-day'],
    queryFn: async () => {
      const response = await api.get('/api/analytics/appointments-by-day?days=14')
      return response.data.data
    },
  })

  const { data: channelsData } = useQuery({
    queryKey: ['analytics', 'booking-channels'],
    queryFn: async () => {
      const response = await api.get('/api/analytics/booking-channels')
      return response.data.data
    },
  })

  if (overviewLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" text={t('dashboard.loadingData')} />
      </div>
    )
  }

  const isNewClinic = !overviewLoading && overview && (
    (overview.totalAppointments === 0 || !overview.totalAppointments) &&
    (overview.totalPatients === 0 || !overview.totalPatients)
  )

  const onboardingSteps = [
    {
      title: t('dashboard.onboarding.addProvider'),
      description: t('dashboard.onboarding.addProviderDesc'),
      icon: UserPlus,
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600',
      route: '/providers',
    },
    {
      title: t('dashboard.onboarding.configureAgent'),
      description: t('dashboard.onboarding.configureAgentDesc'),
      icon: Bot,
      iconBg: 'bg-purple-50',
      iconColor: 'text-purple-600',
      route: '/agent-builder',
    },
    {
      title: t('dashboard.onboarding.setHours'),
      description: t('dashboard.onboarding.setHoursDesc'),
      icon: Clock,
      iconBg: 'bg-amber-50',
      iconColor: 'text-amber-600',
      route: '/management',
    },
    {
      title: t('dashboard.onboarding.testBooking'),
      description: t('dashboard.onboarding.testBookingDesc'),
      icon: CalendarCheck,
      iconBg: 'bg-green-50',
      iconColor: 'text-green-600',
      route: '/appointments',
    },
  ]

  const dateLocale = i18n.language === 'ar' ? 'ar-SA' : 'en-US'

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="page-title">{t('dashboard.title')}</h1>
            <StatusDot type="live" label={t('common.live')} />
          </div>
          <p className="page-subtitle">
          {t('dashboard.subtitle')}
          <span className="block text-xs mt-0.5 text-slate-400">{formatHijriDate(new Date())}</span>
        </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-healthcare-muted bg-white px-3 py-1.5 rounded-full border border-healthcare-border/30">
            {t('dashboard.lastUpdate', { time: new Date().toLocaleTimeString(dateLocale) })}
          </span>
        </div>
      </div>

      {/* Onboarding Checklist for new clinics */}
      {isNewClinic && (
        <div className="bg-gradient-to-br from-primary-50 to-secondary-50 border border-primary-200 rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-primary-900">{t('dashboard.onboarding.title')}</h2>
            <p className="text-sm text-primary-700 mt-1">{t('dashboard.onboarding.subtitle')}</p>
          </div>
          <div className="space-y-3">
            {onboardingSteps.map((step, i) => (
              <button
                key={i}
                onClick={() => navigate(step.route)}
                className="w-full flex items-center gap-3 bg-white rounded-xl p-4 border border-primary-200 hover:border-primary-300 hover:shadow-sm transition-all text-start"
              >
                <div className={`w-10 h-10 rounded-xl ${step.iconBg} flex items-center justify-center flex-shrink-0`}>
                  <step.icon className={`w-5 h-5 ${step.iconColor}`} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{step.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{step.description}</p>
                </div>
                <ArrowLeft className="w-4 h-4 text-slate-400 rtl:rotate-180" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stats Grid — trend props removed: backend doesn't yet return period-over-period
          deltas, and showing fabricated +12/+8/+5 numbers is false social proof. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          icon={Users}
          value={overview?.totalPatients || 0}
          label={t('dashboard.stats.totalPatients')}
          iconBg="bg-primary-100"
          iconColor="text-primary-600"
        />
        <StatCard
          icon={Calendar}
          value={overview?.todayAppointments || 0}
          label={t('dashboard.stats.todayAppointments')}
          iconBg="bg-success-100"
          iconColor="text-success-600"
          live
        />
        <StatCard
          icon={TrendingUp}
          value={`${overview?.totalProviders || 0}`}
          label={t('dashboard.stats.activeProviders')}
          iconBg="bg-warning-100"
          iconColor="text-warning-600"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Appointments Chart */}
        <div className="lg:col-span-2 card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold font-heading text-healthcare-text">
                {t('dashboard.charts.appointments')}
              </h3>
              <p className="text-xs text-healthcare-muted mt-0.5">{t('dashboard.last14Days')}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-1.5 rounded-full bg-primary-500" />
                <span className="text-xs text-healthcare-muted">{t('dashboard.charts.total')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-1.5 rounded-full bg-success-500" />
                <span className="text-xs text-healthcare-muted">{t('dashboard.charts.completed')}</span>
              </div>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData || []}>
                <defs>
                  <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4A7C6F" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#4A7C6F" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="completedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) =>
                    new Date(value).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })
                  }
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  labelFormatter={(value) => new Date(value).toLocaleDateString(dateLocale)}
                  contentStyle={{
                    background: 'white',
                    border: '1px solid #D6D3CC',
                    borderRadius: '10px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#4A7C6F"
                  strokeWidth={2}
                  fill="url(#totalGrad)"
                  name={t('dashboard.charts.total')}
                />
                <Area
                  type="monotone"
                  dataKey="completed"
                  stroke="#059669"
                  strokeWidth={2}
                  fill="url(#completedGrad)"
                  name={t('dashboard.charts.completed')}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Booking Channels */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold font-heading text-healthcare-text mb-2">
            {t('dashboard.charts.bookingChannels')}
          </h3>
          <p className="text-xs text-healthcare-muted mb-4">{t('dashboard.channelDistribution')}</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={channelsData || []}
                  dataKey="count"
                  nameKey="channel"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  innerRadius={40}
                  strokeWidth={0}
                >
                  {(channelsData || []).map((_: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'white',
                    border: '1px solid #D6D3CC',
                    borderRadius: '10px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    fontSize: '12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2.5 mt-2">
            {(channelsData || []).map((channel: any, index: number) => (
              <div key={channel.channel} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                  />
                  <span className="text-sm text-healthcare-text capitalize">{channel.channel}</span>
                </div>
                <span className="text-sm font-semibold text-healthcare-text">{channel.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions + Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Offers Widget */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold font-heading text-healthcare-text flex items-center gap-2">
              <Tag className="w-5 h-5 text-healthcare-primary" />
              {isAr ? 'العروض الترويجية' : 'Marketing Offers'}
            </h3>
            <button
              onClick={() => navigate('/dashboard/offers')}
              className="text-sm text-healthcare-primary hover:underline"
            >
              {isAr ? 'عرض الكل' : 'View all'}
            </button>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/dashboard/offers')}
              className="flex-1 p-4 bg-gradient-to-br from-healthcare-primary/5 to-healthcare-primary/10 rounded-xl border border-healthcare-primary/20 hover:border-healthcare-primary/40 transition-colors text-start group"
            >
              <Gift className="w-8 h-8 text-healthcare-primary mb-2" />
              <p className="font-semibold text-gray-900">{isAr ? 'إنشاء عرض جديد' : 'Create New Offer'}</p>
              <p className="text-xs text-gray-500 mt-1">
                {isAr ? 'استهدف المرضى بعروض واتساب مخصصة' : 'Target patients with personalized WhatsApp offers'}
              </p>
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold font-heading text-healthcare-text mb-4">
            {t('dashboard.quickActions.title')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => navigate('/dashboard/appointments')}
              className="card-interactive p-4 text-center group border-2 border-dashed border-healthcare-border/40 hover:border-primary-300"
            >
              <div className="w-12 h-12 mx-auto rounded-xl bg-primary-50 flex items-center justify-center mb-3 group-hover:bg-primary-100 transition-colors">
                <Calendar className="h-6 w-6 text-primary-500" />
              </div>
              <p className="text-sm font-semibold text-healthcare-text">{t('dashboard.quickActions.newAppointment')}</p>
              <p className="text-xs text-healthcare-muted mt-0.5">{t('dashboard.quickActions.newAppointmentDesc')}</p>
            </button>
            <button
              onClick={() => navigate('/dashboard/patients')}
              className="card-interactive p-4 text-center group border-2 border-dashed border-healthcare-border/40 hover:border-success-300"
            >
              <div className="w-12 h-12 mx-auto rounded-xl bg-success-50 flex items-center justify-center mb-3 group-hover:bg-success-100 transition-colors">
                <Users className="h-6 w-6 text-success-500" />
              </div>
              <p className="text-sm font-semibold text-healthcare-text">{t('dashboard.quickActions.addPatient')}</p>
              <p className="text-xs text-healthcare-muted mt-0.5">{t('dashboard.quickActions.addPatientDesc')}</p>
            </button>
          </div>
        </div>

        {/* Appointment Status Breakdown */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold font-heading text-healthcare-text">
              {t('dashboard.statusBreakdown')}
            </h3>
            <Badge variant="info" dot>{t('common.live')}</Badge>
          </div>
          {overview?.appointmentsByStatus && overview.appointmentsByStatus.length > 0 ? (
            <div className="space-y-3">
              {overview.appointmentsByStatus.map((status: any) => {
                const variant = getStatusBadgeVariant(status.status)
                const total = overview.appointmentsByStatus.reduce((sum: number, s: any) => sum + s.count, 0)
                const percentage = total > 0 ? Math.round((status.count / total) * 100) : 0
                return (
                  <div key={status.status} className="flex items-center gap-3">
                    <Badge variant={variant}>
                      {status.status.replace('_', ' ')}
                    </Badge>
                    <div className="flex-1 h-2 bg-primary-50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-400 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-healthcare-text w-8 text-end">
                      {status.count}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-healthcare-muted">
              <Activity className="h-10 w-10 mb-2 text-healthcare-border" />
              <p className="text-sm">{t('common.noData')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}




