import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import {
  Plus,
  ClipboardList,
  Users,
  Bell,
  CalendarCheck,
  Clock,
  Trash2,
  Filter,
  Send,
  AlertCircle,
} from 'lucide-react'
import { cn, formatDate } from '../lib/utils'
import StatCard from '../components/ui/StatCard'
import DataTable from '../components/ui/DataTable'
import Modal from '../components/ui/Modal'
import SearchInput from '../components/ui/SearchInput'
import Badge from '../components/ui/Badge'

// ─── Types ──────────────────────────────────────────────────────────────────────

interface WaitlistEntry {
  waitlistId: string
  orgId: string
  patientId: string
  patientName?: string | null
  serviceId?: string | null
  providerId?: string | null
  facilityId?: string | null
  priority: number
  preferredDate?: string | null
  preferredTime?: string | null
  status: string
  notifiedAt?: string | null
  createdAt: string
  updatedAt: string
}

interface WaitlistStats {
  total: number
  waiting: number
  notified: number
  booked: number
  expired: number
}

interface Patient {
  patientId: string
  firstName: string
  lastName: string
}

interface Service {
  serviceId: string
  name: string
  nameAr?: string
}

interface Provider {
  providerId: string
  name: string
  nameAr?: string
  specialty?: string
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const statusConfig: Record<string, { ar: string; en: string; variant: 'warning' | 'info' | 'success' | 'neutral' | 'danger' }> = {
  waiting: { ar: 'بالانتظار', en: 'Waiting', variant: 'warning' },
  notified: { ar: 'تم الإبلاغ', en: 'Notified', variant: 'info' },
  booked: { ar: 'تم الحجز', en: 'Booked', variant: 'success' },
  expired: { ar: 'منتهي', en: 'Expired', variant: 'neutral' },
}

const timeLabels: Record<string, { ar: string; en: string }> = {
  morning: { ar: 'صباحاً', en: 'Morning' },
  afternoon: { ar: 'ظهراً', en: 'Afternoon' },
  evening: { ar: 'مساءً', en: 'Evening' },
}

const priorityLabels = (priority: number, isAr: boolean): { label: string; color: string } => {
  if (priority >= 75) return { label: isAr ? 'عاجل' : 'Urgent', color: 'text-danger-600 bg-danger-50' }
  if (priority >= 50) return { label: isAr ? 'مرتفع' : 'High', color: 'text-warning-600 bg-warning-50' }
  if (priority >= 25) return { label: isAr ? 'متوسط' : 'Medium', color: 'text-blue-600 bg-blue-50' }
  return { label: isAr ? 'منخفض' : 'Low', color: 'text-gray-600 bg-gray-100' }
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function Waitlist() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const orgId = user?.org?.id || ''

  // State
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const limit = 20

  const [showAddModal, setShowAddModal] = useState(false)
  const [showNotifyModal, setShowNotifyModal] = useState<WaitlistEntry | null>(null)

  // Add form state
  const [formData, setFormData] = useState({
    patientId: '',
    serviceId: '',
    providerId: '',
    priority: 0,
    preferredDate: '',
    preferredTime: '' as string,
  })

  const [notifyMessage, setNotifyMessage] = useState('')

  // ─── Queries ────────────────────────────────────────────────────────────────

  const { data: statsData } = useQuery<WaitlistStats>({
    queryKey: ['waitlist-stats', orgId],
    queryFn: async () => {
      if (!orgId) return { total: 0, waiting: 0, notified: 0, booked: 0, expired: 0 }
      try {
        const res = await api.get(`/api/waitlist/stats/${orgId}`)
        return res.data
      } catch {
        return { total: 0, waiting: 0, notified: 0, booked: 0, expired: 0 }
      }
    },
    enabled: !!orgId,
  })

  const { data: waitlistData, isLoading } = useQuery({
    queryKey: ['waitlist', orgId, page, statusFilter],
    queryFn: async () => {
      if (!orgId) return { data: [], pagination: { page: 1, limit, total: 0, totalPages: 0 } }
      try {
        const params = new URLSearchParams()
        params.set('page', String(page))
        params.set('limit', String(limit))
        if (statusFilter !== 'all') params.set('status', statusFilter)
        const res = await api.get(`/api/waitlist/${orgId}?${params}`)
        return res.data
      } catch {
        return { data: [], pagination: { page: 1, limit, total: 0, totalPages: 0 } }
      }
    },
    enabled: !!orgId,
  })

  // Patients for the picker
  const { data: patients } = useQuery<Patient[]>({
    queryKey: ['patients-list', orgId],
    queryFn: async () => {
      if (!orgId) return []
      try {
        const res = await api.get(`/api/patients/${orgId}?limit=200`)
        return res.data?.data || res.data || []
      } catch {
        return []
      }
    },
    enabled: !!orgId && showAddModal,
  })

  // Services for the picker
  const { data: services } = useQuery<Service[]>({
    queryKey: ['services-list', orgId],
    queryFn: async () => {
      if (!orgId) return []
      try {
        const res = await api.get(`/api/services/${orgId}`)
        return res.data?.data || res.data || []
      } catch {
        return []
      }
    },
    enabled: !!orgId && showAddModal,
  })

  // Providers for the picker
  const { data: providers } = useQuery<Provider[]>({
    queryKey: ['providers-list', orgId],
    queryFn: async () => {
      if (!orgId) return []
      try {
        const res = await api.get(`/api/providers/${orgId}`)
        return res.data?.data || res.data || []
      } catch {
        return []
      }
    },
    enabled: !!orgId && showAddModal,
  })

  // ─── Mutations ──────────────────────────────────────────────────────────────

  const addMutation = useMutation({
    mutationFn: (data: typeof formData) =>
      api.post('/api/waitlist/add', {
        patientId: data.patientId,
        serviceId: data.serviceId || undefined,
        providerId: data.providerId || undefined,
        priority: data.priority,
        preferredDate: data.preferredDate || undefined,
        preferredTime: data.preferredTime || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] })
      queryClient.invalidateQueries({ queryKey: ['waitlist-stats'] })
      resetForm()
      setShowAddModal(false)
    },
  })

  const notifyMutation = useMutation({
    mutationFn: ({ waitlistId, message }: { waitlistId: string; message?: string }) =>
      api.post('/api/waitlist/notify', { waitlistId, message: message || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] })
      queryClient.invalidateQueries({ queryKey: ['waitlist-stats'] })
      setShowNotifyModal(null)
      setNotifyMessage('')
    },
  })

  const bookMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/api/waitlist/${id}/book`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] })
      queryClient.invalidateQueries({ queryKey: ['waitlist-stats'] })
    },
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/waitlist/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] })
      queryClient.invalidateQueries({ queryKey: ['waitlist-stats'] })
    },
  })

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const resetForm = () => {
    setFormData({
      patientId: '',
      serviceId: '',
      providerId: '',
      priority: 0,
      preferredDate: '',
      preferredTime: '',
    })
  }

  // ─── Computed ───────────────────────────────────────────────────────────────

  const entries: WaitlistEntry[] = waitlistData?.data || []
  const pagination = waitlistData?.pagination || { page: 1, limit, total: 0, totalPages: 0 }
  const stats = statsData || { total: 0, waiting: 0, notified: 0, booked: 0, expired: 0 }

  const filteredEntries = entries.filter(e => {
    if (!search) return true
    const name = (e.patientName || '').toLowerCase()
    return name.includes(search.toLowerCase())
  })

  // ─── Columns ────────────────────────────────────────────────────────────────

  const columns = [
    {
      key: 'patient',
      header: isAr ? 'المريض' : 'Patient',
      render: (e: WaitlistEntry) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary-100 flex items-center justify-center">
            <span className="text-primary-700 font-bold text-sm">
              {(e.patientName || '?').charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="font-medium text-healthcare-text">{e.patientName || e.patientId.substring(0, 8)}</p>
            <p className="text-xs text-healthcare-muted">{isAr ? 'أُضيف' : 'Added'} {formatDate(e.createdAt)}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'preferred',
      header: isAr ? 'التاريخ المفضل' : 'Preferred Date',
      render: (e: WaitlistEntry) => (
        <div>
          {e.preferredDate ? (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-sm">{formatDate(e.preferredDate)}</span>
              {e.preferredTime && (
                <span className="text-xs text-healthcare-muted">
                  ({timeLabels[e.preferredTime]?.[isAr ? 'ar' : 'en'] || e.preferredTime})
                </span>
              )}
            </div>
          ) : (
            <span className="text-sm text-healthcare-muted">—</span>
          )}
        </div>
      ),
    },
    {
      key: 'priority',
      header: isAr ? 'الأولوية' : 'Priority',
      render: (e: WaitlistEntry) => {
        const p = priorityLabels(e.priority, isAr)
        return (
          <div className="flex items-center gap-2">
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', p.color)}>
              {p.label}
            </span>
            <span className="text-xs text-healthcare-muted">{e.priority}</span>
          </div>
        )
      },
    },
    {
      key: 'status',
      header: isAr ? 'الحالة' : 'Status',
      render: (e: WaitlistEntry) => {
        const cfg = statusConfig[e.status] || { ar: e.status, en: e.status, variant: 'neutral' as const }
        return (
          <Badge variant={cfg.variant} dot>
            {isAr ? cfg.ar : cfg.en}
          </Badge>
        )
      },
    },
    {
      key: 'actions',
      header: isAr ? 'إجراءات' : 'Actions',
      render: (e: WaitlistEntry) => (
        <div className="flex items-center gap-1">
          {e.status === 'waiting' && (
            <button
              onClick={(ev) => { ev.stopPropagation(); setShowNotifyModal(e) }}
              className="btn-icon btn-ghost p-2 min-w-[32px] min-h-[32px] text-primary-600"
              title={isAr ? 'إبلاغ المريض' : 'Notify Patient'}
            >
              <Bell className="h-4 w-4" />
            </button>
          )}
          {(e.status === 'waiting' || e.status === 'notified') && (
            <button
              onClick={(ev) => { ev.stopPropagation(); bookMutation.mutate(e.waitlistId) }}
              className="btn-icon btn-ghost p-2 min-w-[32px] min-h-[32px] text-green-600"
              title={isAr ? 'تحويل لحجز' : 'Mark as Booked'}
            >
              <CalendarCheck className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={(ev) => {
              ev.stopPropagation()
              if (confirm(isAr ? 'هل تريد إزالة هذا المريض من قائمة الانتظار؟' : 'Remove from waitlist?')) {
                removeMutation.mutate(e.waitlistId)
              }
            }}
            className="btn-icon btn-ghost p-2 min-w-[32px] min-h-[32px] text-danger-500 hover:bg-danger-50"
            title={isAr ? 'إزالة' : 'Remove'}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ]

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">{isAr ? 'قائمة الانتظار' : 'Waitlist'}</h1>
          <p className="text-healthcare-muted">
            {isAr ? 'إدارة قائمة انتظار المواعيد' : 'Manage appointment waitlist'}
          </p>
        </div>
        <button onClick={() => { resetForm(); setShowAddModal(true) }} className="btn-primary">
          <Plus className="h-5 w-5" />
          {isAr ? 'إضافة للانتظار' : 'Add to Waitlist'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          value={stats.waiting}
          label={isAr ? 'بالانتظار' : 'Waiting'}
          iconBg="bg-warning-100"
          iconColor="text-warning-600"
        />
        <StatCard
          icon={Clock}
          value={stats.total}
          label={isAr ? 'إجمالي القائمة' : 'Total in List'}
          iconBg="bg-primary-100"
          iconColor="text-primary-600"
        />
        <StatCard
          icon={Bell}
          value={stats.notified}
          label={isAr ? 'تم إبلاغهم' : 'Notified'}
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
        />
        <StatCard
          icon={CalendarCheck}
          value={stats.booked}
          label={isAr ? 'تم الحجز' : 'Booked'}
          iconBg="bg-green-100"
          iconColor="text-green-600"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={isAr ? 'بحث عن مريض...' : 'Search patient...'}
          className="w-full sm:w-72"
        />
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            className="input py-2 text-sm min-w-[140px]"
          >
            <option value="all">{isAr ? 'جميع الحالات' : 'All Status'}</option>
            {Object.entries(statusConfig).map(([key, cfg]) => (
              <option key={key} value={key}>{isAr ? cfg.ar : cfg.en}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Status summary pills */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(statusConfig).map(([key, cfg]) => {
          const count = key === 'waiting' ? stats.waiting : key === 'notified' ? stats.notified : key === 'booked' ? stats.booked : stats.expired
          return (
            <button
              key={key}
              onClick={() => { setStatusFilter(statusFilter === key ? 'all' : key); setPage(1) }}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors border',
                statusFilter === key
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'
              )}
            >
              {isAr ? cfg.ar : cfg.en} ({count})
            </button>
          )
        })}
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredEntries}
        isLoading={isLoading}
        keyExtractor={(e) => e.waitlistId}
        emptyIcon={ClipboardList}
        emptyTitle={isAr ? 'قائمة الانتظار فارغة' : 'Waitlist is empty'}
        emptyDescription={isAr ? 'لا يوجد مرضى في قائمة الانتظار حالياً' : 'No patients currently on the waitlist'}
        emptyAction={{ label: isAr ? 'إضافة مريض' : 'Add Patient', onClick: () => { resetForm(); setShowAddModal(true) } }}
        pagination={pagination.totalPages > 1 ? {
          page: pagination.page,
          totalPages: pagination.totalPages,
          total: pagination.total,
          limit: pagination.limit,
          onPageChange: setPage,
        } : undefined}
      />

      {/* Add to Waitlist Modal */}
      <Modal
        open={showAddModal}
        onClose={() => { setShowAddModal(false); resetForm() }}
        title={isAr ? 'إضافة للانتظار' : 'Add to Waitlist'}
        size="xl"
      >
        <div className="space-y-4">
          {/* Patient Picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isAr ? 'المريض' : 'Patient'} <span className="text-danger-500">*</span>
            </label>
            <select
              value={formData.patientId}
              onChange={(e) => setFormData(prev => ({ ...prev, patientId: e.target.value }))}
              className="input focus:ring-primary-400/20 focus:border-primary-500"
            >
              <option value="">{isAr ? 'اختر المريض...' : 'Select patient...'}</option>
              {(patients || []).map(p => (
                <option key={p.patientId} value={p.patientId}>
                  {p.firstName} {p.lastName}
                </option>
              ))}
            </select>
          </div>

          {/* Service + Provider */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {isAr ? 'الخدمة' : 'Service'}
              </label>
              <select
                value={formData.serviceId}
                onChange={(e) => setFormData(prev => ({ ...prev, serviceId: e.target.value }))}
                className="input focus:ring-primary-400/20 focus:border-primary-500"
              >
                <option value="">{isAr ? 'اختر الخدمة...' : 'Select service...'}</option>
                {(services || []).map(s => (
                  <option key={s.serviceId} value={s.serviceId}>
                    {isAr ? (s.nameAr || s.name) : s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {isAr ? 'الطبيب' : 'Provider'}
              </label>
              <select
                value={formData.providerId}
                onChange={(e) => setFormData(prev => ({ ...prev, providerId: e.target.value }))}
                className="input focus:ring-primary-400/20 focus:border-primary-500"
              >
                <option value="">{isAr ? 'اختر الطبيب...' : 'Select provider...'}</option>
                {(providers || []).map(p => (
                  <option key={p.providerId} value={p.providerId}>
                    {isAr ? (p.nameAr || p.name) : p.name}
                    {p.specialty ? ` — ${p.specialty}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isAr ? 'الأولوية' : 'Priority'}: {formData.priority}
              <span className={cn(
                'ms-2 px-2 py-0.5 rounded-full text-xs font-medium',
                priorityLabels(formData.priority, isAr).color
              )}>
                {priorityLabels(formData.priority, isAr).label}
              </span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={formData.priority}
              onChange={(e) => setFormData(prev => ({ ...prev, priority: Number(e.target.value) }))}
              className="w-full accent-primary-600"
            />
            <div className="flex justify-between text-xs text-healthcare-muted">
              <span>{isAr ? 'منخفض' : 'Low'}</span>
              <span>{isAr ? 'متوسط' : 'Medium'}</span>
              <span>{isAr ? 'مرتفع' : 'High'}</span>
              <span>{isAr ? 'عاجل' : 'Urgent'}</span>
            </div>
          </div>

          {/* Preferred Date + Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {isAr ? 'التاريخ المفضل' : 'Preferred Date'}
              </label>
              <input
                type="date"
                value={formData.preferredDate}
                onChange={(e) => setFormData(prev => ({ ...prev, preferredDate: e.target.value }))}
                className="input focus:ring-primary-400/20 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {isAr ? 'الوقت المفضل' : 'Preferred Time'}
              </label>
              <select
                value={formData.preferredTime}
                onChange={(e) => setFormData(prev => ({ ...prev, preferredTime: e.target.value }))}
                className="input focus:ring-primary-400/20 focus:border-primary-500"
              >
                <option value="">{isAr ? 'أي وقت' : 'Any time'}</option>
                <option value="morning">{isAr ? 'صباحاً' : 'Morning'}</option>
                <option value="afternoon">{isAr ? 'ظهراً' : 'Afternoon'}</option>
                <option value="evening">{isAr ? 'مساءً' : 'Evening'}</option>
              </select>
            </div>
          </div>

          {addMutation.isError && (
            <div className="p-3 bg-danger-50 text-danger-600 rounded-lg text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {isAr ? 'فشلت عملية الإضافة. قد يكون المريض موجوداً بالفعل في القائمة.' : 'Failed to add. Patient may already be on the waitlist.'}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              onClick={() => { setShowAddModal(false); resetForm() }}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              onClick={() => addMutation.mutate(formData)}
              disabled={!formData.patientId || addMutation.isPending}
              className="btn-primary"
            >
              <Plus className="h-4 w-4" />
              {addMutation.isPending ? (isAr ? 'جاري الإضافة...' : 'Adding...') : (isAr ? 'إضافة للقائمة' : 'Add to Waitlist')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Notify Modal */}
      <Modal
        open={!!showNotifyModal}
        onClose={() => { setShowNotifyModal(null); setNotifyMessage('') }}
        title={isAr ? 'إبلاغ المريض' : 'Notify Patient'}
        size="md"
      >
        {showNotifyModal && (
          <div className="space-y-4">
            <div className="bg-primary-50 rounded-lg p-4 flex items-start gap-3">
              <Send className="h-5 w-5 text-primary-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-primary-800">
                  {isAr ? 'سيتم إبلاغ المريض بتوفر موعد' : 'Patient will be notified about available slot'}
                </p>
                <p className="text-sm text-primary-600 mt-1">
                  {showNotifyModal.patientName || showNotifyModal.patientId.substring(0, 8)}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {isAr ? 'رسالة مخصصة (اختياري)' : 'Custom message (optional)'}
              </label>
              <textarea
                rows={3}
                value={notifyMessage}
                onChange={(e) => setNotifyMessage(e.target.value)}
                className="input focus:ring-primary-400/20 focus:border-primary-500"
                placeholder={isAr
                  ? 'تتوفر فتحة في المواعيد! يرجى الاتصال بنا لتأكيد موعدك.'
                  : 'A slot has opened up! Please call us to secure your appointment.'
                }
              />
            </div>

            {notifyMutation.isError && (
              <div className="p-3 bg-danger-50 text-danger-600 rounded-lg text-sm">
                {isAr ? 'فشل إرسال الإبلاغ' : 'Failed to send notification'}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                onClick={() => { setShowNotifyModal(null); setNotifyMessage('') }}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={() => notifyMutation.mutate({
                  waitlistId: showNotifyModal.waitlistId,
                  message: notifyMessage || undefined,
                })}
                disabled={notifyMutation.isPending}
                className="btn-primary"
              >
                <Bell className="h-4 w-4" />
                {notifyMutation.isPending ? (isAr ? 'جاري الإرسال...' : 'Sending...') : (isAr ? 'إبلاغ المريض' : 'Notify Patient')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
