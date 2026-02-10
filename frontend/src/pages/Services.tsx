import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { Plus, Clock, Users, Briefcase } from 'lucide-react'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import Badge from '../components/ui/Badge'

interface Service {
  serviceId: string
  name: string
  durationMin: number
  bufferBeforeMin: number
  bufferAfterMin: number
  active: boolean
  providers: Array<{ provider: { displayName: string } }>
}

export default function Services() {
  const [showActive, setShowActive] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    name: '', durationMin: 30, bufferBeforeMin: 0, bufferAfterMin: 0, active: true,
  })
  const [error, setError] = useState('')
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => api.post('/api/services', data).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
      setShowModal(false)
      setFormData({ name: '', durationMin: 30, bufferBeforeMin: 0, bufferAfterMin: 0, active: true })
      setError('')
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Failed to create service'),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['services', { active: showActive }],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (showActive) params.set('active', 'true')
      return (await api.get(`/api/services?${params}`)).data
    },
  })

  const services: Service[] = data?.data || []

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{isAr ? 'الخدمات' : 'Services'}</h1>
          <p className="page-subtitle">{isAr ? 'إعداد الخدمات المقدمة' : 'Configure your service offerings'}</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus className="h-4 w-4" />
          {isAr ? 'إضافة خدمة' : 'Add Service'}
        </button>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setShowActive(true)} className={showActive ? 'chip-active' : 'chip'}>
          {isAr ? 'النشطة' : 'Active'}
        </button>
        <button onClick={() => setShowActive(false)} className={!showActive ? 'chip-active' : 'chip'}>
          {isAr ? 'الكل' : 'All'}
        </button>
      </div>

      <div className="table-container">
        {isLoading ? (
          <div className="flex items-center justify-center h-64"><LoadingSpinner /></div>
        ) : services.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title={isAr ? 'لا توجد خدمات' : 'No services found'}
            action={{ label: isAr ? 'إضافة خدمة' : 'Add Service', onClick: () => setShowModal(true) }}
          />
        ) : (
          <table className="min-w-full">
            <thead className="table-header">
              <tr>
                <th>{isAr ? 'الخدمة' : 'Service'}</th>
                <th>{isAr ? 'المدة' : 'Duration'}</th>
                <th>{isAr ? 'الفاصل' : 'Buffer'}</th>
                <th>{isAr ? 'الأطباء' : 'Providers'}</th>
                <th>{isAr ? 'الحالة' : 'Status'}</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr key={service.serviceId} className="table-row cursor-pointer">
                  <td><span className="font-semibold text-healthcare-text">{service.name}</span></td>
                  <td>
                    <div className="flex items-center gap-1.5 text-sm text-healthcare-muted">
                      <Clock className="h-4 w-4 text-primary-400" />
                      {service.durationMin} {isAr ? 'دقيقة' : 'min'}
                    </div>
                  </td>
                  <td className="text-sm text-healthcare-muted">
                    {service.bufferBeforeMin > 0 || service.bufferAfterMin > 0 ? (
                      <span>{service.bufferBeforeMin}m / {service.bufferAfterMin}m</span>
                    ) : (
                      <span className="text-healthcare-muted/50">{isAr ? 'بدون فاصل' : 'No buffer'}</span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5 text-sm text-healthcare-muted">
                      <Users className="h-4 w-4 text-primary-400" />
                      {service.providers.length} {isAr ? 'طبيب' : 'providers'}
                    </div>
                  </td>
                  <td>
                    <Badge variant={service.active ? 'success' : 'neutral'} dot>
                      {service.active ? (isAr ? 'نشط' : 'Active') : (isAr ? 'غير نشط' : 'Inactive')}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={isAr ? 'إضافة خدمة' : 'Add Service'}>
        <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(formData) }} className="space-y-4">
          {error && <div className="bg-danger-50 border border-danger-200 text-danger-600 px-4 py-3 rounded-lg text-sm">{error}</div>}
          <div>
            <label className="input-label">{isAr ? 'اسم الخدمة *' : 'Service Name *'}</label>
            <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input" placeholder={isAr ? 'مثال: استشارة، فحص عام' : 'e.g., Consultation'} required />
          </div>
          <div>
            <label className="input-label">{isAr ? 'المدة (بالدقائق) *' : 'Duration (minutes) *'}</label>
            <input type="number" value={formData.durationMin} onChange={(e) => setFormData({ ...formData, durationMin: parseInt(e.target.value) || 0 })}
              className="input" min={5} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">{isAr ? 'فاصل قبل (دقائق)' : 'Buffer Before (min)'}</label>
              <input type="number" value={formData.bufferBeforeMin} onChange={(e) => setFormData({ ...formData, bufferBeforeMin: parseInt(e.target.value) || 0 })}
                className="input" min={0} />
            </div>
            <div>
              <label className="input-label">{isAr ? 'فاصل بعد (دقائق)' : 'Buffer After (min)'}</label>
              <input type="number" value={formData.bufferAfterMin} onChange={(e) => setFormData({ ...formData, bufferAfterMin: parseInt(e.target.value) || 0 })}
                className="input" min={0} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="active" checked={formData.active} onChange={(e) => setFormData({ ...formData, active: e.target.checked })} className="checkbox" />
            <label htmlFor="active" className="text-sm text-healthcare-text">{isAr ? 'نشط' : 'Active'}</label>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-outline flex-1">{isAr ? 'إلغاء' : 'Cancel'}</button>
            <button type="submit" disabled={createMutation.isPending} className="btn-primary flex-1">
              {createMutation.isPending ? (isAr ? 'جاري الإنشاء...' : 'Creating...') : (isAr ? 'إنشاء الخدمة' : 'Create Service')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
