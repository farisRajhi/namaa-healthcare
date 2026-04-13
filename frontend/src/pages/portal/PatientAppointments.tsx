import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { patientApi } from '../../context/PatientAuthContext'
import { Calendar, Clock, Plus, X, AlertTriangle } from 'lucide-react'
import { formatTime, formatDateLocale, formatHijriDate } from '../../lib/utils'
import { cn } from '../../lib/utils'

interface AppointmentItem {
  appointmentId: string
  startTs: string
  endTs: string
  status: string
  reason: string | null
  provider: { displayName: string; credentials: string | null }
  service: { name: string; durationMin: number }
  facility: { name: string } | null
  department: { name: string } | null
}

type TabType = 'upcoming' | 'past'

const statusColors: Record<string, string> = {
  booked: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  completed: 'bg-blue-100 text-blue-700',
  checked_in: 'bg-primary-100 text-primary-700',
  in_progress: 'bg-primary-100 text-primary-700',
  held: 'bg-orange-100 text-orange-700',
  no_show: 'bg-red-100 text-red-700',
  expired: 'bg-slate-100 text-slate-500',
}

export default function PatientAppointments() {
  const { t, i18n } = useTranslation()
  const [activeTab, setActiveTab] = useState<TabType>('upcoming')
  const [appointments, setAppointments] = useState<AppointmentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const loadAppointments = async (type: TabType) => {
    setLoading(true)
    try {
      const api = patientApi()
      const res = await api.get(`/api/patient-portal/appointments?type=${type}&limit=50`)
      setAppointments(res.data.data || [])
    } catch {
      setAppointments([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAppointments(activeTab)
  }, [activeTab])

  const handleCancel = async (appointmentId: string) => {
    setCancelling(true)
    try {
      const api = patientApi()
      await api.patch(`/api/patient-portal/appointments/${appointmentId}/cancel`)
      await loadAppointments(activeTab)
    } catch {
      // ignore
    } finally {
      setCancelling(false)
      setCancelId(null)
    }
  }

  const canCancel = (status: string) => {
    return ['booked', 'confirmed', 'held'].includes(status)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">{t('portal.appointments.title')}</h2>
        <Link
          to="/patient/dashboard/book"
          className="flex items-center gap-1.5 bg-primary-500 text-white px-3 py-2 rounded-xl text-xs font-medium hover:bg-primary-600 transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('portal.appointments.newBooking')}
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-100 rounded-xl p-1">
        {(['upcoming', 'past'] as TabType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex-1 py-2 text-xs font-medium rounded-lg transition-all',
              activeTab === tab
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500'
            )}
          >
            {t(`portal.appointments.${tab}`)}
          </button>
        ))}
      </div>

      {/* Appointments List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl p-4 border border-slate-100 animate-pulse">
              <div className="h-4 bg-slate-100 rounded w-2/5 mb-3" />
              <div className="h-3 bg-slate-100 rounded w-3/5 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : appointments.length === 0 ? (
        <div className="bg-white rounded-xl p-8 border border-slate-100 text-center">
          <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-600 font-medium">
            {activeTab === 'upcoming' ? t('portal.appointments.noUpcoming') : t('portal.appointments.noPast')}
          </p>
          {activeTab === 'upcoming' && (
            <Link
              to="/patient/dashboard/book"
              className="inline-flex items-center gap-1 mt-4 text-xs text-primary-600 font-medium bg-primary-50 px-4 py-2 rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('portal.appointments.bookNew')}
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {appointments.map((appt) => (
            <div
              key={appt.appointmentId}
              className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-slate-800">{appt.service.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{appt.provider.displayName}</p>
                  {appt.provider.credentials && (
                    <p className="text-[10px] text-slate-400">{appt.provider.credentials}</p>
                  )}
                </div>
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${statusColors[appt.status] || 'bg-slate-100 text-slate-600'}`}
                >
                  {t(`portal.statuses.${appt.status}`, { defaultValue: appt.status })}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>
                    {formatDateLocale(appt.startTs, i18n.language)}
                    <span className="block text-[10px] text-slate-400">{formatHijriDate(appt.startTs)}</span>
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {formatTime(appt.startTs)}
                </span>
                <span className="text-slate-300">�</span>
                <span>{appt.service.durationMin} {t('portal.appointments.minutes')}</span>
              </div>

              {appt.facility && (
                <p className="text-[10px] text-slate-400 mt-1.5">{appt.facility.name}</p>
              )}

              {/* Cancel button */}
              {activeTab === 'upcoming' && canCancel(appt.status) && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  {cancelId === appt.appointmentId ? (
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <p className="text-xs text-slate-600 flex-1">{t('portal.appointments.confirmCancel')}</p>
                      <button
                        onClick={() => handleCancel(appt.appointmentId)}
                        disabled={cancelling}
                        className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg font-medium disabled:opacity-60"
                      >
                        {cancelling ? t('portal.appointments.cancelling') : t('portal.appointments.yesCancel')}
                      </button>
                      <button
                        onClick={() => setCancelId(null)}
                        className="text-xs text-slate-500 px-2 py-1.5"
                      >
                        {t('common.no')}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setCancelId(appt.appointmentId)}
                      className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 font-medium"
                    >
                      <X className="w-3.5 h-3.5" />
                      {t('portal.appointments.cancelAppointment')}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
