import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { Plus, FolderTree, Pencil, Trash2, Users } from 'lucide-react'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'

interface Department {
  departmentId: string
  name: string
  createdAt: string
  _count: { providers: number; appointments: number }
}

export default function Departments() {
  const [showModal, setShowModal] = useState(false)
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null)
  const [name, setName] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => (await api.get('/api/departments')).data,
  })

  const createMutation = useMutation({
    mutationFn: (data: { name: string }) => api.post('/api/departments', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['departments'] }); handleCloseModal() },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string } }) => api.put(`/api/departments/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['departments'] }); handleCloseModal() },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/departments/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['departments'] }); setDeleteConfirm(null) },
  })

  const departments: Department[] = data?.data || []

  const handleOpenModal = (department?: Department) => {
    if (department) { setEditingDepartment(department); setName(department.name) }
    else { setEditingDepartment(null); setName('') }
    setShowModal(true)
  }

  const handleCloseModal = () => { setShowModal(false); setEditingDepartment(null); setName('') }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    if (editingDepartment) updateMutation.mutate({ id: editingDepartment.departmentId, data: { name } })
    else createMutation.mutate({ name })
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{isAr ? 'الأقسام' : 'Sections'}</h1>
          <p className="page-subtitle">{isAr ? 'إدارة الأقسام والتخصصات' : 'Manage departments and sections'}</p>
        </div>
        <button onClick={() => handleOpenModal()} className="btn-primary">
          <Plus className="h-4 w-4" />
          {isAr ? 'إضافة قسم' : 'Add Section'}
        </button>
      </div>

      <div className="table-container">
        {isLoading ? (
          <div className="flex items-center justify-center h-64"><LoadingSpinner /></div>
        ) : departments.length === 0 ? (
          <EmptyState
            icon={FolderTree}
            title={isAr ? 'لا توجد أقسام' : 'No sections found'}
            description={isAr ? 'ابدأ بإضافة قسم جديد' : 'Add your first section'}
            action={{ label: isAr ? 'إضافة قسم' : 'Add Section', onClick: () => handleOpenModal() }}
          />
        ) : (
          <table className="min-w-full">
            <thead className="table-header">
              <tr>
                <th>{isAr ? 'اسم القسم' : 'Section Name'}</th>
                <th>{isAr ? 'الأطباء' : 'Providers'}</th>
                <th>{isAr ? 'المواعيد' : 'Appointments'}</th>
                <th className="text-end">{isAr ? 'الإجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((dept) => (
                <tr key={dept.departmentId} className="table-row">
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                        <FolderTree className="h-5 w-5 text-primary-500" />
                      </div>
                      <span className="font-semibold text-healthcare-text">{dept.name}</span>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5 text-sm text-healthcare-muted">
                      <Users className="h-4 w-4 text-primary-400" />
                      {dept._count.providers} {isAr ? 'طبيب' : 'providers'}
                    </div>
                  </td>
                  <td className="text-sm text-healthcare-muted">{dept._count.appointments} {isAr ? 'موعد' : 'total'}</td>
                  <td>
                    {deleteConfirm === dept.departmentId ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-danger-500">{isAr ? 'حذف؟' : 'Delete?'}</span>
                        <button onClick={() => deleteMutation.mutate(dept.departmentId)} className="btn-danger btn-sm px-2 py-1 min-h-0 text-xs">{isAr ? 'نعم' : 'Yes'}</button>
                        <button onClick={() => setDeleteConfirm(null)} className="btn-ghost btn-sm px-2 py-1 min-h-0 text-xs">{isAr ? 'لا' : 'No'}</button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleOpenModal(dept)} className="btn-icon btn-ghost p-2 min-w-[36px] min-h-[36px]"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => setDeleteConfirm(dept.departmentId)} className="btn-icon btn-ghost p-2 min-w-[36px] min-h-[36px] hover:text-danger-500"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showModal} onClose={handleCloseModal} title={editingDepartment ? (isAr ? 'تعديل القسم' : 'Edit Section') : (isAr ? 'إضافة قسم' : 'Add Section')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="input-label">{isAr ? 'اسم القسم' : 'Section Name'}</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder={isAr ? 'مثال: أمراض القلب، طب الأطفال' : 'e.g., Cardiology, Pediatrics'} className="input" required autoFocus />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={handleCloseModal} className="btn-outline flex-1">{isAr ? 'إلغاء' : 'Cancel'}</button>
            <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="btn-primary flex-1">
              {(createMutation.isPending || updateMutation.isPending) ? (isAr ? 'جاري الحفظ...' : 'Saving...') : editingDepartment ? (isAr ? 'تحديث' : 'Update') : (isAr ? 'إضافة' : 'Add')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
