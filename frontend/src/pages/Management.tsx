import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import {
  Plus, FolderTree, Building2, User, Pencil, Trash2,
  Users, MapPin, Briefcase, Clock, Calendar,
} from 'lucide-react'
import { cn } from '../lib/utils'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import Badge from '../components/ui/Badge'
import TestChatWidget from '../components/chat/TestChatWidget'
import VoiceTestWidget from '../components/voice/VoiceTestWidget'

interface Department { departmentId: string; name: string; createdAt: string; _count: { providers: number; appointments: number } }
interface Facility { facilityId: string; name: string; timezone: string; addressLine1: string | null; city: string | null; region: string | null; country: string | null; _count: { providers: number; appointments: number }; [key: string]: any }
interface Provider { providerId: string; displayName: string; credentials: string | null; active: boolean; departmentId: string | null; facilityId: string | null; department: { departmentId: string; name: string } | null; facility: { facilityId: string; name: string } | null; services: Array<{ service: { serviceId: string; name: string } }> }
interface AvailabilityRule { ruleId: string; dayOfWeek: number; startLocal: string; endLocal: string; slotIntervalMin: number }

type TabType = 'sections' | 'clinics' | 'providers'
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function Management() {
  const [activeTab, setActiveTab] = useState<TabType>('sections')
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const tabs = [
    { id: 'sections' as TabType, name: isAr ? 'الأقسام' : 'Sections', icon: FolderTree },
    { id: 'clinics' as TabType, name: isAr ? 'العيادات' : 'Clinics', icon: Building2 },
    { id: 'providers' as TabType, name: isAr ? 'الأطباء' : 'Providers', icon: User },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{isAr ? 'الإدارة العامة' : 'Management'}</h1>
          <p className="page-subtitle">{isAr ? 'إدارة الأقسام والعيادات والأطباء' : 'Manage sections, clinics, and providers'}</p>
        </div>
      </div>

      <div className="flex border-b border-healthcare-border/30">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab.id ? 'border-primary-500 text-primary-600' : 'border-transparent text-healthcare-muted hover:text-healthcare-text')}>
            <tab.icon className="h-4 w-4" />{tab.name}
          </button>
        ))}
      </div>

      {activeTab === 'sections' && <SectionsTab />}
      {activeTab === 'clinics' && <ClinicsTab />}
      {activeTab === 'providers' && <ProvidersTab />}

      <VoiceTestWidget />
      <TestChatWidget />
    </div>
  )
}

function SectionsTab() {
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Department | null>(null)
  const [name, setName] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({ queryKey: ['departments'], queryFn: async () => (await api.get('/api/departments')).data })
  const createM = useMutation({ mutationFn: (d: { name: string }) => api.post('/api/departments', d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); close() } })
  const updateM = useMutation({ mutationFn: ({ id, d }: { id: string; d: { name: string } }) => api.put(`/api/departments/${id}`, d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); close() } })
  const deleteM = useMutation({ mutationFn: (id: string) => api.delete(`/api/departments/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); setDeleteConfirm(null) } })

  const departments: Department[] = data?.data || []
  const open = (dept?: Department) => { if (dept) { setEditing(dept); setName(dept.name) } else { setEditing(null); setName('') }; setShowModal(true) }
  const close = () => { setShowModal(false); setEditing(null); setName('') }
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (!name.trim()) return; editing ? updateM.mutate({ id: editing.departmentId, d: { name } }) : createM.mutate({ name }) }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => open()} className="btn-primary btn-sm"><Plus className="h-4 w-4" />{isAr ? 'إضافة قسم' : 'Add Section'}</button>
      </div>
      <div className="table-container">
        {isLoading ? <div className="flex items-center justify-center h-48"><LoadingSpinner /></div> :
          departments.length === 0 ? <EmptyState icon={FolderTree} title={isAr ? 'لا توجد أقسام' : 'No sections yet'} /> : (
            <table className="min-w-full"><thead className="table-header"><tr><th>{isAr ? 'القسم' : 'Section'}</th><th>{isAr ? 'الأطباء' : 'Providers'}</th><th className="text-end">{isAr ? 'إجراءات' : 'Actions'}</th></tr></thead>
              <tbody>{departments.map((d) => (
                <tr key={d.departmentId} className="table-row">
                  <td><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center"><FolderTree className="h-4 w-4 text-primary-500" /></div><span className="font-semibold text-healthcare-text">{d.name}</span></div></td>
                  <td className="text-sm text-healthcare-muted">{d._count.providers} {isAr ? 'طبيب' : 'providers'}</td>
                  <td>{deleteConfirm === d.departmentId ?
                    <div className="flex items-center justify-end gap-2"><button onClick={() => deleteM.mutate(d.departmentId)} className="btn-danger btn-sm px-2 py-1 min-h-0 text-xs">{isAr ? 'نعم' : 'Yes'}</button><button onClick={() => setDeleteConfirm(null)} className="btn-ghost btn-sm px-2 py-1 min-h-0 text-xs">{isAr ? 'لا' : 'No'}</button></div> :
                    <div className="flex items-center justify-end gap-1"><button onClick={() => open(d)} className="btn-icon btn-ghost p-2 min-w-[36px] min-h-[36px]"><Pencil className="h-4 w-4" /></button><button onClick={() => setDeleteConfirm(d.departmentId)} className="btn-icon btn-ghost p-2 min-w-[36px] min-h-[36px] hover:text-danger-500"><Trash2 className="h-4 w-4" /></button></div>}
                  </td>
                </tr>
              ))}</tbody></table>
          )}
      </div>
      <Modal open={showModal} onClose={close} title={editing ? (isAr ? 'تعديل القسم' : 'Edit Section') : (isAr ? 'إضافة قسم' : 'Add Section')}>
        <form onSubmit={submit} className="space-y-4">
          <div><label className="input-label">{isAr ? 'اسم القسم' : 'Section Name'}</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input" required autoFocus /></div>
          <div className="flex gap-3"><button type="button" onClick={close} className="btn-outline flex-1">{isAr ? 'إلغاء' : 'Cancel'}</button><button type="submit" disabled={createM.isPending || updateM.isPending} className="btn-primary flex-1">{editing ? (isAr ? 'تحديث' : 'Update') : (isAr ? 'إضافة' : 'Add')}</button></div>
        </form>
      </Modal>
    </div>
  )
}

function ClinicsTab() {
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Facility | null>(null)
  const [form, setForm] = useState({ name: '', timezone: 'Asia/Riyadh', addressLine1: '', city: '', region: '', country: 'Saudi Arabia' })
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({ queryKey: ['facilities'], queryFn: async () => (await api.get('/api/facilities')).data })
  const createM = useMutation({ mutationFn: (d: typeof form) => api.post('/api/facilities', d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['facilities'] }); close() } })
  const updateM = useMutation({ mutationFn: ({ id, d }: { id: string; d: typeof form }) => api.put(`/api/facilities/${id}`, d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['facilities'] }); close() } })
  const deleteM = useMutation({ mutationFn: (id: string) => api.delete(`/api/facilities/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['facilities'] }); setDeleteConfirm(null) } })

  const facilities: Facility[] = data?.data || []
  const open = (f?: Facility) => {
    if (f) { setEditing(f); setForm({ name: f.name, timezone: f.timezone, addressLine1: f.addressLine1 || '', city: f.city || '', region: f.region || '', country: f.country || 'Saudi Arabia' }) }
    else { setEditing(null); setForm({ name: '', timezone: 'Asia/Riyadh', addressLine1: '', city: '', region: '', country: 'Saudi Arabia' }) }
    setShowModal(true)
  }
  const close = () => { setShowModal(false); setEditing(null) }
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (!form.name.trim()) return; editing ? updateM.mutate({ id: editing.facilityId, d: form }) : createM.mutate(form) }

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><button onClick={() => open()} className="btn-primary btn-sm"><Plus className="h-4 w-4" />{isAr ? 'إضافة عيادة' : 'Add Clinic'}</button></div>
      {isLoading ? <div className="flex items-center justify-center h-48"><LoadingSpinner /></div> :
        facilities.length === 0 ? <div className="table-container"><EmptyState icon={Building2} title={isAr ? 'لا توجد عيادات' : 'No clinics yet'} /></div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {facilities.map((f) => (
              <div key={f.facilityId} className="card p-5 group">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-success-50 flex items-center justify-center"><Building2 className="h-5 w-5 text-success-500" /></div>
                    <div><h3 className="font-semibold text-healthcare-text">{f.name}</h3><p className="text-xs text-healthcare-muted">{f.timezone}</p></div>
                  </div>
                  {deleteConfirm === f.facilityId ?
                    <div className="flex gap-1"><button onClick={() => deleteM.mutate(f.facilityId)} className="btn-danger btn-sm px-2 py-1 min-h-0 text-xs">{isAr ? 'نعم' : 'Yes'}</button><button onClick={() => setDeleteConfirm(null)} className="btn-ghost btn-sm px-2 py-1 min-h-0 text-xs">{isAr ? 'لا' : 'No'}</button></div> :
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => open(f)} className="btn-icon btn-ghost p-1.5 min-w-[32px] min-h-[32px]"><Pencil className="h-3.5 w-3.5" /></button><button onClick={() => setDeleteConfirm(f.facilityId)} className="btn-icon btn-ghost p-1.5 min-w-[32px] min-h-[32px] hover:text-danger-500"><Trash2 className="h-3.5 w-3.5" /></button></div>}
                </div>
                <div className="space-y-1 text-xs text-healthcare-muted">
                  <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-success-400" />{[f.city, f.region].filter(Boolean).join('، ') || (isAr ? 'لا يوجد عنوان' : 'No address')}</div>
                  <div className="flex items-center gap-2"><Users className="h-3.5 w-3.5 text-success-400" />{f._count.providers} {isAr ? 'طبيب' : 'providers'}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      <Modal open={showModal} onClose={close} title={editing ? (isAr ? 'تعديل العيادة' : 'Edit Clinic') : (isAr ? 'إضافة عيادة' : 'Add Clinic')}>
        <form onSubmit={submit} className="space-y-4">
          <div><label className="input-label">{isAr ? 'اسم العيادة *' : 'Clinic Name *'}</label><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" required autoFocus /></div>
          <div><label className="input-label">{isAr ? 'المنطقة الزمنية' : 'Timezone'}</label>
            <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className="select">
              <option value="Asia/Riyadh">Asia/Riyadh (GMT+3)</option><option value="Asia/Dubai">Asia/Dubai (GMT+4)</option><option value="UTC">UTC</option>
            </select></div>
          <div className="grid grid-cols-2 gap-3">
            <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder={isAr ? 'المدينة' : 'City'} className="input" />
            <input type="text" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder={isAr ? 'المنطقة' : 'Region'} className="input" />
          </div>
          <div className="flex gap-3"><button type="button" onClick={close} className="btn-outline flex-1">{isAr ? 'إلغاء' : 'Cancel'}</button><button type="submit" disabled={createM.isPending || updateM.isPending} className="btn-primary flex-1">{editing ? (isAr ? 'تحديث' : 'Update') : (isAr ? 'إضافة' : 'Add')}</button></div>
        </form>
      </Modal>
    </div>
  )
}

function ProvidersTab() {
  const [showModal, setShowModal] = useState(false)
  const [showAvail, setShowAvail] = useState(false)
  const [selectedProv, setSelectedProv] = useState<Provider | null>(null)
  const [editing, setEditing] = useState<Provider | null>(null)
  const [form, setForm] = useState({ displayName: '', credentials: '', departmentId: '', facilityId: '', active: true })
  const [availForm, setAvailForm] = useState({ dayOfWeek: 0, startLocal: '09:00', endLocal: '17:00', slotIntervalMin: 15 })
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({ queryKey: ['providers'], queryFn: async () => (await api.get('/api/providers')).data })
  const { data: deptData } = useQuery({ queryKey: ['departments'], queryFn: async () => (await api.get('/api/departments')).data })
  const { data: facData } = useQuery({ queryKey: ['facilities'], queryFn: async () => (await api.get('/api/facilities')).data })
  const { data: provDetails, refetch: refetchDetails } = useQuery({
    queryKey: ['provider-details', selectedProv?.providerId],
    queryFn: async () => (await api.get(`/api/providers/${selectedProv?.providerId}`)).data,
    enabled: !!selectedProv,
  })

  const createM = useMutation({ mutationFn: (d: typeof form) => api.post('/api/providers', { displayName: d.displayName, credentials: d.credentials || undefined, departmentId: d.departmentId || undefined, facilityId: d.facilityId || undefined, active: d.active }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['providers'] }); close() } })
  const updateM = useMutation({ mutationFn: ({ id, d }: { id: string; d: typeof form }) => api.put(`/api/providers/${id}`, { displayName: d.displayName, credentials: d.credentials || undefined, departmentId: d.departmentId || undefined, facilityId: d.facilityId || undefined, active: d.active }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['providers'] }); close() } })
  const deleteM = useMutation({ mutationFn: (id: string) => api.delete(`/api/providers/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['providers'] }); setDeleteConfirm(null) } })
  const addAvailM = useMutation({
    mutationFn: ({ pid, d }: { pid: string; d: typeof availForm }) => api.post(`/api/providers/${pid}/availability`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['providers'] }); qc.invalidateQueries({ queryKey: ['provider-details', selectedProv?.providerId] }); refetchDetails(); setAvailForm({ dayOfWeek: 0, startLocal: '09:00', endLocal: '17:00', slotIntervalMin: 15 }) },
  })

  const providers: Provider[] = data?.data || []
  const departments: Department[] = deptData?.data || []
  const facilities: Facility[] = facData?.data || []

  const open = (p?: Provider) => {
    if (p) { setEditing(p); setForm({ displayName: p.displayName, credentials: p.credentials || '', departmentId: p.departmentId || '', facilityId: p.facilityId || '', active: p.active }) }
    else { setEditing(null); setForm({ displayName: '', credentials: '', departmentId: '', facilityId: '', active: true }) }
    setShowModal(true)
  }
  const close = () => { setShowModal(false); setEditing(null) }
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (!form.displayName.trim()) return; editing ? updateM.mutate({ id: editing.providerId, d: form }) : createM.mutate(form) }

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><button onClick={() => open()} className="btn-primary btn-sm"><Plus className="h-4 w-4" />{isAr ? 'إضافة طبيب' : 'Add Provider'}</button></div>
      {isLoading ? <div className="flex items-center justify-center h-48"><LoadingSpinner /></div> :
        providers.length === 0 ? <div className="table-container"><EmptyState icon={User} title={isAr ? 'لا يوجد أطباء' : 'No providers yet'} /></div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {providers.map((p) => (
              <div key={p.providerId} className="card p-5 group">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center"><User className="h-5 w-5 text-primary-600" /></div>
                    <div>
                      <div className="flex items-center gap-2"><h3 className="font-semibold text-healthcare-text">{p.displayName}</h3>{!p.active && <Badge variant="neutral">{isAr ? 'غير نشط' : 'Inactive'}</Badge>}</div>
                      {p.credentials && <p className="text-xs text-healthcare-muted">{p.credentials}</p>}
                    </div>
                  </div>
                  {deleteConfirm === p.providerId ?
                    <div className="flex gap-1"><button onClick={() => deleteM.mutate(p.providerId)} className="btn-danger btn-sm px-2 py-1 min-h-0 text-xs">{isAr ? 'نعم' : 'Yes'}</button><button onClick={() => setDeleteConfirm(null)} className="btn-ghost btn-sm px-2 py-1 min-h-0 text-xs">{isAr ? 'لا' : 'No'}</button></div> :
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setSelectedProv(p); setShowAvail(true) }} className="btn-icon btn-ghost p-1.5 min-w-[32px] min-h-[32px] text-success-500" title="Availability"><Clock className="h-3.5 w-3.5" /></button>
                      <button onClick={() => open(p)} className="btn-icon btn-ghost p-1.5 min-w-[32px] min-h-[32px]"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setDeleteConfirm(p.providerId)} className="btn-icon btn-ghost p-1.5 min-w-[32px] min-h-[32px] hover:text-danger-500"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>}
                </div>
                <div className="space-y-1 text-xs text-healthcare-muted">
                  {p.department && <div className="flex items-center gap-2"><FolderTree className="h-3.5 w-3.5 text-primary-400" />{p.department.name}</div>}
                  {p.facility && <div className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-primary-400" />{p.facility.name}</div>}
                  {p.services.length > 0 && <div className="flex items-center gap-2"><Briefcase className="h-3.5 w-3.5 text-primary-400" />{p.services.length} {isAr ? 'خدمة' : 'services'}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

      <Modal open={showModal} onClose={close} title={editing ? (isAr ? 'تعديل الطبيب' : 'Edit Provider') : (isAr ? 'إضافة طبيب' : 'Add Provider')}>
        <form onSubmit={submit} className="space-y-4">
          <div><label className="input-label">{isAr ? 'الاسم *' : 'Name *'}</label><input type="text" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className="input" required autoFocus /></div>
          <div><label className="input-label">{isAr ? 'المؤهلات' : 'Credentials'}</label><input type="text" value={form.credentials} onChange={(e) => setForm({ ...form, credentials: e.target.value })} className="input" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="input-label">{isAr ? 'القسم' : 'Section'}</label><select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className="select"><option value="">{isAr ? 'اختر' : 'Select'}</option>{departments.map(d => <option key={d.departmentId} value={d.departmentId}>{d.name}</option>)}</select></div>
            <div><label className="input-label">{isAr ? 'العيادة' : 'Clinic'}</label><select value={form.facilityId} onChange={(e) => setForm({ ...form, facilityId: e.target.value })} className="select"><option value="">{isAr ? 'اختر' : 'Select'}</option>{facilities.map(f => <option key={f.facilityId} value={f.facilityId}>{f.name}</option>)}</select></div>
          </div>
          <div className="flex items-center gap-2"><input type="checkbox" id="prov-active" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="checkbox" /><label htmlFor="prov-active" className="text-sm text-healthcare-text">{isAr ? 'نشط' : 'Active'}</label></div>
          <div className="flex gap-3"><button type="button" onClick={close} className="btn-outline flex-1">{isAr ? 'إلغاء' : 'Cancel'}</button><button type="submit" disabled={createM.isPending || updateM.isPending} className="btn-primary flex-1">{editing ? (isAr ? 'تحديث' : 'Update') : (isAr ? 'إضافة' : 'Add')}</button></div>
        </form>
      </Modal>

      <Modal open={showAvail} onClose={() => { setShowAvail(false); setSelectedProv(null) }} title={`${isAr ? 'أوقات العمل' : 'Availability'} — ${selectedProv?.displayName || ''}`}>
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-healthcare-text mb-2">{isAr ? 'الجدول الحالي' : 'Current Schedule'}</h4>
            {provDetails?.availabilityRules?.length > 0 ? (
              <div className="space-y-1">{provDetails.availabilityRules.map((r: AvailabilityRule) => (
                <div key={r.ruleId} className="flex items-center gap-2 p-2.5 bg-primary-50/50 rounded-lg text-sm">
                  <Calendar className="h-4 w-4 text-primary-400" />
                  <span className="font-semibold text-healthcare-text">{isAr ? DAYS[r.dayOfWeek] : DAYS_EN[r.dayOfWeek]}:</span>
                  <span className="text-healthcare-muted">{r.startLocal.slice(11, 16)} - {r.endLocal.slice(11, 16)}</span>
                </div>
              ))}</div>
            ) : (
              <div className="p-3 bg-warning-50 border border-warning-200/50 rounded-lg text-sm text-warning-800">{isAr ? 'لم يتم تعيين أوقات عمل بعد' : 'No availability set'}</div>
            )}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (selectedProv) addAvailM.mutate({ pid: selectedProv.providerId, d: availForm }) }} className="space-y-3 pt-3 border-t border-healthcare-border/30">
            <h4 className="text-sm font-semibold text-healthcare-text">{isAr ? 'إضافة أوقات عمل' : 'Add Working Hours'}</h4>
            <div><label className="input-label">{isAr ? 'اليوم' : 'Day'}</label>
              <select value={availForm.dayOfWeek} onChange={(e) => setAvailForm({ ...availForm, dayOfWeek: parseInt(e.target.value) })} className="select">
                {(isAr ? DAYS : DAYS_EN).map((day, i) => <option key={day} value={i}>{day}</option>)}
              </select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="input-label">{isAr ? 'البداية' : 'Start'}</label><input type="time" value={availForm.startLocal} onChange={(e) => setAvailForm({ ...availForm, startLocal: e.target.value })} className="input" /></div>
              <div><label className="input-label">{isAr ? 'النهاية' : 'End'}</label><input type="time" value={availForm.endLocal} onChange={(e) => setAvailForm({ ...availForm, endLocal: e.target.value })} className="input" /></div>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => { setShowAvail(false); setSelectedProv(null) }} className="btn-outline flex-1">{isAr ? 'إغلاق' : 'Close'}</button>
              <button type="submit" disabled={addAvailM.isPending} className="btn-primary flex-1">{addAvailM.isPending ? (isAr ? 'جاري الإضافة...' : 'Adding...') : (isAr ? 'إضافة' : 'Add Hours')}</button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  )
}
