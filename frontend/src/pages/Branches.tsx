/**
 * Branches – Multi-branch management dashboard page.
 * Route: /dashboard/branches
 */

import { useState } from 'react'
import { Building2, Plus, Edit2, Trash2, X } from 'lucide-react'
import { useBranch, Branch } from '../context/BranchContext'
// Auth context available if needed for org-scoped operations

function BranchModal({
  branch,
  onSave,
  onClose,
}: {
  branch?: Branch
  onSave: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(branch?.name ?? '')
  const [nameAr, setNameAr] = useState(branch?.nameAr ?? '')
  const [address, setAddress] = useState(branch?.address ?? '')
  const [phone, setPhone] = useState(branch?.phone ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!name) { setError('الاسم مطلوب'); return }
    setSaving(true)
    setError(null)
    try {
      const url = branch ? `/api/branches/${branch.branchId}` : '/api/branches'
      const method = branch ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('namaa_token') ?? ''}`,
        },
        body: JSON.stringify({ name, nameAr, address, phone }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'حدث خطأ'); return }
      onSave()
      onClose()
    } catch {
      setError('تعذر الاتصال بالخادم')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" dir="rtl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-800">
            {branch ? 'تعديل الفرع' : 'إضافة فرع جديد'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">اسم الفرع (عربي) *</label>
            <input
              value={nameAr || name}
              onChange={(e) => { setNameAr(e.target.value); if (!name) setName(e.target.value) }}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:border-teal-400 outline-none"
              placeholder="مثال: فرع الرياض"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Branch Name (English)</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:border-teal-400 outline-none"
              placeholder="e.g. Riyadh Branch"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">العنوان</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:border-teal-400 outline-none"
              placeholder="العنوان التفصيلي"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">رقم الهاتف</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:border-teal-400 outline-none"
              type="tel"
              placeholder="+966..."
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-gray-600 font-medium hover:bg-gray-50"
          >
            إلغاء
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-teal-500 text-white font-medium hover:bg-teal-600 disabled:opacity-60"
          >
            {saving ? 'جاري الحفظ...' : 'حفظ'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Branches() {
  const { branches, loading, reload } = useBranch()
  const [showModal, setShowModal] = useState(false)
  const [editBranch, setEditBranch] = useState<Branch | undefined>()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (branchId: string) => {
    if (!confirm('هل تريد حذف هذا الفرع؟')) return
    setDeletingId(branchId)
    await fetch(`/api/branches/${branchId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('namaa_token') ?? ''}` },
    })
    reload()
    setDeletingId(null)
  }

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">إدارة الفروع</h1>
          <p className="text-gray-500 text-sm mt-1">إضافة وإدارة فروع العيادة المختلفة</p>
        </div>
        <button
          onClick={() => { setEditBranch(undefined); setShowModal(true) }}
          className="flex items-center gap-2 bg-teal-500 text-white px-4 py-2.5 rounded-xl font-medium hover:bg-teal-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          إضافة فرع
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500">جاري التحميل...</div>
      ) : branches.length === 0 ? (
        <div className="text-center py-16">
          <Building2 className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-600 mb-2">لا توجد فروع</h3>
          <p className="text-gray-400 text-sm mb-4">أضف فرعاً لتتمكن من تصفية لوحة التحكم حسب الفرع</p>
          <button
            onClick={() => { setEditBranch(undefined); setShowModal(true) }}
            className="bg-teal-500 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-teal-600"
          >
            إضافة فرع جديد
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {branches.map((b) => (
            <div key={b.branchId} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-teal-600" />
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => { setEditBranch(b); setShowModal(true) }}
                    className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(b.branchId)}
                    disabled={deletingId === b.branchId}
                    className="p-2 hover:bg-red-50 rounded-lg text-gray-500 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <h3 className="font-bold text-gray-800">{b.nameAr || b.name}</h3>
              {b.name !== b.nameAr && b.name && (
                <p className="text-sm text-gray-500">{b.name}</p>
              )}
              {b.address && <p className="text-sm text-gray-400 mt-1">{b.address}</p>}
              {b.phone && <p className="text-sm text-teal-600 mt-1">{b.phone}</p>}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <BranchModal
          branch={editBranch}
          onSave={reload}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
