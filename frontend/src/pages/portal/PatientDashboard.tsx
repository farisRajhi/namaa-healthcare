import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { usePatientAuth, patientApi } from '../../context/PatientAuthContext'
import { Calendar, Pill, Plus, Clock, User, Phone } from 'lucide-react'
import { formatDate, formatTime } from '../../lib/utils'

interface AppointmentItem {
  appointmentId: string
  startTs: string
  endTs: string
  status: string
  provider: { displayName: string }
  service: { name: string }
}

export default function PatientDashboard() {
  const { t } = useTranslation()
  const { patient } = usePatientAuth()
  const [upcomingAppointments, setUpcomingAppointments] = useState<AppointmentItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const api = patientApi()
        const res = await api.get('/api/patient-portal/appointments?type=upcoming&limit=3')
        setUpcomingAppointments(res.data.data || [])
      } catch {
        // silently fail
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const statusColors: Record<string, string> = {
    booked: 'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
    completed: 'bg-blue-100 text-blue-700',
    checked_in: 'bg-teal-100 text-teal-700',
    in_progress: 'bg-teal-100 text-teal-700',
  }

  return (
    <div className="space-y-5">
      {/* Welcome */}
      <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-2xl p-5 text-white shadow-sm">
        <p className="text-teal-100 text-sm">{t('portal.dashboard.welcome')}</p>
        <h2 className="text-xl font-bold mt-1">
          {patient?.firstName} {patient?.lastName}
        </h2>
        <p className="text-teal-100 text-xs mt-1">
          {t('portal.dashboard.welcomeBack', { name: patient?.firstName })}
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-3">
        <Link
          to="/patient/dashboard/book"
          className="bg-white rounded-xl p-3 flex flex-col items-center gap-2 border border-slate-100 shadow-sm hover:border-teal-200 hover:shadow-md transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
            <Plus className="w-5 h-5 text-teal-600" />
          </div>
          <span className="text-xs font-medium text-slate-700 text-center">{t('portal.dashboard.bookAppointment')}</span>
        </Link>
        <Link
          to="/patient/dashboard/prescriptions"
          className="bg-white rounded-xl p-3 flex flex-col items-center gap-2 border border-slate-100 shadow-sm hover:border-teal-200 hover:shadow-md transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
            <Pill className="w-5 h-5 text-purple-600" />
          </div>
          <span className="text-xs font-medium text-slate-700 text-center">{t('portal.dashboard.myPrescriptions')}</span>
        </Link>
        <Link
          to="/patient/dashboard/profile"
          className="bg-white rounded-xl p-3 flex flex-col items-center gap-2 border border-slate-100 shadow-sm hover:border-teal-200 hover:shadow-md transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <User className="w-5 h-5 text-blue-600" />
          </div>
          <span className="text-xs font-medium text-slate-700 text-center">{t('portal.dashboard.myAccount')}</span>
        </Link>
      </div>

      {/* Upcoming Appointments */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-sm">{t('portal.dashboard.upcomingAppointments')}</h3>
          <Link to="/patient/dashboard/appointments" className="text-xs text-teal-600 font-medium">
            {t('portal.dashboard.viewAll')}
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white rounded-xl p-4 border border-slate-100 animate-pulse">
                <div className="h-4 bg-slate-100 rounded w-1/3 mb-2" />
                <div className="h-3 bg-slate-100 rounded w-2/3 mb-1" />
                <div className="h-3 bg-slate-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : upcomingAppointments.length === 0 ? (
          <div className="bg-white rounded-xl p-6 border border-slate-100 text-center">
            <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">{t('portal.dashboard.noUpcoming')}</p>
            <Link
              to="/patient/dashboard/book"
              className="inline-flex items-center gap-1 mt-3 text-xs text-teal-600 font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('portal.dashboard.bookNew')}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingAppointments.map((appt) => (
              <div
                key={appt.appointmentId}
                className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-slate-800">
                      {appt.service.name}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {appt.provider.displayName}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusColors[appt.status] || 'bg-slate-100 text-slate-600'}`}
                  >
                    {t(`portal.statuses.${appt.status}`, { defaultValue: appt.status })}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(appt.startTs)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {formatTime(appt.startTs)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Contact Clinic */}
      <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
            <Phone className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-800">{t('portal.dashboard.contactClinic')}</p>
          </div>
          <a
            href="tel:+966500000000"
            className="text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-lg font-medium"
          >
            {t('portal.dashboard.call')}
          </a>
        </div>
      </div>
    </div>
  )
}
