import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { Plus, User, Building, Briefcase, Pencil, Trash2 } from 'lucide-react'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import Badge from '../components/ui/Badge'

interface Provider {
  providerId: string
  displayName: string
  credentials: string | null
  active: boolean
  departmentId: string | null
  facilityId: string | null
  department: { departmentId: string; name: string } | null
  facility: { facilityId: string; name: string } | null
  services: Array<{ service: { serviceId: string; name: string } }>
}

interface ProviderForm {
  displayName: string
  credentials: string
  departmentId: string
  facilityId: string
  active: boolean
}

const defaultForm: ProviderForm = {
  displayName: '',
  credentials: '',
  departmentId: '',
  facilityId: '',
  active: true,
}

export default function Providers() {
  const [showActive, setShowActive] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null)
  const [form, setForm] = useState<ProviderForm>(defaultForm)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['providers', { active: showActive }],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (showActive) params.set('active', 'true')
      const response = await api.get(`/api/providers?${params}`)
      return response.data
    },
  })

  const { data: departmentsData } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => (await api.get('/api/departments')).data,
  })

  const { data: facilitiesData } = useQuery({
    queryKey: ['facilities'],
    queryFn: async () => (await api.get('/api/facilities')).data,
  })

  const createMutation = useMutation({
    mutationFn: (data: ProviderForm) =>
      api.post('/api/providers', {
        displayName: data.displayName,
        credentials: data.credentials || undefined,
        departmentId: data.departmentId || undefined,
        facilityId: data.facilityId || undefined,
        active: data.active,
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['providers'] }); handleCloseModal() },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ProviderForm> }) =>
      api.put(`/api/providers/${id}`, {
        displayName: data.displayName,
        credentials: data.credentials || undefined,
        departmentId: data.departmentId || undefined,
        facilityId: data.facilityId || undefined,
        active: data.active,
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['providers'] }); handleCloseModal() },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/providers/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['providers'] }); setDeleteConfirm(null) },
  })

  const providers: Provider[] = data?.data || []
  const departments = departmentsData?.data || []
  const facilities = facilitiesData?.data || []

  const handleOpenModal = (provider?: Provider) => {
    if (provider) {
      setEditingProvider(provider)
      setForm({
        displayName: provider.displayName,
        credentials: provider.credentials || '',
        departmentId: provider.departmentId || '',
        facilityId: provider.facilityId || '',
        active: provider.active,
      })
    } else {
      setEditingProvider(null)
      setForm(defaultForm)
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingProvider(null)
    setForm(defaultForm)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.displayName.trim()) return
    if (editingProvider) {
      updateMutation.mutate({ id: editingProvider.providerId, data: form })
    } else {
      createMutation.mutate(form)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{isAr ? 'الأطباء' : 'Providers'}</h1>
          <p className="page-subtitle">{isAr ? 'إدارة الأطباء والكوادر الطبية' : 'Manage doctors and staff'}</p>
        </div>
        <button onClick={() => handleOpenModal()} className="btn-primary">
          <Plus className="h-4 w-4" />
          {isAr ? 'إضافة طبيب' : 'Add Provider'}
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        <button onClick={() => setShowActive(true)} className={showActive ? 'chip-active' : 'chip'}>
          {isAr ? 'النشطون' : 'Active'}
        </button>
        <button onClick={() => setShowActive(false)} className={!showActive ? 'chip-active' : 'chip'}>
          {isAr ? 'الكل' : 'All'}
        </button>
      </div>

      {/* Providers Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64"><LoadingSpinner /></div>
      ) : providers.length === 0 ? (
        <div className="table-container">
          <EmptyState
            icon={User}
            title={isAr ? 'لا يوجد أطباء' : 'No providers found'}
            description={isAr ? 'ابدأ بإضافة طبيب جديد' : 'Add your first provider'}
            action={{ label: isAr ? 'إضافة طبيب' : 'Add Provider', onClick: () => handleOpenModal() }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {providers.map((provider) => (
            <div key={provider.providerId} className="card p-5 group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                    <User className="h-6 w-6 text-primary-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-healthcare-text truncate">{provider.displayName}</h3>
                      {!provider.active && <Badge variant="neutral">{isAr ? 'غير نشط' : 'Inactive'}</Badge>}
                    </div>
                    {provider.credentials && (
                      <p className="text-xs text-healthcare-muted mt-0.5">{provider.credentials}</p>
                    )}
                  </div>
                </div>
                {deleteConfirm === provider.providerId ? (
                  <div className="flex items-center gap-1">
                    <button onClick={() => deleteMutation.mutate(provider.providerId)} className="btn-danger btn-sm px-2 py-1 min-h-0 text-xs">{isAr ? 'نعم' : 'Yes'}</button>
                    <button onClick={() => setDeleteConfirm(null)} className="btn-ghost btn-sm px-2 py-1 min-h-0 text-xs">{isAr ? 'لا' : 'No'}</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleOpenModal(provider)} className="btn-icon btn-ghost p-1.5 min-w-[32px] min-h-[32px]">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setDeleteConfirm(provider.providerId)} className="btn-icon btn-ghost p-1.5 min-w-[32px] min-h-[32px] hover:text-danger-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                {provider.department && (
                  <div className="flex items-center gap-2 text-xs text-healthcare-muted">
                    <Building className="h-3.5 w-3.5 text-primary-400" />
                    {provider.department.name}
                  </div>
                )}
                {provider.facility && (
                  <div className="flex items-center gap-2 text-xs text-healthcare-muted">
                    <Building className="h-3.5 w-3.5 text-primary-400" />
                    {provider.facility.name}
                  </div>
                )}
                {provider.services.length > 0 && (
                  <div className="flex items-start gap-2 text-xs text-healthcare-muted">
                    <Briefcase className="h-3.5 w-3.5 text-primary-400 mt-0.5" />
                    <div className="flex flex-wrap gap-1">
                      {provider.services.slice(0, 3).map((ps, i) => (
                        <span key={i} className="badge-info text-[10px] px-1.5 py-0.5">{ps.service.name}</span>
                      ))}
                      {provider.services.length > 3 && (
                        <span className="badge-neutral text-[10px] px-1.5 py-0.5">+{provider.services.length - 3}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={showModal}
        onClose={handleCloseModal}
        title={editingProvider ? (isAr ? 'تعديل الطبيب' : 'Edit Provider') : (isAr ? 'إضافة طبيب' : 'Add Provider')}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="input-label">{isAr ? 'الاسم *' : 'Name *'}</label>
            <input type="text" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder={isAr ? 'مثال: د. أحمد محمد' : 'e.g., Dr. Ahmed Mohammed'} className="input" required />
          </div>
          <div>
            <label className="input-label">{isAr ? 'المؤهلات' : 'Credentials'}</label>
            <input type="text" value={form.credentials} onChange={(e) => setForm({ ...form, credentials: e.target.value })}
              placeholder="e.g., MD, FACP" className="input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label">{isAr ? 'القسم' : 'Section'}</label>
              <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className="select">
                <option value="">{isAr ? 'اختر القسم' : 'Select section'}</option>
                {departments.map((d: any) => <option key={d.departmentId} value={d.departmentId}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">{isAr ? 'العيادة' : 'Clinic'}</label>
              <select value={form.facilityId} onChange={(e) => setForm({ ...form, facilityId: e.target.value })} className="select">
                <option value="">{isAr ? 'اختر العيادة' : 'Select clinic'}</option>
                {facilities.map((f: any) => <option key={f.facilityId} value={f.facilityId}>{f.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="active" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="checkbox" />
            <label htmlFor="active" className="text-sm text-healthcare-text">{isAr ? 'طبيب نشط' : 'Active provider'}</label>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={handleCloseModal} className="btn-outline flex-1">{isAr ? 'إلغاء' : 'Cancel'}</button>
            <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="btn-primary flex-1">
              {(createMutation.isPending || updateMutation.isPending) ? (isAr ? 'جاري الحفظ...' : 'Saving...') : editingProvider ? (isAr ? 'تحديث' : 'Update') : (isAr ? 'إضافة' : 'Add')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
