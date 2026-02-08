import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import {
  Users,
  Calendar,
  UserCog,
  TrendingUp,
  MessageSquare,
  Clock,
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

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6']

export default function Dashboard() {
  const { t, i18n } = useTranslation()

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

  const stats = [
    {
      name: t('dashboard.stats.totalPatients'),
      value: overview?.totalPatients || 0,
      icon: Users,
      color: 'bg-blue-500',
    },
    {
      name: t('dashboard.stats.activeProviders'),
      value: overview?.totalProviders || 0,
      icon: UserCog,
      color: 'bg-green-500',
    },
    {
      name: t('dashboard.stats.todayAppointments'),
      value: overview?.todayAppointments || 0,
      icon: Calendar,
      color: 'bg-purple-500',
    },
    {
      name: t('dashboard.stats.thisMonth'),
      value: overview?.monthAppointments || 0,
      icon: TrendingUp,
      color: 'bg-orange-500',
    },
  ]

  if (overviewLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  const dateLocale = i18n.language === 'ar' ? 'ar-SA' : 'en-US'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('dashboard.title')}</h1>
        <p className="text-gray-500">{t('dashboard.subtitle')}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.name}
            className="bg-white rounded-xl p-6 shadow-sm border"
          >
            <div className="flex items-center gap-4">
              <div className={`${stat.color} p-3 rounded-lg`}>
                <stat.icon className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-500">{stat.name}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Appointments Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl p-6 shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {t('dashboard.charts.appointments')}
          </h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => new Date(value).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })}
                />
                <YAxis />
                <Tooltip
                  labelFormatter={(value) => new Date(value).toLocaleDateString(dateLocale)}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#22c55e"
                  fill="#dcfce7"
                  name={t('dashboard.charts.total')}
                />
                <Area
                  type="monotone"
                  dataKey="completed"
                  stroke="#3b82f6"
                  fill="#dbeafe"
                  name={t('dashboard.charts.completed')}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Booking Channels */}
        <div className="bg-white rounded-xl p-6 shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {t('dashboard.charts.bookingChannels')}
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={channelsData || []}
                  dataKey="count"
                  nameKey="channel"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ channel, percent }) =>
                    `${channel} ${(percent * 100).toFixed(0)}%`
                  }
                >
                  {(channelsData || []).map((_: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2">
            {(channelsData || []).map((channel: any, index: number) => (
              <div key={channel.channel} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="text-sm text-gray-600 capitalize">
                  {channel.channel}: {channel.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl p-6 shadow-sm border">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          {t('dashboard.quickActions.title')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition-colors">
            <Calendar className="h-8 w-8 text-primary-600" />
            <div className="text-start">
              <p className="font-medium text-gray-900">{t('dashboard.quickActions.newAppointment')}</p>
              <p className="text-sm text-gray-500">{t('dashboard.quickActions.newAppointmentDesc')}</p>
            </div>
          </button>
          <button className="flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition-colors">
            <Users className="h-8 w-8 text-primary-600" />
            <div className="text-start">
              <p className="font-medium text-gray-900">{t('dashboard.quickActions.addPatient')}</p>
              <p className="text-sm text-gray-500">{t('dashboard.quickActions.addPatientDesc')}</p>
            </div>
          </button>
          <button className="flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition-colors">
            <MessageSquare className="h-8 w-8 text-primary-600" />
            <div className="text-start">
              <p className="font-medium text-gray-900">{t('dashboard.quickActions.viewMessages')}</p>
              <p className="text-sm text-gray-500">{t('dashboard.quickActions.viewMessagesDesc')}</p>
            </div>
          </button>
        </div>
      </div>

      {/* Appointment Status */}
      {overview?.appointmentsByStatus && overview.appointmentsByStatus.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {t('dashboard.statusBreakdown')}
          </h3>
          <div className="flex flex-wrap gap-4">
            {overview.appointmentsByStatus.map((status: any) => (
              <div
                key={status.status}
                className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg"
              >
                <Clock className="h-4 w-4 text-gray-400" />
                <span className="text-sm capitalize text-gray-600">
                  {status.status.replace('_', ' ')}:
                </span>
                <span className="font-semibold text-gray-900">{status.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
