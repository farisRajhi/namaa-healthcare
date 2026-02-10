import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { Plus, Calendar, Clock, User } from 'lucide-react'
import { formatTime, cn } from '../lib/utils'
import Badge, { getStatusBadgeVariant } from '../components/ui/Badge'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'

interface Appointment {
  appointmentId: string
  startTs: string
  endTs: string
  status: string
  reason: string | null
  provider: { displayName: string }
  patient: { firstName: string; lastName: string } | null
  service: { name: string; durationMin: number }
}

export default function Appointments() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const { data, isLoading } = useQuery({
    queryKey: ['appointments', { page, status: statusFilter }],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '10' })
      if (statusFilter) params.set('status', statusFilter)
      const response = await api.get(`/api/appointments?${params}`)
      return response.data
    },
  })

  const appointments: Appointment[] = data?.data || []
  const pagination = data?.pagination

  const statuses = [
    { value: '', label: isAr ? 'جميع الحالات' : 'All Statuses' },
    { value: 'booked', label: isAr ? 'محجوز' : 'Booked' },
    { value: 'confirmed', label: isAr ? 'مؤكد' : 'Confirmed' },
    { value: 'checked_in', label: isAr ? 'مسجل الحضور' : 'Checked In' },
    { value: 'in_progress', label: isAr ? 'قيد التنفيذ' : 'In Progress' },
    { value: 'completed', label: isAr ? 'مكتمل' : 'Completed' },
    { value: 'cancelled', label: isAr ? 'ملغي' : 'Cancelled' },
    { value: 'no_show', label: isAr ? 'لم يحضر' : 'No Show' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{isAr ? 'المواعيد' : 'Appointments'}</h1>
          <p className="page-subtitle">{isAr ? 'إدارة وتتبع المواعيد' : 'Manage and track appointments'}</p>
        </div>
        <button className="btn-primary">
          <Plus className="h-4 w-4" />
          {isAr ? 'موعد جديد' : 'New Appointment'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {statuses.map((s) => (
          <button
            key={s.value}
            onClick={() => { setStatusFilter(s.value); setPage(1) }}
            className={cn(statusFilter === s.value ? 'chip-active' : 'chip')}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Appointments List */}
      <div className="table-container">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <LoadingSpinner />
          </div>
        ) : appointments.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title={isAr ? 'لا توجد مواعيد' : 'No appointments found'}
            description={isAr ? 'ابدأ بإضافة موعد جديد' : 'Start by adding a new appointment'}
          />
        ) : (
          <div className="divide-y divide-healthcare-border/20">
            {appointments.map((appointment) => (
              <div
                key={appointment.appointmentId}
                className="p-5 hover:bg-primary-50/30 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-4 flex-1 min-w-0">
                    {/* Date badge */}
                    <div className="flex flex-col items-center justify-center w-14 h-14 bg-primary-50 rounded-xl border border-primary-200/50 flex-shrink-0">
                      <span className="text-[10px] text-primary-500 font-semibold uppercase">
                        {new Date(appointment.startTs).toLocaleDateString(isAr ? 'ar-SA' : 'en-US', { month: 'short' })}
                      </span>
                      <span className="text-xl font-bold font-heading text-primary-700 leading-none">
                        {new Date(appointment.startTs).getDate()}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-healthcare-text truncate">
                          {appointment.patient
                            ? `${appointment.patient.firstName} ${appointment.patient.lastName}`
                            : isAr ? 'زائر' : 'Walk-in'}
                        </h3>
                        <Badge variant={getStatusBadgeVariant(appointment.status)}>
                          {appointment.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <p className="text-sm text-healthcare-muted mt-0.5">
                        {appointment.service.name}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-healthcare-muted">
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {formatTime(appointment.startTs)} - {formatTime(appointment.endTs)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5" />
                          {appointment.provider.displayName}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-end flex-shrink-0">
                    <span className="badge-neutral">
                      {appointment.service.durationMin} {isAr ? 'دقيقة' : 'min'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="px-5 py-4 border-t border-healthcare-border/20 flex items-center justify-between">
            <p className="text-sm text-healthcare-muted">
              {isAr ? `صفحة ${pagination.page} من ${pagination.totalPages}` : `Page ${pagination.page} of ${pagination.totalPages}`}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="pagination-btn"
              >
                {isAr ? 'السابق' : 'Previous'}
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= pagination.totalPages}
                className="pagination-btn"
              >
                {isAr ? 'التالي' : 'Next'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
