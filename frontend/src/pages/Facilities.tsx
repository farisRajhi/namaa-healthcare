import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { Plus, Building2, Pencil, Trash2, Users, MapPin } from 'lucide-react'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { useToast } from '../components/ui/Toast'

interface Facility {
  facilityId: string
  name: string
  timezone: string
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  region: string | null
  postalCode: string | null
  country: string | null
  createdAt: string
  _count: { providers: number; appointments: number }
}

interface FacilityForm {
  name: string; timezone: string; addressLine1: string; addressLine2: string
  city: string; region: string; postalCode: string; country: string
}

const defaultForm: FacilityForm = {
  name: '', timezone: 'Asia/Riyadh', addressLine1: '', addressLine2: '',
  city: '', region: '', postalCode: '', country: 'Saudi Arabia',
}

export default function Facilities() {
  const [showModal, setShowModal] = useState(false)
  const [editingFacility, setEditingFacility] = useState<Facility | null>(null)
  const [form, setForm] = useState<FacilityForm>(defaultForm)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ['facilities'],
    queryFn: async () => (await api.get('/api/facilities')).data,
  })

  const createMutation = useMutation({
    mutationFn: (data: FacilityForm) => api.post('/api/facilities', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facilities'] }); handleCloseModal()
      addToast({ type: 'success', title: isAr ? 'تم إضافة العيادة' : 'Facility added' })
    },
    onError: () => addToast({ type: 'error', title: isAr ? 'فشل إضافة العيادة' : 'Failed to add facility' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<FacilityForm> }) => api.put(`/api/facilities/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facilities'] }); handleCloseModal()
      addToast({ type: 'success', title: isAr ? 'تم تحديث العيادة' : 'Facility updated' })
    },
    onError: () => addToast({ type: 'error', title: isAr ? 'فشل تحديث العيادة' : 'Failed to update facility' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/facilities/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facilities'] }); setDeleteConfirm(null)
      addToast({ type: 'success', title: isAr ? 'تم حذف العيادة' : 'Facility deleted' })
    },
    onError: () => addToast({ type: 'error', title: isAr ? 'فشل حذف العيادة' : 'Failed to delete facility' }),
  })

  const facilities: Facility[] = data?.data || []

  const handleOpenModal = (facility?: Facility) => {
    if (facility) {
      setEditingFacility(facility)
      setForm({
        name: facility.name, timezone: facility.timezone,
        addressLine1: facility.addressLine1 || '', addressLine2: facility.addressLine2 || '',
        city: facility.city || '', region: facility.region || '',
        postalCode: facility.postalCode || '', country: facility.country || '',
      })
    } else { setEditingFacility(null); setForm(defaultForm) }
    setShowModal(true)
  }

  const handleCloseModal = () => { setShowModal(false); setEditingFacility(null); setForm(defaultForm) }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    if (editingFacility) updateMutation.mutate({ id: editingFacility.facilityId, data: form })
    else createMutation.mutate(form)
  }

  const getAddress = (f: Facility) => {
    const parts = [f.addressLine1, f.city, f.region].filter(Boolean)
    return parts.join('، ') || (isAr ? 'لا يوجد عنوان' : 'No address')
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{isAr ? 'المرافق' : 'Clinics'}</h1>
          <p className="page-subtitle">{isAr ? 'إدارة المرافق الصحية والعيادات' : 'Manage your clinic locations'}</p>
        </div>
        <button onClick={() => handleOpenModal()} className="btn-primary">
          <Plus className="h-4 w-4" />
          {isAr ? 'إضافة عيادة' : 'Add Clinic'}
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64"><LoadingSpinner /></div>
      ) : facilities.length === 0 ? (
        <div className="table-container">
          <EmptyState
            icon={Building2}
            title={isAr ? 'لا توجد عيادات' : 'No clinics found'}
            description={isAr ? 'ابدأ بإضافة عيادة جديدة' : 'Add your first clinic'}
            action={{ label: isAr ? 'إضافة عيادة' : 'Add Clinic', onClick: () => handleOpenModal() }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {facilities.map((facility) => (
            <div key={facility.facilityId} className="card p-5 group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-success-50 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-6 w-6 text-success-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-healthcare-text">{facility.name}</h3>
                    <p className="text-xs text-healthcare-muted">{facility.timezone}</p>
                  </div>
                </div>
                {deleteConfirm === facility.facilityId ? (
                  <div className="flex items-center gap-1">
                    <button onClick={() => deleteMutation.mutate(facility.facilityId)} className="btn-danger btn-sm px-2 py-1 min-h-0 text-xs">{isAr ? 'نعم' : 'Yes'}</button>
                    <button onClick={() => setDeleteConfirm(null)} className="btn-ghost btn-sm px-2 py-1 min-h-0 text-xs">{isAr ? 'لا' : 'No'}</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleOpenModal(facility)} className="btn-icon btn-ghost p-1.5 min-w-[32px] min-h-[32px]"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setDeleteConfirm(facility.facilityId)} className="btn-icon btn-ghost p-1.5 min-w-[32px] min-h-[32px] hover:text-danger-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-healthcare-muted">
                  <MapPin className="h-3.5 w-3.5 text-success-400" />
                  <span className="truncate">{getAddress(facility)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-healthcare-muted">
                  <Users className="h-3.5 w-3.5 text-success-400" />
                  {facility._count.providers} {isAr ? 'طبيب' : 'providers'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={showModal}
        onClose={handleCloseModal}
        title={editingFacility ? (isAr ? 'تعديل العيادة' : 'Edit Clinic') : (isAr ? 'إضافة عيادة' : 'Add Clinic')}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="input-label">{isAr ? 'اسم العيادة *' : 'Clinic Name *'}</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={isAr ? 'مثال: الفرع الرئيسي' : 'e.g., Main Branch'} className="input" required />
          </div>
          <div>
            <label className="input-label">{isAr ? 'المنطقة الزمنية *' : 'Timezone *'}</label>
            <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className="select" required>
              <option value="Asia/Riyadh">Asia/Riyadh (GMT+3)</option>
              <option value="Asia/Dubai">Asia/Dubai (GMT+4)</option>
              <option value="Asia/Kuwait">Asia/Kuwait (GMT+3)</option>
              <option value="UTC">UTC</option>
            </select>
          </div>
          <div className="border-t border-healthcare-border/30 pt-4">
            <h3 className="text-sm font-semibold text-healthcare-text mb-3">{isAr ? 'العنوان (اختياري)' : 'Address (Optional)'}</h3>
            <div className="space-y-3">
              <input type="text" value={form.addressLine1} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
                placeholder={isAr ? 'العنوان 1' : 'Address Line 1'} className="input" />
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder={isAr ? 'المدينة' : 'City'} className="input" />
                <input type="text" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder={isAr ? 'المنطقة' : 'Region'} className="input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} placeholder={isAr ? 'الرمز البريدي' : 'Postal Code'} className="input" />
                <input type="text" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder={isAr ? 'الدولة' : 'Country'} className="input" />
              </div>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={handleCloseModal} className="btn-outline flex-1">{isAr ? 'إلغاء' : 'Cancel'}</button>
            <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="btn-primary flex-1">
              {(createMutation.isPending || updateMutation.isPending) ? (isAr ? 'جاري الحفظ...' : 'Saving...') : editingFacility ? (isAr ? 'تحديث' : 'Update') : (isAr ? 'إضافة' : 'Add')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
