import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import {
  Users,
  Calendar,
  Phone,
  TrendingUp,
  MessageSquare,
  Activity,
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
import StatCard from '../components/ui/StatCard'
import Badge, { getStatusBadgeVariant } from '../components/ui/Badge'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import StatusDot from '../components/ui/StatusDot'

const CHART_COLORS = ['#0891B2', '#22D3EE', '#059669', '#F59E0B', '#8B5CF6']

export default function Dashboard() {
  const { t, i18n } = useTranslation()
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
          <p className="page-subtitle">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-healthcare-muted bg-white px-3 py-1.5 rounded-full border border-healthcare-border/30">
            {t('dashboard.lastUpdate', { time: new Date().toLocaleTimeString(dateLocale) })}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          value={overview?.totalPatients || 0}
          label={t('dashboard.stats.totalPatients')}
          trend={{ value: 12, isPositive: true }}
          iconBg="bg-primary-100"
          iconColor="text-primary-600"
        />
        <StatCard
          icon={Calendar}
          value={overview?.todayAppointments || 0}
          label={t('dashboard.stats.todayAppointments')}
          trend={{ value: 8, isPositive: true }}
          iconBg="bg-success-100"
          iconColor="text-success-600"
          live
        />
        <StatCard
          icon={Phone}
          value={overview?.monthAppointments || 0}
          label={t('dashboard.stats.aiCallsToday')}
          trend={{ value: 23, isPositive: true }}
          iconBg="bg-secondary-100"
          iconColor="text-secondary-600"
        />
        <StatCard
          icon={TrendingUp}
          value={`${overview?.totalProviders || 0}`}
          label={t('dashboard.stats.activeProviders')}
          trend={{ value: 5, isPositive: true }}
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
                    <stop offset="5%" stopColor="#0891B2" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#0891B2" stopOpacity={0} />
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
                  tick={{ fontSize: 11, fill: '#5B7B8A' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#5B7B8A' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  labelFormatter={(value) => new Date(value).toLocaleDateString(dateLocale)}
                  contentStyle={{
                    background: 'white',
                    border: '1px solid #B2D8E4',
                    borderRadius: '10px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#0891B2"
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
                    border: '1px solid #B2D8E4',
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
        {/* Quick Actions */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold font-heading text-healthcare-text mb-4">
            {t('dashboard.quickActions.title')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            <button
              onClick={() => navigate('/dashboard/call-center')}
              className="card-interactive p-4 text-center group border-2 border-dashed border-healthcare-border/40 hover:border-secondary-300"
            >
              <div className="w-12 h-12 mx-auto rounded-xl bg-secondary-50 flex items-center justify-center mb-3 group-hover:bg-secondary-100 transition-colors">
                <MessageSquare className="h-6 w-6 text-secondary-500" />
              </div>
              <p className="text-sm font-semibold text-healthcare-text">{t('dashboard.quickActions.viewMessages')}</p>
              <p className="text-xs text-healthcare-muted mt-0.5">{t('dashboard.quickActions.viewMessagesDesc')}</p>
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
