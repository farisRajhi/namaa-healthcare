import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { Plus, Calendar, Clock, User } from 'lucide-react'
import { formatTime, cn } from '../lib/utils'
import Badge, { getStatusBadgeVariant } from '../components/ui/Badge'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'

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

interface AppointmentForm {
  providerId: string
  patientId: string
  serviceId: string
  startDate: string
  startTime: string
  reason: string
}

const defaultForm: AppointmentForm = {
  providerId: '',
  patientId: '',
  serviceId: '',
  startDate: '',
  startTime: '',
  reason: '',
}

export default function Appointments() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<AppointmentForm>(defaultForm)
  const [errors, setErrors] = useState<Partial<Record<keyof AppointmentForm, string>>>({})
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ['appointments', { page, status: statusFilter }],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '10' })
      if (statusFilter) params.set('status', statusFilter)
      const response = await api.get(`/api/appointments?${params}`)
      return response.data
    },
  })

  // Fetch providers and services for the form
  const { data: providersData } = useQuery({
    queryKey: ['providers', { active: true }],
    queryFn: async () => (await api.get('/api/providers?active=true')).data,
    enabled: showModal,
  })

  const { data: servicesData } = useQuery({
    queryKey: ['services', { active: true }],
    queryFn: async () => (await api.get('/api/services?active=true')).data,
    enabled: showModal,
  })

  const { data: patientsData } = useQuery({
    queryKey: ['patients-list'],
    queryFn: async () => (await api.get('/api/patients?limit=100')).data,
    enabled: showModal,
  })

  const createMutation = useMutation({
    mutationFn: (data: AppointmentForm) => {
      const startTs = new Date(`${data.startDate}T${data.startTime}`).toISOString()
      return api.post('/api/appointments', {
        providerId: data.providerId,
        patientId: data.patientId || undefined,
        serviceId: data.serviceId,
        startTs,
        reason: data.reason || undefined,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] })
      setShowModal(false)
      setForm(defaultForm)
      setErrors({})
      addToast({
        type: 'success',
        title: isAr ? 'تم إنشاء الموعد بنجاح' : 'Appointment created successfully',
      })
    },
    onError: (err: any) => {
      addToast({
        type: 'error',
        title: isAr ? 'فشل إنشاء الموعد' : 'Failed to create appointment',
        message: err.response?.data?.error || err.response?.data?.message || err.message,
      })
    },
  })

  const appointments: Appointment[] = data?.data || []
  const pagination = data?.pagination
  const providers = providersData?.data || []
  const services = servicesData?.data || []
  const patients = patientsData?.data || []

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

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof AppointmentForm, string>> = {}
    if (!form.providerId) newErrors.providerId = isAr ? 'يجب اختيار الطبيب' : 'Provider is required'
    if (!form.serviceId) newErrors.serviceId = isAr ? 'يجب اختيار الخدمة' : 'Service is required'
    if (!form.startDate) newErrors.startDate = isAr ? 'يجب تحديد التاريخ' : 'Date is required'
    if (!form.startTime) newErrors.startTime = isAr ? 'يجب تحديد الوقت' : 'Time is required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    createMutation.mutate(form)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setForm(defaultForm)
    setErrors({})
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{isAr ? 'المواعيد' : 'Appointments'}</h1>
          <p className="page-subtitle">{isAr ? 'إدارة وتتبع المواعيد' : 'Manage and track appointments'}</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
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
            action={{ label: isAr ? 'موعد جديد' : 'New Appointment', onClick: () => setShowModal(true) }}
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

      {/* New Appointment Modal */}
      <Modal open={showModal} onClose={handleCloseModal} title={isAr ? 'موعد جديد' : 'New Appointment'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Provider */}
          <div>
            <label className="input-label">{isAr ? 'الطبيب *' : 'Provider *'}</label>
            <select
              value={form.providerId}
              onChange={(e) => { setForm({ ...form, providerId: e.target.value }); setErrors({ ...errors, providerId: undefined }) }}
              className={`select ${errors.providerId ? 'border-red-400' : ''}`}
            >
              <option value="">{isAr ? 'اختر الطبيب...' : 'Select provider...'}</option>
              {providers.map((p: any) => (
                <option key={p.providerId} value={p.providerId}>{p.displayName}</option>
              ))}
            </select>
            {errors.providerId && <p className="text-xs text-red-500 mt-1">{errors.providerId}</p>}
          </div>

          {/* Patient (optional) */}
          <div>
            <label className="input-label">{isAr ? 'المريض' : 'Patient'}</label>
            <select
              value={form.patientId}
              onChange={(e) => setForm({ ...form, patientId: e.target.value })}
              className="select"
            >
              <option value="">{isAr ? 'زائر بدون ملف' : 'Walk-in (no patient)'}</option>
              {patients.map((p: any) => (
                <option key={p.patientId} value={p.patientId}>{p.firstName} {p.lastName}</option>
              ))}
            </select>
          </div>

          {/* Service */}
          <div>
            <label className="input-label">{isAr ? 'الخدمة *' : 'Service *'}</label>
            <select
              value={form.serviceId}
              onChange={(e) => { setForm({ ...form, serviceId: e.target.value }); setErrors({ ...errors, serviceId: undefined }) }}
              className={`select ${errors.serviceId ? 'border-red-400' : ''}`}
            >
              <option value="">{isAr ? 'اختر الخدمة...' : 'Select service...'}</option>
              {services.map((s: any) => (
                <option key={s.serviceId} value={s.serviceId}>{s.name} ({s.durationMin} {isAr ? 'دقيقة' : 'min'})</option>
              ))}
            </select>
            {errors.serviceId && <p className="text-xs text-red-500 mt-1">{errors.serviceId}</p>}
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label">{isAr ? 'التاريخ *' : 'Date *'}</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => { setForm({ ...form, startDate: e.target.value }); setErrors({ ...errors, startDate: undefined }) }}
                className={`input dir-ltr ${errors.startDate ? 'border-red-400' : ''}`}
                min={new Date().toISOString().split('T')[0]}
              />
              {errors.startDate && <p className="text-xs text-red-500 mt-1">{errors.startDate}</p>}
            </div>
            <div>
              <label className="input-label">{isAr ? 'الوقت *' : 'Time *'}</label>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => { setForm({ ...form, startTime: e.target.value }); setErrors({ ...errors, startTime: undefined }) }}
                className={`input dir-ltr ${errors.startTime ? 'border-red-400' : ''}`}
              />
              {errors.startTime && <p className="text-xs text-red-500 mt-1">{errors.startTime}</p>}
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="input-label">{isAr ? 'سبب الزيارة' : 'Visit Reason'}</label>
            <textarea
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="input min-h-[80px] resize-none"
              placeholder={isAr ? 'مثال: فحص دوري، متابعة...' : 'e.g., Routine checkup, follow-up...'}
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={handleCloseModal} className="btn-outline flex-1">
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button type="submit" disabled={createMutation.isPending} className="btn-primary flex-1">
              {createMutation.isPending
                ? (isAr ? 'جاري الإنشاء...' : 'Creating...')
                : (isAr ? 'إنشاء الموعد' : 'Create Appointment')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
