import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import {
  Bell,
  Clock,
  CheckCircle,
  XCircle,
  MinusCircle,
  Settings,
  Calendar,
  MessageSquare,
  Phone,
  Mail,
} from 'lucide-react'
import { cn, formatDateTime } from '../lib/utils'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts'

interface ReminderConfig {
  interval: '48h' | '24h' | '2h'
  label: { ar: string; en: string }
  channels: {
    sms: boolean
    whatsapp: boolean
    voice: boolean
    email: boolean
  }
}

interface UpcomingReminder {
  reminderId: string
  patientName?: string
  appointmentDate?: string
  scheduledFor: string
  channel: string
  status: string
}

interface ReminderStats {
  sent: number
  confirmed: number
  cancelled: number
  noResponse: number
}

const COLORS = ['#22c55e', '#3b82f6', '#ef4444', '#9ca3af']

const defaultConfigs: ReminderConfig[] = [
  { interval: '48h', label: { ar: '48 ساعة قبل', en: '48 hours before' }, channels: { sms: true, whatsapp: true, voice: false, email: true } },
  { interval: '24h', label: { ar: '24 ساعة قبل', en: '24 hours before' }, channels: { sms: true, whatsapp: true, voice: false, email: false } },
  { interval: '2h', label: { ar: 'ساعتان قبل', en: '2 hours before' }, channels: { sms: true, whatsapp: false, voice: true, email: false } },
]

const channelIcons: Record<string, React.ElementType> = {
  sms: MessageSquare,
  whatsapp: MessageSquare,
  voice: Phone,
  email: Mail,
}

export default function Reminders() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const orgId = user?.org?.id || ''

  const [configs, setConfigs] = useState<ReminderConfig[]>(defaultConfigs)

  // Backend: GET /api/reminders/stats/:orgId
  const { data: reminderStats } = useQuery<ReminderStats>({
    queryKey: ['reminders', 'stats', orgId],
    queryFn: async () => {
      try {
        if (!orgId) return { sent: 0, confirmed: 0, cancelled: 0, noResponse: 0 }
        const res = await api.get(`/api/reminders/stats/${orgId}`)
        const d = res.data
        return {
          sent: d.totalSent || d.sent || 0,
          confirmed: d.confirmed || 0,
          cancelled: d.cancelled || 0,
          noResponse: d.noResponse || d.pending || 0,
        }
      } catch {
        return { sent: 0, confirmed: 0, cancelled: 0, noResponse: 0 }
      }
    },
    enabled: !!orgId,
    placeholderData: { sent: 0, confirmed: 0, cancelled: 0, noResponse: 0 },
  })

  // Backend: GET /api/reminders/:orgId — list upcoming reminders
  const { data: upcomingReminders } = useQuery<UpcomingReminder[]>({
    queryKey: ['reminders', 'upcoming', orgId],
    queryFn: async () => {
      try {
        if (!orgId) return []
        const res = await api.get(`/api/reminders/${orgId}?status=scheduled`)
        const reminders = res.data?.data || []
        return reminders.map((r: any) => ({
          reminderId: r.reminderId || r.appointmentReminderId,
          patientName: r.patient?.name || `${isAr ? 'مريض' : 'Patient'}`,
          appointmentDate: r.appointment?.startTs || r.scheduledFor,
          scheduledFor: r.scheduledFor,
          channel: r.channel || 'sms',
          status: r.status || 'scheduled',
        }))
      } catch {
        return []
      }
    },
    enabled: !!orgId,
    placeholderData: [],
  })

  // No dedicated config GET endpoint — use local state with defaults
  // Backend: POST /api/reminders/configure
  const saveMutation = useMutation({
    mutationFn: (data: ReminderConfig[]) => {
      if (!orgId) throw new Error('No orgId')
      // Transform configs to backend format
      const intervals = data.flatMap((config) => {
        const hoursBefore = config.interval === '48h' ? 48 : config.interval === '24h' ? 24 : 2
        const channels: string[] = []
        if (config.channels.sms) channels.push('sms')
        if (config.channels.whatsapp) channels.push('whatsapp')
        if (config.channels.voice) channels.push('voice')
        return channels.map((channel) => ({ hoursBefore, channel }))
      })
      return api.post('/api/reminders/configure', {
        orgId,
        intervals,
        enableSurvey: true,
        surveyDelayHours: 2,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
    },
  })

  const toggleChannel = (intervalIdx: number, channel: keyof ReminderConfig['channels']) => {
    const newConfigs = [...configs]
    newConfigs[intervalIdx] = {
      ...newConfigs[intervalIdx],
      channels: {
        ...newConfigs[intervalIdx].channels,
        [channel]: !newConfigs[intervalIdx].channels[channel],
      },
    }
    setConfigs(newConfigs)
  }

  const pieData = [
    { name: isAr ? 'تأكيد' : 'Confirmed', value: reminderStats?.confirmed || 0 },
    { name: isAr ? 'إلغاء' : 'Cancelled', value: reminderStats?.cancelled || 0 },
    { name: isAr ? 'بدون رد' : 'No Response', value: reminderStats?.noResponse || 0 },
  ].filter(d => d.value > 0)

  const totalSent = reminderStats?.sent || 0

  const statCards = [
    { label: isAr ? 'تم الإرسال' : 'Sent', value: reminderStats?.sent || 0, icon: Bell, color: 'text-blue-600 bg-blue-100' },
    { label: isAr ? 'تم التأكيد' : 'Confirmed', value: reminderStats?.confirmed || 0, icon: CheckCircle, color: 'text-green-600 bg-green-100' },
    { label: isAr ? 'تم الإلغاء' : 'Cancelled', value: reminderStats?.cancelled || 0, icon: XCircle, color: 'text-red-600 bg-red-100' },
    { label: isAr ? 'بدون رد' : 'No Response', value: reminderStats?.noResponse || 0, icon: MinusCircle, color: 'text-gray-600 bg-gray-100' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="page-title">
          {isAr ? 'التذكيرات' : 'Reminders'}
        </h1>
        <p className="text-healthcare-muted">
          {isAr ? 'إعدادات التذكيرات ومراقبة الفعالية' : 'Reminder settings and effectiveness monitoring'}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="card p-4">
            <div className="flex items-center gap-3">
              <div className={cn('p-2 rounded-lg', stat.color)}>
                <stat.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs page-subtitle">{stat.label}</p>
                <p className="text-xl font-bold text-healthcare-text">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration Panel */}
        <div className="table-container p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Settings className="h-5 w-5 text-gray-400" />
              {isAr ? 'إعدادات التذكيرات' : 'Reminder Configuration'}
            </h2>
            <button
              onClick={() => saveMutation.mutate(configs)}
              disabled={saveMutation.isPending || !orgId}
              className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {saveMutation.isPending ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ' : 'Save')}
            </button>
          </div>

          <div className="space-y-4">
            {configs.map((config, idx) => (
              <div key={config.interval} className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-primary-500" />
                  <span className="font-medium text-healthcare-text">
                    {isAr ? config.label.ar : config.label.en}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(Object.keys(config.channels) as Array<keyof ReminderConfig['channels']>).map((channel) => {
                    const Icon = channelIcons[channel] || Bell
                    return (
                      <button
                        key={channel}
                        onClick={() => toggleChannel(idx, channel)}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors',
                          config.channels[channel]
                            ? 'bg-primary-50 border-primary-300 text-primary-700'
                            : 'bg-white border-healthcare-border/20 text-gray-400'
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="capitalize">{channel === 'whatsapp' ? 'WhatsApp' : channel}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pie Chart */}
        <div className="table-container p-6">
          <h2 className="text-lg font-semibold mb-4">
            {isAr ? 'نتائج التذكيرات' : 'Reminder Outcomes'}
          </h2>
          {pieData.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-gray-500">
              <p>{isAr ? 'لا توجد بيانات بعد' : 'No data yet'}</p>
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={50}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          {totalSent > 0 && (
            <div className="text-center mt-2">
              <p className="text-sm text-gray-500">
                {isAr ? `إجمالي المرسلة: ${totalSent}` : `Total sent: ${totalSent}`}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Upcoming Reminders Timeline */}
      <div className="table-container p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-gray-400" />
          {isAr ? 'التذكيرات القادمة' : 'Upcoming Reminders'}
        </h2>
        {(upcomingReminders || []).length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            {isAr ? 'لا توجد تذكيرات قادمة' : 'No upcoming reminders'}
          </p>
        ) : (
          <div className="relative">
            <div className="absolute start-4 top-0 bottom-0 w-0.5 bg-gray-200" />
            <div className="space-y-4">
              {(upcomingReminders || []).map((reminder) => (
                <div key={reminder.reminderId} className="flex items-start gap-4 ps-0">
                  <div className={cn(
                    'relative z-10 w-8 h-8 rounded-full flex items-center justify-center',
                    reminder.status === 'sent' ? 'bg-green-100' :
                    reminder.status === 'failed' ? 'bg-red-100' : 'bg-blue-100'
                  )}>
                    <Bell className={cn(
                      'h-4 w-4',
                      reminder.status === 'sent' ? 'text-green-600' :
                      reminder.status === 'failed' ? 'text-red-600' : 'text-blue-600'
                    )} />
                  </div>
                  <div className="flex-1 bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-healthcare-text">{reminder.patientName || (isAr ? 'مريض' : 'Patient')}</p>
                      <span className="text-xs text-gray-400 capitalize px-2 py-0.5 bg-white rounded">
                        {reminder.channel}
                      </span>
                    </div>
                    {reminder.appointmentDate && (
                      <p className="text-sm text-gray-500 mt-1">
                        {isAr ? 'الموعد:' : 'Appointment:'} {formatDateTime(reminder.appointmentDate)}
                      </p>
                    )}
                    <p className="text-xs text-gray-400">
                      {isAr ? 'مجدول للإرسال:' : 'Scheduled:'} {formatDateTime(reminder.scheduledFor)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
