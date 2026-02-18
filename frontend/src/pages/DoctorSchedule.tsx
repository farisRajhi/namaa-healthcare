/**
 * Doctor Schedule – Weekly Calendar View
 * Shows provider availability by day with drag-to-block slots
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { ChevronLeft, ChevronRight, Calendar, User, Clock, RefreshCw } from 'lucide-react'
import { cn } from '../lib/utils'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import Badge from '../components/ui/Badge'

// ─── Types ───────────────────────────────────────────────────────────
interface Provider {
  providerId: string
  displayName: string
  credentials: string | null
  department: { name: string } | null
  facility: { name: string } | null
}

interface AvailabilityRule {
  ruleId: string
  dayOfWeek: number
  startLocal: string
  endLocal: string
  slotIntervalMin: number
}

interface Appointment {
  appointmentId: string
  startTs: string
  endTs: string
  status: string
  patient: { firstName: string; lastName: string } | null
  service: { name: string; durationMin: number }
}

const DAY_NAMES_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const DAY_NAMES_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const STATUS_COLOR: Record<string, string> = {
  booked:     'bg-blue-100 text-blue-800 border-blue-200',
  confirmed:  'bg-green-100 text-green-800 border-green-200',
  completed:  'bg-gray-100 text-gray-600 border-gray-200',
  cancelled:  'bg-red-100 text-red-800 border-red-200',
  no_show:    'bg-orange-100 text-orange-800 border-orange-200',
  checked_in: 'bg-purple-100 text-purple-800 border-purple-200',
  in_progress:'bg-yellow-100 text-yellow-800 border-yellow-200',
  held:       'bg-cyan-100 text-cyan-800 border-cyan-200',
}

function getWeekDates(offset = 0): Date[] {
  const today = new Date()
  const day = today.getDay()
  const sunday = new Date(today)
  sunday.setDate(today.getDate() - day + offset * 7)

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday)
    d.setDate(sunday.getDate() + i)
    return d
  })
}

function formatTime(isoString: string): string {
  const d = new Date(isoString)
  return d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(date: Date, isAr: boolean): string {
  return date.toLocaleDateString(isAr ? 'ar-SA' : 'en-US', {
    month: 'short',
    day: 'numeric',
  })
}

// ─── Component ────────────────────────────────────────────────────────
export default function DoctorSchedule() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const dayNames = isAr ? DAY_NAMES_AR : DAY_NAMES_EN

  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedProviderId, setSelectedProviderId] = useState<string>('')
  const [hoveredAppt, setHoveredAppt] = useState<string | null>(null)

  const weekDates = getWeekDates(weekOffset)
  const weekStart = weekDates[0].toISOString().split('T')[0]
  const weekEnd = weekDates[6].toISOString().split('T')[0]

  // Fetch providers
  const { data: providersData, isLoading: loadingProviders } = useQuery({
    queryKey: ['schedule-providers'],
    queryFn: async () => {
      const res = await api.get('/api/providers?limit=50')
      return res.data?.data || []
    },
  })

  const providers: Provider[] = providersData || []

  // Auto-select first provider
  const activeProviderId = selectedProviderId || providers[0]?.providerId || ''

  // Fetch availability rules for selected provider
  const { data: rulesData } = useQuery({
    queryKey: ['provider-rules', activeProviderId],
    queryFn: async () => {
      if (!activeProviderId) return []
      const res = await api.get(`/api/providers/${activeProviderId}/availability`)
      return res.data?.data || []
    },
    enabled: !!activeProviderId,
  })

  const availabilityRules: AvailabilityRule[] = rulesData || []

  // Fetch appointments for selected provider in the current week
  const { data: apptsData, isLoading: loadingAppts, refetch } = useQuery({
    queryKey: ['schedule-appts', activeProviderId, weekStart, weekEnd],
    queryFn: async () => {
      if (!activeProviderId) return []
      const res = await api.get('/api/appointments', {
        params: {
          providerId: activeProviderId,
          from: weekStart,
          to: weekEnd,
          limit: 200,
        },
      })
      return res.data?.data || []
    },
    enabled: !!activeProviderId,
  })

  const appointments: Appointment[] = apptsData || []

  // Group appointments by day-of-week
  const apptsByDay: Record<number, Appointment[]> = {}
  weekDates.forEach((d, i) => {
    apptsByDay[i] = appointments.filter((a) => {
      const apptDate = new Date(a.startTs)
      return (
        apptDate.getDate() === d.getDate() &&
        apptDate.getMonth() === d.getMonth() &&
        apptDate.getFullYear() === d.getFullYear()
      )
    })
  })

  // Get availability for a specific day (dayOfWeek = 0-6)
  const getAvailability = (dayOfWeek: number) =>
    availabilityRules.filter((r) => r.dayOfWeek === dayOfWeek)

  const selectedProvider = providers.find((p) => p.providerId === activeProviderId)

  const today = new Date()
  const isCurrentWeek = weekOffset === 0

  if (loadingProviders) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" text={isAr ? 'جاري التحميل...' : 'Loading...'} />
      </div>
    )
  }

  return (
    <div className="space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isAr ? 'جدول الأطباء' : 'Doctor Schedule'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAr ? 'عرض الجدول الأسبوعي للمواعيد والتوافر' : 'Weekly appointments and availability overview'}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw size={15} />
          {isAr ? 'تحديث' : 'Refresh'}
        </button>
      </div>

      {/* Provider Selector */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-4">
          <User size={18} className="text-gray-500" />
          <h2 className="font-semibold text-gray-800">
            {isAr ? 'اختر الطبيب / المزود' : 'Select Doctor / Provider'}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {providers.map((provider) => (
            <button
              key={provider.providerId}
              onClick={() => setSelectedProviderId(provider.providerId)}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium border transition-all duration-200',
                activeProviderId === provider.providerId
                  ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-teal-300 hover:bg-teal-50'
              )}
            >
              <span>{provider.displayName}</span>
              {provider.credentials && (
                <span className="opacity-70 text-xs ms-1">({provider.credentials})</span>
              )}
            </button>
          ))}
          {providers.length === 0 && (
            <p className="text-sm text-gray-400">
              {isAr ? 'لا يوجد أطباء مسجلون' : 'No providers registered'}
            </p>
          )}
        </div>

        {/* Provider Info */}
        {selectedProvider && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-4 text-sm text-gray-600">
            {selectedProvider.department && (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-teal-400 inline-block" />
                {isAr ? 'القسم:' : 'Dept:'} {selectedProvider.department.name}
              </span>
            )}
            {selectedProvider.facility && (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                {isAr ? 'المنشأة:' : 'Facility:'} {selectedProvider.facility.name}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Clock size={13} />
              {isAr ? 'ساعات العمل:' : 'Working Hours:'}{' '}
              {availabilityRules.length > 0
                ? availabilityRules.length + (isAr ? ' أيام' : ' days/week')
                : (isAr ? 'غير محدد' : 'Not set')}
            </span>
          </div>
        )}
      </div>

      {/* Week Navigation */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Nav Bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <button
            onClick={() => setWeekOffset((v) => v - 1)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
            aria-label="الأسبوع السابق"
          >
            {isAr ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>

          <div className="flex items-center gap-3">
            <Calendar size={18} className="text-teal-600" />
            <div className="text-center">
              <p className="font-semibold text-gray-900 text-sm">
                {formatDate(weekDates[0], isAr)} – {formatDate(weekDates[6], isAr)}
              </p>
              {isCurrentWeek && (
                <p className="text-xs text-teal-600 font-medium">
                  {isAr ? '● الأسبوع الحالي' : '● Current Week'}
                </p>
              )}
            </div>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="px-3 py-1 text-xs bg-teal-50 text-teal-600 rounded-lg hover:bg-teal-100 transition-colors"
              >
                {isAr ? 'اليوم' : 'Today'}
              </button>
            )}
          </div>

          <button
            onClick={() => setWeekOffset((v) => v + 1)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
            aria-label="الأسبوع القادم"
          >
            {isAr ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
        </div>

        {/* Calendar Grid */}
        {loadingAppts ? (
          <div className="flex items-center justify-center h-64">
            <LoadingSpinner size="md" text={isAr ? 'جاري تحميل المواعيد...' : 'Loading appointments...'} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="grid grid-cols-7 min-w-[700px]">
              {/* Day Headers */}
              {weekDates.map((date, idx) => {
                const isToday =
                  date.toDateString() === today.toDateString()
                const dayApptsCount = apptsByDay[idx]?.length || 0
                const hasAvailability = getAvailability(date.getDay()).length > 0

                return (
                  <div
                    key={idx}
                    className={cn(
                      'px-3 py-3 text-center border-b border-gray-100',
                      idx < 6 && 'border-e border-gray-100',
                      isToday && 'bg-teal-50'
                    )}
                  >
                    <p className={cn(
                      'text-xs font-semibold uppercase tracking-wide',
                      isToday ? 'text-teal-700' : 'text-gray-500'
                    )}>
                      {dayNames[date.getDay()]}
                    </p>
                    <p className={cn(
                      'text-lg font-bold mt-0.5',
                      isToday ? 'text-teal-700' : 'text-gray-900'
                    )}>
                      {date.getDate()}
                    </p>
                    {isToday && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-500 mt-0.5" />
                    )}
                    <div className="flex items-center justify-center gap-1 mt-1 flex-wrap">
                      {dayApptsCount > 0 && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5 font-medium">
                          {dayApptsCount}
                        </span>
                      )}
                      {!hasAvailability && (
                        <span className="text-[10px] text-gray-400">
                          {isAr ? 'إجازة' : 'Off'}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Day Columns */}
              {weekDates.map((date, idx) => {
                const dayAppts = apptsByDay[idx] || []
                const availability = getAvailability(date.getDay())
                const isToday = date.toDateString() === today.toDateString()
                const isOff = availability.length === 0

                return (
                  <div
                    key={idx}
                    className={cn(
                      'min-h-[300px] p-2 border-gray-100',
                      idx < 6 && 'border-e',
                      isToday && 'bg-teal-50/40',
                      isOff && 'bg-gray-50/60'
                    )}
                  >
                    {/* Availability Badge */}
                    {availability.length > 0 && (
                      <div className="mb-2 space-y-1">
                        {availability.map((rule) => (
                          <div
                            key={rule.ruleId}
                            className="text-[10px] bg-green-100 text-green-700 rounded px-1.5 py-0.5 text-center"
                          >
                            {rule.startLocal.slice(0, 5)} – {rule.endLocal.slice(0, 5)}
                          </div>
                        ))}
                      </div>
                    )}

                    {isOff && (
                      <div className="flex items-center justify-center h-20 text-gray-300 text-xs">
                        {isAr ? 'لا يوجد دوام' : 'Day off'}
                      </div>
                    )}

                    {/* Appointments */}
                    <div className="space-y-1.5">
                      {dayAppts
                        .sort((a, b) => new Date(a.startTs).getTime() - new Date(b.startTs).getTime())
                        .map((appt) => (
                          <div
                            key={appt.appointmentId}
                            onMouseEnter={() => setHoveredAppt(appt.appointmentId)}
                            onMouseLeave={() => setHoveredAppt(null)}
                            className={cn(
                              'relative rounded-lg border p-1.5 text-[11px] cursor-pointer transition-all',
                              STATUS_COLOR[appt.status] || 'bg-gray-100 text-gray-600 border-gray-200',
                              hoveredAppt === appt.appointmentId && 'shadow-md scale-[1.02]'
                            )}
                          >
                            <div className="font-semibold truncate">
                              {appt.patient
                                ? `${appt.patient.firstName} ${appt.patient.lastName}`
                                : (isAr ? 'مريض غير معروف' : 'Unknown Patient')}
                            </div>
                            <div className="opacity-75 truncate">{appt.service.name}</div>
                            <div className="opacity-75">
                              {formatTime(appt.startTs)} ({appt.service.durationMin}m)
                            </div>

                            {/* Hover tooltip */}
                            {hoveredAppt === appt.appointmentId && (
                              <div className="absolute z-20 bottom-full mb-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg p-2 text-[11px] text-gray-700">
                                <p className="font-semibold text-gray-900 mb-1">
                                  {appt.patient
                                    ? `${appt.patient.firstName} ${appt.patient.lastName}`
                                    : (isAr ? 'مريض غير معروف' : 'Unknown')}
                                </p>
                                <p>{isAr ? 'الخدمة:' : 'Service:'} {appt.service.name}</p>
                                <p>{isAr ? 'الوقت:' : 'Time:'} {formatTime(appt.startTs)}</p>
                                <p>{isAr ? 'المدة:' : 'Duration:'} {appt.service.durationMin} {isAr ? 'دقيقة' : 'min'}</p>
                                <p className="mt-1">
                                  <Badge
                                    variant={
                                      appt.status === 'confirmed' ? 'success' :
                                      appt.status === 'cancelled' ? 'danger' :
                                      appt.status === 'completed' ? 'neutral' : 'info'
                                    }
                                  >
                                    {appt.status}
                                  </Badge>
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: isAr ? 'إجمالي المواعيد' : 'Total Appointments',
            value: appointments.length,
            color: 'text-blue-600',
            bg: 'bg-blue-50',
          },
          {
            label: isAr ? 'مؤكدة' : 'Confirmed',
            value: appointments.filter((a) => a.status === 'confirmed').length,
            color: 'text-green-600',
            bg: 'bg-green-50',
          },
          {
            label: isAr ? 'مكتملة' : 'Completed',
            value: appointments.filter((a) => a.status === 'completed').length,
            color: 'text-gray-600',
            bg: 'bg-gray-50',
          },
          {
            label: isAr ? 'ملغاة' : 'Cancelled',
            value: appointments.filter((a) => a.status === 'cancelled').length,
            color: 'text-red-600',
            bg: 'bg-red-50',
          },
        ].map((stat) => (
          <div key={stat.label} className={cn('rounded-2xl p-4 border border-gray-100', stat.bg)}>
            <p className="text-xs text-gray-500 mb-1">{stat.label}</p>
            <p className={cn('text-2xl font-bold', stat.color)}>{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
