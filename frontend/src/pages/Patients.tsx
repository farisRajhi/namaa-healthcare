import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { Plus, Phone, Mail, Users } from 'lucide-react'
import { formatDate } from '../lib/utils'
import SearchInput from '../components/ui/SearchInput'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'

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

export default function Patients() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showAddModal, setShowAddModal] = useState(false)
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const { data, isLoading } = useQuery({
    queryKey: ['patients', { page, search }],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '10' })
      if (search) params.set('search', search)
      const response = await api.get(`/api/patients?${params}`)
      return response.data
    },
  })

  const patients: Patient[] = data?.data || []
  const pagination = data?.pagination

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
            description={search ? (isAr ? 'حاول تغيير كلمات البحث' : 'Try different search terms') : undefined}
            action={search ? { label: isAr ? 'مسح البحث' : 'Clear search', onClick: () => setSearch('') } : undefined}
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
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title={isAr ? 'إضافة مريض جديد' : 'Add New Patient'}>
        <p className="text-sm text-healthcare-muted mb-4">{isAr ? 'النموذج قيد التطوير...' : 'Form coming soon...'}</p>
        <button
          onClick={() => setShowAddModal(false)}
          className="btn-outline w-full"
        >
          {isAr ? 'إغلاق' : 'Close'}
        </button>
      </Modal>
    </div>
  )
}
