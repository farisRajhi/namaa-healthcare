import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import {
  Plus, CheckCircle, XCircle, Pill, X, Clock, RefreshCw,
} from 'lucide-react'
import { cn, formatDate } from '../lib/utils'
import SearchInput from '../components/ui/SearchInput'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'

interface Prescription {
  prescriptionId: string
  patientId: string
  patientName?: string
  medicationName: string
  medicationNameAr?: string
  dosage: string
  frequency: string
  refillsRemaining: number
  refillsTotal: number
  status: string
  providerId?: string
  startDate?: string
  endDate?: string
  createdAt?: string
  refills?: RefillEntry[]
  pharmacyName?: string
  pharmacyPhone?: string
  notes?: string
}

interface RefillEntry {
  refillId: string
  requestedAt: string
  status: string
  processedBy?: string
  processedAt?: string
  notes?: string
}

const statusConfig: Record<string, { ar: string; en: string; variant: string }> = {
  active: { ar: 'نشط', en: 'Active', variant: 'success' },
  expired: { ar: 'منتهي', en: 'Expired', variant: 'danger' },
  cancelled: { ar: 'ملغي', en: 'Cancelled', variant: 'neutral' },
  completed: { ar: 'مكتمل', en: 'Completed', variant: 'info' },
  pending_refill: { ar: 'بانتظار الصرف', en: 'Pending Refill', variant: 'warning' },
}

const frequencyLabels: Record<string, string> = {
  once_daily: 'مرة يومياً',
  twice_daily: 'مرتين يومياً',
  three_daily: 'ثلاث مرات يومياً',
  as_needed: 'عند الحاجة',
}

export default function Prescriptions() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [selectedRx, setSelectedRx] = useState<Prescription | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'refills'>('all')
  const [newRx, setNewRx] = useState({
    patientId: '',
    providerId: '',
    medicationName: '',
    dosage: '',
    frequency: 'once_daily',
    refillsTotal: 3,
    startDate: new Date().toISOString().split('T')[0],
  })

  // Backend has no list-all prescriptions endpoint (only per-patient).
  // We query with graceful fallback — if a patientId search is provided, use
  // /api/prescriptions/patient/:patientId, otherwise show mock/empty.
  const { data, isLoading } = useQuery({
    queryKey: ['prescriptions', { page, search, status: statusFilter }],
    queryFn: async () => {
      try {
        // If user typed a UUID-like search, try to use it as patientId
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search)
        if (isUuid) {
          const params = new URLSearchParams({ page: String(page), limit: '10' })
          if (statusFilter !== 'all') params.set('status', statusFilter)
          const res = await api.get(`/api/prescriptions/patient/${search}?${params}`)
          const prescriptions = (res.data?.data || []).map((rx: any) => ({
            ...rx,
            patientName: `${isAr ? 'مريض' : 'Patient'} ${rx.patientId?.substring(0, 8) || ''}`,
            medicationName: rx.medicationName || rx.medication || '',
          }))
          return { data: prescriptions, pagination: res.data?.pagination }
        }
        // No valid patient ID — return empty with helpful message
        return { data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }
      } catch {
        return { data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }
      }
    },
  })

  // No dedicated refill-requests endpoint — graceful empty
  const { data: refillRequests } = useQuery({
    queryKey: ['prescriptions', 'refill-requests'],
    queryFn: async () => {
      // Backend doesn't have a global refill-requests endpoint
      return []
    },
    placeholderData: [],
  })

  // Backend: POST /api/prescriptions/:id/refill/:refillId/process { action: 'approved', notes? }
  const approveMutation = useMutation({
    mutationFn: async ({ prescriptionId, refillId }: { prescriptionId: string; refillId: string }) => {
      return api.post(`/api/prescriptions/${prescriptionId}/refill/${refillId}/process`, {
        action: 'approved',
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['prescriptions'] }),
  })

  const denyMutation = useMutation({
    mutationFn: async ({ prescriptionId, refillId }: { prescriptionId: string; refillId: string }) => {
      return api.post(`/api/prescriptions/${prescriptionId}/refill/${refillId}/process`, {
        action: 'denied',
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['prescriptions'] }),
  })

  // Backend: POST /api/prescriptions with createSchema fields
  const addMutation = useMutation({
    mutationFn: (data: typeof newRx) => api.post('/api/prescriptions', {
      patientId: data.patientId,
      providerId: data.providerId,
      medicationName: data.medicationName,
      dosage: data.dosage,
      frequency: data.frequency,
      refillsTotal: data.refillsTotal,
      startDate: new Date(data.startDate).toISOString(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prescriptions'] })
      setShowAddModal(false)
      setNewRx({ patientId: '', providerId: '', medicationName: '', dosage: '', frequency: 'once_daily', refillsTotal: 3, startDate: new Date().toISOString().split('T')[0] })
    },
  })

  const prescriptions: Prescription[] = data?.data || []
  const pagination = data?.pagination

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{isAr ? 'الوصفات الطبية' : 'Prescriptions'}</h1>
          <p className="page-subtitle">{isAr ? 'إدارة الوصفات وطلبات إعادة الصرف' : 'Manage prescriptions and refills'}</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn-primary">
          <Plus className="h-4 w-4" />{isAr ? 'وصفة جديدة' : 'New Prescription'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-healthcare-border/30">
        <button onClick={() => setActiveTab('all')}
          className={cn('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'all' ? 'border-primary-500 text-primary-600' : 'border-transparent text-healthcare-muted')}>
          <Pill className="h-4 w-4" />{isAr ? 'الوصفات' : 'All'}
        </button>
        <button onClick={() => setActiveTab('refills')}
          className={cn('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'refills' ? 'border-primary-500 text-primary-600' : 'border-transparent text-healthcare-muted')}>
          <RefreshCw className="h-4 w-4" />{isAr ? 'طلبات الصرف' : 'Refills'}
          {(refillRequests || []).length > 0 && (
            <span className="px-2 py-0.5 bg-danger-500 text-white rounded-full text-xs font-bold">{(refillRequests || []).length}</span>
          )}
        </button>
      </div>

      {activeTab === 'all' ? (
        <>
          <div className="flex flex-col sm:flex-row gap-3">
            <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }}
              placeholder={isAr ? 'أدخل معرّف المريض (UUID) للبحث...' : 'Enter Patient ID (UUID) to search...'} className="flex-1" />
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} className="select max-w-[200px]">
              <option value="all">{isAr ? 'جميع الحالات' : 'All Statuses'}</option>
              <option value="active">{isAr ? 'نشط' : 'Active'}</option>
              <option value="completed">{isAr ? 'مكتمل' : 'Completed'}</option>
              <option value="expired">{isAr ? 'منتهي' : 'Expired'}</option>
              <option value="cancelled">{isAr ? 'ملغي' : 'Cancelled'}</option>
            </select>
          </div>

          <div className="table-container">
            {isLoading ? (
              <div className="flex items-center justify-center h-64"><LoadingSpinner /></div>
            ) : prescriptions.length === 0 ? (
              <EmptyState icon={Pill} title={isAr ? 'لا توجد وصفات — أدخل معرّف المريض للبحث' : 'No prescriptions — enter a Patient ID to search'} />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="table-header">
                    <tr>
                      <th>{isAr ? 'المريض' : 'Patient'}</th>
                      <th>{isAr ? 'الدواء' : 'Medication'}</th>
                      <th>{isAr ? 'الجرعة' : 'Dosage'}</th>
                      <th>{isAr ? 'إعادات الصرف' : 'Refills'}</th>
                      <th>{isAr ? 'الحالة' : 'Status'}</th>
                      <th>{isAr ? 'التاريخ' : 'Date'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prescriptions.map((rx) => {
                      const status = statusConfig[rx.status] || statusConfig.active
                      return (
                        <tr key={rx.prescriptionId} className="table-row cursor-pointer" onClick={() => setSelectedRx(rx)}>
                          <td><span className="font-semibold text-healthcare-text">{rx.patientName || rx.patientId?.substring(0, 8)}</span></td>
                          <td>
                            <div className="flex items-center gap-2">
                              <Pill className="h-4 w-4 text-primary-400" />
                              <span className="text-healthcare-text">{rx.medicationName}</span>
                            </div>
                          </td>
                          <td className="text-sm text-healthcare-muted">{rx.dosage} — {frequencyLabels[rx.frequency] || rx.frequency}</td>
                          <td>
                            <span className={cn('text-sm font-bold', rx.refillsRemaining === 0 ? 'text-danger-500' : 'text-healthcare-text')}>
                              {rx.refillsRemaining ?? 0}/{rx.refillsTotal ?? 0}
                            </span>
                          </td>
                          <td><Badge variant={status.variant as any}>{isAr ? status.ar : status.en}</Badge></td>
                          <td className="text-sm text-healthcare-muted">{rx.startDate ? formatDate(rx.startDate) : rx.createdAt ? formatDate(rx.createdAt) : '-'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {pagination && pagination.totalPages > 1 && (
              <div className="px-5 py-4 border-t border-healthcare-border/20 flex items-center justify-between">
                <p className="text-sm text-healthcare-muted">
                  {isAr ? `صفحة ${pagination.page} من ${pagination.totalPages}` : `Page ${pagination.page} of ${pagination.totalPages}`}
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="pagination-btn">{isAr ? 'السابق' : 'Previous'}</button>
                  <button onClick={() => setPage(p => p + 1)} disabled={page >= pagination.totalPages} className="pagination-btn">{isAr ? 'التالي' : 'Next'}</button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="table-container">
          <div className="px-5 py-4 border-b border-healthcare-border/20">
            <h2 className="text-lg font-heading font-semibold text-healthcare-text">{isAr ? 'طلبات الصرف المعلقة' : 'Pending Refill Requests'}</h2>
          </div>
          {(refillRequests || []).length === 0 ? (
            <EmptyState icon={CheckCircle} title={isAr ? 'لا توجد طلبات معلقة' : 'No pending requests'} />
          ) : (
            <div className="divide-y divide-healthcare-border/20">
              {(refillRequests as any[]).map((req: any) => (
                <div key={req.refillId} className="px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-healthcare-text">{req.patientId?.substring(0, 8) || 'Unknown'}</p>
                    <p className="text-sm text-healthcare-muted">{req.medicationName || req.medication} — {req.dosage}</p>
                    <p className="text-xs text-healthcare-muted mt-0.5">{isAr ? 'تاريخ الطلب:' : 'Requested:'} {req.requestedAt ? formatDate(req.requestedAt) : '-'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => approveMutation.mutate({ prescriptionId: req.prescriptionId, refillId: req.refillId })}
                      disabled={approveMutation.isPending}
                      className="btn-success btn-sm"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />{isAr ? 'موافقة' : 'Approve'}
                    </button>
                    <button
                      onClick={() => denyMutation.mutate({ prescriptionId: req.prescriptionId, refillId: req.refillId })}
                      disabled={denyMutation.isPending}
                      className="btn-danger btn-sm"
                    >
                      <XCircle className="h-3.5 w-3.5" />{isAr ? 'رفض' : 'Deny'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Detail Drawer */}
      {selectedRx && (
        <div className="fixed inset-0 z-50 flex animate-fade-in">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedRx(null)} />
          <div className="fixed inset-y-0 end-0 w-full max-w-lg bg-white shadow-modal z-50 overflow-y-auto animate-slide-in">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-heading font-bold text-healthcare-text">{isAr ? 'تفاصيل الوصفة' : 'Prescription Details'}</h2>
                <button onClick={() => setSelectedRx(null)} className="btn-icon btn-ghost p-2"><X className="h-5 w-5" /></button>
              </div>
              <div className="space-y-4">
                <div className="bg-primary-50/50 rounded-xl p-4">
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: isAr ? 'المريض' : 'Patient', value: selectedRx.patientName || selectedRx.patientId?.substring(0, 12) },
                      { label: isAr ? 'الدواء' : 'Medication', value: selectedRx.medicationName },
                      { label: isAr ? 'الجرعة' : 'Dosage', value: selectedRx.dosage },
                      { label: isAr ? 'التكرار' : 'Frequency', value: frequencyLabels[selectedRx.frequency] || selectedRx.frequency },
                      { label: isAr ? 'إعادات الصرف' : 'Refills', value: `${selectedRx.refillsRemaining ?? 0}/${selectedRx.refillsTotal ?? 0}` },
                      { label: isAr ? 'الحالة' : 'Status', value: statusConfig[selectedRx.status]?.[isAr ? 'ar' : 'en'] || selectedRx.status },
                      { label: isAr ? 'تاريخ البدء' : 'Start Date', value: selectedRx.startDate ? formatDate(selectedRx.startDate) : '-' },
                      { label: isAr ? 'تاريخ الانتهاء' : 'End Date', value: selectedRx.endDate ? formatDate(selectedRx.endDate) : '-' },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-xs text-healthcare-muted">{label}</p>
                        <p className="font-semibold text-sm text-healthcare-text">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="font-heading font-semibold text-healthcare-text mb-3">{isAr ? 'سجل إعادة الصرف' : 'Refill History'}</h3>
                  {(!selectedRx.refills || selectedRx.refills.length === 0) ? (
                    <p className="text-sm text-healthcare-muted">{isAr ? 'لا يوجد سجل' : 'No refill history'}</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedRx.refills.map((entry) => (
                        <div key={entry.refillId} className="flex items-start gap-3 p-3 bg-primary-50/30 rounded-xl">
                          <div className={cn('mt-0.5 w-6 h-6 rounded-full flex items-center justify-center',
                            entry.status === 'approved' || entry.status === 'dispensed' ? 'bg-success-100' : entry.status === 'denied' ? 'bg-danger-100' : 'bg-warning-100')}>
                            {entry.status === 'approved' || entry.status === 'dispensed' ? <CheckCircle className="h-4 w-4 text-success-600" /> :
                              entry.status === 'denied' ? <XCircle className="h-4 w-4 text-danger-600" /> :
                              <Clock className="h-4 w-4 text-warning-600" />}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold capitalize text-healthcare-text">{entry.status}</p>
                            <p className="text-xs text-healthcare-muted">{formatDate(entry.requestedAt)}</p>
                            {entry.notes && <p className="text-xs text-healthcare-muted mt-1">{entry.notes}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Modal */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title={isAr ? 'وصفة جديدة' : 'New Prescription'}>
        <form onSubmit={(e) => { e.preventDefault(); addMutation.mutate(newRx) }} className="space-y-4">
          <div>
            <label className="input-label">{isAr ? 'معرّف المريض' : 'Patient ID'}</label>
            <input type="text" value={newRx.patientId} onChange={(e) => setNewRx({ ...newRx, patientId: e.target.value })} className="input" required placeholder="UUID" />
          </div>
          <div>
            <label className="input-label">{isAr ? 'معرّف الطبيب' : 'Provider ID'}</label>
            <input type="text" value={newRx.providerId} onChange={(e) => setNewRx({ ...newRx, providerId: e.target.value })} className="input" required placeholder="UUID" />
          </div>
          <div>
            <label className="input-label">{isAr ? 'الدواء' : 'Medication'}</label>
            <input type="text" value={newRx.medicationName} onChange={(e) => setNewRx({ ...newRx, medicationName: e.target.value })} className="input" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label">{isAr ? 'الجرعة' : 'Dosage'}</label>
              <input type="text" value={newRx.dosage} onChange={(e) => setNewRx({ ...newRx, dosage: e.target.value })} className="input" required />
            </div>
            <div>
              <label className="input-label">{isAr ? 'التكرار' : 'Frequency'}</label>
              <select value={newRx.frequency} onChange={(e) => setNewRx({ ...newRx, frequency: e.target.value })} className="input">
                <option value="once_daily">{isAr ? 'مرة يومياً' : 'Once daily'}</option>
                <option value="twice_daily">{isAr ? 'مرتين يومياً' : 'Twice daily'}</option>
                <option value="three_daily">{isAr ? 'ثلاث مرات يومياً' : 'Three times daily'}</option>
                <option value="as_needed">{isAr ? 'عند الحاجة' : 'As needed'}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label">{isAr ? 'إعادات الصرف' : 'Total Refills'}</label>
              <input type="number" min="0" max="12" value={newRx.refillsTotal} onChange={(e) => setNewRx({ ...newRx, refillsTotal: parseInt(e.target.value) || 0 })} className="input" />
            </div>
            <div>
              <label className="input-label">{isAr ? 'تاريخ البدء' : 'Start Date'}</label>
              <input type="date" value={newRx.startDate} onChange={(e) => setNewRx({ ...newRx, startDate: e.target.value })} className="input" required />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowAddModal(false)} className="btn-outline flex-1">{isAr ? 'إلغاء' : 'Cancel'}</button>
            <button type="submit" disabled={addMutation.isPending} className="btn-primary flex-1">
              {addMutation.isPending ? (isAr ? 'جاري الإضافة...' : 'Adding...') : (isAr ? 'إضافة الوصفة' : 'Add Prescription')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
