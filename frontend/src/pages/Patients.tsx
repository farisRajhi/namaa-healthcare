import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { Plus, Phone, Mail, Users } from 'lucide-react'
import { formatDate } from '../lib/utils'
import SearchInput from '../components/ui/SearchInput'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'

interface Patient {
  patientId: string
  firstName: string
  lastName: string
  dateOfBirth: string | null
  sex: string | null
  mrn: string | null
  contacts: Array<{
    contactId: string
    contactType: string
    contactValue: string
    isPrimary: boolean
  }>
  createdAt: string
}

interface PatientForm {
  firstName: string
  lastName: string
  dateOfBirth: string
  sex: string
  mrn: string
  phone: string
  email: string
}

const defaultForm: PatientForm = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  sex: '',
  mrn: '',
  phone: '',
  email: '',
}

export default function Patients() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showAddModal, setShowAddModal] = useState(false)
  const [form, setForm] = useState<PatientForm>(defaultForm)
  const [errors, setErrors] = useState<Partial<Record<keyof PatientForm, string>>>({})
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ['patients', { page, search }],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '10' })
      if (search) params.set('search', search)
      const response = await api.get(`/api/patients?${params}`)
      return response.data
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: PatientForm) =>
      api.post('/api/patients', {
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth || undefined,
        sex: data.sex || undefined,
        mrn: data.mrn || undefined,
        phone: data.phone || undefined,
        email: data.email || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] })
      setShowAddModal(false)
      setForm(defaultForm)
      setErrors({})
      addToast({
        type: 'success',
        title: isAr ? 'تم إضافة المريض بنجاح' : 'Patient added successfully',
      })
    },
    onError: (err: any) => {
      addToast({
        type: 'error',
        title: isAr ? 'فشل إضافة المريض' : 'Failed to add patient',
        message: err.response?.data?.error || err.message,
      })
    },
  })

  const patients: Patient[] = data?.data || []
  const pagination = data?.pagination

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof PatientForm, string>> = {}

    if (!form.firstName.trim()) {
      newErrors.firstName = isAr ? 'الاسم الأول مطلوب' : 'First name is required'
    }
    if (!form.lastName.trim()) {
      newErrors.lastName = isAr ? 'اسم العائلة مطلوب' : 'Last name is required'
    }
    if (form.phone && !/^\+?[0-9\s\-]{7,15}$/.test(form.phone)) {
      newErrors.phone = isAr ? 'رقم هاتف غير صالح' : 'Invalid phone number'
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = isAr ? 'بريد إلكتروني غير صالح' : 'Invalid email address'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    createMutation.mutate(form)
  }

  const handleCloseModal = () => {
    setShowAddModal(false)
    setForm(defaultForm)
    setErrors({})
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{isAr ? 'المرضى' : 'Patients'}</h1>
          <p className="page-subtitle">{isAr ? 'إدارة قاعدة بيانات المرضى' : 'Manage your patient database'}</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn-primary">
          <Plus className="h-4 w-4" />
          {isAr ? 'إضافة مريض' : 'Add Patient'}
        </button>
      </div>

      {/* Search */}
      <SearchInput
        value={search}
        onChange={(v) => { setSearch(v); setPage(1) }}
        placeholder={isAr ? 'بحث بالاسم أو رقم الملف...' : 'Search by name or MRN...'}
      />

      {/* Patients Table */}
      <div className="table-container">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <LoadingSpinner />
          </div>
        ) : patients.length === 0 ? (
          <EmptyState
            icon={Users}
            title={isAr ? 'لا يوجد مرضى' : 'No patients found'}
            description={search ? (isAr ? 'حاول تغيير كلمات البحث' : 'Try different search terms') : (isAr ? 'ابدأ بإضافة مريض جديد' : 'Start by adding a new patient')}
            action={search
              ? { label: isAr ? 'مسح البحث' : 'Clear search', onClick: () => setSearch('') }
              : { label: isAr ? 'إضافة مريض' : 'Add Patient', onClick: () => setShowAddModal(true) }
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="table-header">
                <tr>
                  <th>{isAr ? 'المريض' : 'Patient'}</th>
                  <th>{isAr ? 'التواصل' : 'Contact'}</th>
                  <th>{isAr ? 'رقم الملف' : 'MRN'}</th>
                  <th>{isAr ? 'تاريخ التسجيل' : 'Registered'}</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((patient) => {
                  const phone = patient.contacts.find((c) => c.contactType === 'phone')
                  const email = patient.contacts.find((c) => c.contactType === 'email')

                  return (
                    <tr key={patient.patientId} className="table-row cursor-pointer">
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-primary-700 font-bold text-sm">
                              {patient.firstName.charAt(0)}{patient.lastName.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-healthcare-text">
                              {patient.firstName} {patient.lastName}
                            </p>
                            {patient.dateOfBirth && (
                              <p className="text-xs text-healthcare-muted">{formatDate(patient.dateOfBirth)}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="space-y-1">
                          {phone && (
                            <div className="flex items-center gap-1.5 text-xs text-healthcare-muted">
                              <Phone className="h-3.5 w-3.5 text-primary-400" />
                              <span className="dir-ltr">{phone.contactValue}</span>
                            </div>
                          )}
                          {email && (
                            <div className="flex items-center gap-1.5 text-xs text-healthcare-muted">
                              <Mail className="h-3.5 w-3.5 text-primary-400" />
                              {email.contactValue}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="text-sm text-healthcare-muted font-mono">
                          {patient.mrn || '—'}
                        </span>
                      </td>
                      <td>
                        <span className="text-sm text-healthcare-muted">{formatDate(patient.createdAt)}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="px-5 py-4 border-t border-healthcare-border/20 flex items-center justify-between">
            <p className="text-sm text-healthcare-muted">
              {isAr
                ? `عرض ${(pagination.page - 1) * pagination.limit + 1} إلى ${Math.min(pagination.page * pagination.limit, pagination.total)} من ${pagination.total}`
                : `Showing ${(pagination.page - 1) * pagination.limit + 1} to ${Math.min(pagination.page * pagination.limit, pagination.total)} of ${pagination.total}`}
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

      {/* Add Patient Modal */}
      <Modal open={showAddModal} onClose={handleCloseModal} title={isAr ? 'إضافة مريض جديد' : 'Add New Patient'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label">{isAr ? 'الاسم الأول *' : 'First Name *'}</label>
              <input
                type="text"
                value={form.firstName}
                onChange={(e) => { setForm({ ...form, firstName: e.target.value }); setErrors({ ...errors, firstName: undefined }) }}
                className={`input ${errors.firstName ? 'border-red-400 focus:ring-red-300' : ''}`}
                placeholder={isAr ? 'مثال: أحمد' : 'e.g., Ahmed'}
                autoFocus
              />
              {errors.firstName && <p className="text-xs text-red-500 mt-1">{errors.firstName}</p>}
            </div>
            <div>
              <label className="input-label">{isAr ? 'اسم العائلة *' : 'Last Name *'}</label>
              <input
                type="text"
                value={form.lastName}
                onChange={(e) => { setForm({ ...form, lastName: e.target.value }); setErrors({ ...errors, lastName: undefined }) }}
                className={`input ${errors.lastName ? 'border-red-400 focus:ring-red-300' : ''}`}
                placeholder={isAr ? 'مثال: الشمري' : 'e.g., Al-Shamri'}
              />
              {errors.lastName && <p className="text-xs text-red-500 mt-1">{errors.lastName}</p>}
            </div>
          </div>

          {/* DOB + Sex row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label">{isAr ? 'تاريخ الميلاد' : 'Date of Birth'}</label>
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                className="input dir-ltr"
                max={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div>
              <label className="input-label">{isAr ? 'الجنس' : 'Sex'}</label>
              <select
                value={form.sex}
                onChange={(e) => setForm({ ...form, sex: e.target.value })}
                className="select"
              >
                <option value="">{isAr ? 'اختر...' : 'Select...'}</option>
                <option value="male">{isAr ? 'ذكر' : 'Male'}</option>
                <option value="female">{isAr ? 'أنثى' : 'Female'}</option>
              </select>
            </div>
          </div>

          {/* MRN */}
          <div>
            <label className="input-label">{isAr ? 'رقم الملف الطبي' : 'MRN (Medical Record Number)'}</label>
            <input
              type="text"
              value={form.mrn}
              onChange={(e) => setForm({ ...form, mrn: e.target.value })}
              className="input"
              placeholder={isAr ? 'مثال: MRN-001234' : 'e.g., MRN-001234'}
            />
          </div>

          {/* Contact info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label">{isAr ? 'رقم الهاتف' : 'Phone Number'}</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => { setForm({ ...form, phone: e.target.value }); setErrors({ ...errors, phone: undefined }) }}
                className={`input dir-ltr ${errors.phone ? 'border-red-400 focus:ring-red-300' : ''}`}
                placeholder="+966 5X XXX XXXX"
              />
              {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
            </div>
            <div>
              <label className="input-label">{isAr ? 'البريد الإلكتروني' : 'Email'}</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => { setForm({ ...form, email: e.target.value }); setErrors({ ...errors, email: undefined }) }}
                className={`input dir-ltr ${errors.email ? 'border-red-400 focus:ring-red-300' : ''}`}
                placeholder="name@example.com"
              />
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={handleCloseModal} className="btn-outline flex-1">
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button type="submit" disabled={createMutation.isPending} className="btn-primary flex-1">
              {createMutation.isPending
                ? (isAr ? 'جاري الإضافة...' : 'Adding...')
                : (isAr ? 'إضافة المريض' : 'Add Patient')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
