import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import {
  Plus, FolderTree, Building2, User, Pencil, Trash2,
  Users, MapPin, Briefcase, Clock, Calendar, ChevronDown,
  ChevronRight, AlertTriangle, Stethoscope,
} from 'lucide-react'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import Badge from '../components/ui/Badge'
import { useToast } from '../components/ui/Toast'

/* ─── Types ───────────────────────────────────────────────── */

interface Department { departmentId: string; name: string; createdAt: string; _count: { providers: number; appointments: number } }
interface Facility { facilityId: string; name: string; timezone: string; addressLine1: string | null; city: string | null; region: string | null; country: string | null; _count: { providers: number; appointments: number }; [key: string]: any }
interface Provider { providerId: string; displayName: string; credentials: string | null; active: boolean; departmentId: string | null; facilityId: string | null; department: { departmentId: string; name: string } | null; facility: { facilityId: string; name: string } | null; services: Array<{ service: { serviceId: string; name: string } }>; availabilityRules?: AvailabilityRule[] }
interface AvailabilityRule { ruleId: string; dayOfWeek: number; startLocal: string; endLocal: string; slotIntervalMin: number }
interface Service { serviceId: string; name: string; durationMin: number; bufferBeforeMin: number; bufferAfterMin: number; active: boolean; priceSar?: number | null; priceNote?: string | null; priceNoteEn?: string | null; showPrice?: boolean; providers: Array<{ provider: { displayName: string } }> }

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/* ─── Main Page ───────────────────────────────────────────── */

export default function Management() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const { data: deptData, isLoading: deptLoading } = useQuery({ queryKey: ['departments'], queryFn: async () => (await api.get('/api/departments')).data })
  const { data: provData, isLoading: provLoading } = useQuery({ queryKey: ['providers'], queryFn: async () => (await api.get('/api/providers')).data })
  const { data: facData, isLoading: facLoading } = useQuery({ queryKey: ['facilities'], queryFn: async () => (await api.get('/api/facilities')).data })
  const { data: svcData, isLoading: svcLoading } = useQuery({ queryKey: ['services'], queryFn: async () => (await api.get('/api/services')).data })

  const departments: Department[] = deptData?.data || []
  const providers: Provider[] = provData?.data || []
  const facilities: Facility[] = facData?.data || []
  const services: Service[] = svcData?.data || []
  const isLoading = deptLoading || provLoading || facLoading || svcLoading

  const providersByDept = useMemo(() => {
    const grouped: Record<string, Provider[]> = {}
    const unassigned: Provider[] = []
    for (const p of providers) {
      if (p.departmentId) {
        if (!grouped[p.departmentId]) grouped[p.departmentId] = []
        grouped[p.departmentId].push(p)
      } else {
        unassigned.push(p)
      }
    }
    return { grouped, unassigned }
  }, [providers])

  // Setup warnings
  const warnings: string[] = []
  const provsNoSchedule = providers.filter(p => p.active && (!p.availabilityRules || p.availabilityRules.length === 0))
  const provsNoServices = providers.filter(p => p.active && p.services.length === 0)
  if (provsNoSchedule.length > 0) warnings.push(isAr ? `${provsNoSchedule.length} أطباء بدون جدول عمل` : `${provsNoSchedule.length} provider(s) have no schedule`)
  if (provsNoServices.length > 0) warnings.push(isAr ? `${provsNoServices.length} أطباء بدون خدمات` : `${provsNoServices.length} provider(s) have no services`)

  if (isLoading) return <div className="flex items-center justify-center h-96"><LoadingSpinner /></div>

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{isAr ? 'إعداد العيادة' : 'Clinic Setup'}</h1>
          <p className="page-subtitle">{isAr ? 'إدارة الأقسام والعيادات والأطباء والخدمات' : 'Manage sections, clinics, providers, and services'}</p>
        </div>
      </div>

      {/* Setup warnings */}
      {warnings.length > 0 && (
        <div className="bg-warning-50 border border-warning-200/50 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warning-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            {warnings.map((w, i) => <p key={i} className="text-sm text-warning-800">{w}</p>)}
          </div>
        </div>
      )}

      {/* Facility locations panel */}
      <FacilityPanel facilities={facilities} isAr={isAr} />

      {/* Department accordions */}
      {departments.length === 0 && providersByDept.unassigned.length === 0 ? (
        <div className="card p-8">
          <EmptyState
            icon={Stethoscope}
            title={isAr ? 'ابدأ بإعداد عيادتك' : 'Start setting up your clinic'}
            description={isAr ? 'أضف الأقسام ثم الأطباء والخدمات' : 'Add sections, then providers and services'}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {departments.map(dept => (
            <DepartmentAccordion
              key={dept.departmentId}
              department={dept}
              providers={providersByDept.grouped[dept.departmentId] || []}
              departments={departments}
              facilities={facilities}
              allServices={services}
              isAr={isAr}
            />
          ))}

          {/* Unassigned providers */}
          {providersByDept.unassigned.length > 0 && (
            <UnassignedSection
              providers={providersByDept.unassigned}
              departments={departments}
              facilities={facilities}
              allServices={services}
              isAr={isAr}
            />
          )}
        </div>
      )}

      {/* Add Section button */}
      <AddSectionButton isAr={isAr} />

      {/* Services catalog */}
      <ServicesCatalog services={services} isAr={isAr} />
    </div>
  )
}

/* ─── Facility Panel ──────────────────────────────────────── */

function FacilityPanel({ facilities, isAr }: { facilities: Facility[]; isAr: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Facility | null>(null)
  const [form, setForm] = useState({ name: '', timezone: 'Asia/Riyadh', addressLine1: '', city: '', region: '', country: 'Saudi Arabia' })
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const qc = useQueryClient()

  const createM = useMutation({ mutationFn: (d: typeof form) => api.post('/api/facilities', d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['facilities'] }); close() } })
  const updateM = useMutation({ mutationFn: ({ id, d }: { id: string; d: typeof form }) => api.put(`/api/facilities/${id}`, d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['facilities'] }); close() } })
  const deleteM = useMutation({ mutationFn: (id: string) => api.delete(`/api/facilities/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['facilities'] }); setDeleteConfirm(null) } })

  const open = (f?: Facility) => {
    if (f) { setEditing(f); setForm({ name: f.name, timezone: f.timezone, addressLine1: f.addressLine1 || '', city: f.city || '', region: f.region || '', country: f.country || 'Saudi Arabia' }) }
    else { setEditing(null); setForm({ name: '', timezone: 'Asia/Riyadh', addressLine1: '', city: '', region: '', country: 'Saudi Arabia' }) }
    setShowModal(true)
  }
  const close = () => { setShowModal(false); setEditing(null) }
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (!form.name.trim()) return; editing ? updateM.mutate({ id: editing.facilityId, d: form }) : createM.mutate(form) }

  return (
    <div className="card overflow-hidden">
      <div role="button" tabIndex={0} onClick={() => setExpanded(!expanded)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded) } }} className="w-full flex items-center justify-between p-4 hover:bg-healthcare-bg/50 transition-colors cursor-pointer">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-success-50 flex items-center justify-center">
            <Building2 className="h-4 w-4 text-success-500" />
          </div>
          <span className="font-semibold text-healthcare-text">{isAr ? 'المواقع' : 'Locations'}</span>
          <Badge variant="neutral">{facilities.length}</Badge>
          {facilities.length > 0 && (
            <span className="text-xs text-healthcare-muted hidden sm:inline">
              {facilities.map(f => f.name).join(' · ')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={(e) => { e.stopPropagation(); open() }} className="btn-primary btn-sm text-xs"><Plus className="h-3.5 w-3.5" />{isAr ? 'إضافة' : 'Add'}</button>
          {expanded ? <ChevronDown className="h-4 w-4 text-healthcare-muted" /> : <ChevronRight className="h-4 w-4 text-healthcare-muted rtl:rotate-180" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-healthcare-border/30 p-4">
          {facilities.length === 0 ? (
            <p className="text-sm text-healthcare-muted text-center py-4">{isAr ? 'لا توجد مواقع' : 'No locations yet'}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {facilities.map(f => (
                <div key={f.facilityId} className="p-3 rounded-lg bg-healthcare-bg/50 border border-healthcare-border/20 group">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-medium text-sm text-healthcare-text">{f.name}</h4>
                      <p className="text-xs text-healthcare-muted">{f.timezone}</p>
                    </div>
                    {deleteConfirm === f.facilityId ? (
                      <div className="flex gap-1">
                        <button onClick={() => deleteM.mutate(f.facilityId)} className="btn-danger btn-sm px-2 py-0.5 min-h-0 text-xs">{isAr ? 'نعم' : 'Yes'}</button>
                        <button onClick={() => setDeleteConfirm(null)} className="btn-ghost btn-sm px-2 py-0.5 min-h-0 text-xs">{isAr ? 'لا' : 'No'}</button>
                      </div>
                    ) : (
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => open(f)} className="btn-icon btn-ghost p-1 min-w-[28px] min-h-[28px]"><Pencil className="h-3 w-3" /></button>
                        <button onClick={() => setDeleteConfirm(f.facilityId)} className="btn-icon btn-ghost p-1 min-w-[28px] min-h-[28px] hover:text-danger-500"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-healthcare-muted">
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{[f.city, f.region].filter(Boolean).join('، ') || (isAr ? 'بدون عنوان' : 'No address')}</span>
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{f._count.providers}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Modal open={showModal} onClose={close} title={editing ? (isAr ? 'تعديل الموقع' : 'Edit Location') : (isAr ? 'إضافة موقع' : 'Add Location')}>
        <form onSubmit={submit} className="space-y-4">
          <div><label className="input-label">{isAr ? 'الاسم *' : 'Name *'}</label><input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input" required autoFocus /></div>
          <div><label className="input-label">{isAr ? 'المنطقة الزمنية' : 'Timezone'}</label>
            <select value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })} className="select">
              <option value="Asia/Riyadh">Asia/Riyadh (GMT+3)</option><option value="Asia/Dubai">Asia/Dubai (GMT+4)</option><option value="UTC">UTC</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="text" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder={isAr ? 'المدينة' : 'City'} className="input" />
            <input type="text" value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} placeholder={isAr ? 'المنطقة' : 'Region'} className="input" />
          </div>
          <div className="flex gap-3"><button type="button" onClick={close} className="btn-outline flex-1">{isAr ? 'إلغاء' : 'Cancel'}</button><button type="submit" disabled={createM.isPending || updateM.isPending} className="btn-primary flex-1">{editing ? (isAr ? 'تحديث' : 'Update') : (isAr ? 'إضافة' : 'Add')}</button></div>
        </form>
      </Modal>
    </div>
  )
}

/* ─── Department Accordion ────────────────────────────────── */

function DepartmentAccordion({ department, providers, departments, facilities, allServices, isAr }: {
  department: Department; providers: Provider[]; departments: Department[]; facilities: Facility[]; allServices: Service[]; isAr: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [showAddProvider, setShowAddProvider] = useState(false)
  const [editingDept, setEditingDept] = useState(false)
  const [deptName, setDeptName] = useState(department.name)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const qc = useQueryClient()

  const updateDeptM = useMutation({ mutationFn: (d: { name: string }) => api.put(`/api/departments/${department.departmentId}`, d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); setEditingDept(false) } })
  const deleteDeptM = useMutation({ mutationFn: () => api.delete(`/api/departments/${department.departmentId}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); qc.invalidateQueries({ queryKey: ['providers'] }) } })

  const serviceCount = new Set(providers.flatMap(p => p.services.map(s => s.service.serviceId))).size
  const facilityNames = [...new Set(providers.map(p => p.facility?.name).filter(Boolean))]

  return (
    <div className="card overflow-hidden">
      {/* Accordion header */}
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between p-4 hover:bg-healthcare-bg/50 transition-colors">
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="h-5 w-5 text-primary-500" /> : <ChevronRight className="h-5 w-5 text-primary-500 rtl:rotate-180" />}
          <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center">
            <FolderTree className="h-4.5 w-4.5 text-primary-500" />
          </div>
          <div className="text-start">
            <h3 className="font-semibold text-healthcare-text">{department.name}</h3>
            <p className="text-xs text-healthcare-muted">
              {providers.length} {isAr ? 'طبيب' : 'provider(s)'} · {serviceCount} {isAr ? 'خدمة' : 'service(s)'}
              {facilityNames.length > 0 && <> · {facilityNames.join(', ')}</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          {deleteConfirm ? (
            <div className="flex gap-1">
              <button onClick={() => deleteDeptM.mutate()} className="btn-danger btn-sm px-2 py-1 min-h-0 text-xs">{isAr ? 'حذف' : 'Delete'}</button>
              <button onClick={() => setDeleteConfirm(false)} className="btn-ghost btn-sm px-2 py-1 min-h-0 text-xs">{isAr ? 'إلغاء' : 'Cancel'}</button>
            </div>
          ) : (
            <>
              <button onClick={() => { setDeptName(department.name); setEditingDept(true) }} className="btn-icon btn-ghost p-1.5 min-w-[32px] min-h-[32px]"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => setDeleteConfirm(true)} className="btn-icon btn-ghost p-1.5 min-w-[32px] min-h-[32px] hover:text-danger-500"><Trash2 className="h-3.5 w-3.5" /></button>
            </>
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-healthcare-border/30 p-4 space-y-3">
          {providers.length === 0 ? (
            <p className="text-sm text-healthcare-muted text-center py-4">{isAr ? 'لا يوجد أطباء في هذا القسم' : 'No providers in this section'}</p>
          ) : (
            providers.map(p => (
              <ProviderCard key={p.providerId} provider={p} departments={departments} facilities={facilities} allServices={allServices} isAr={isAr} />
            ))
          )}
          <button onClick={() => setShowAddProvider(true)} className="w-full py-2.5 border-2 border-dashed border-healthcare-border/40 rounded-xl text-sm text-healthcare-muted hover:text-primary-500 hover:border-primary-300 transition-colors flex items-center justify-center gap-2">
            <Plus className="h-4 w-4" />{isAr ? 'إضافة طبيب لهذا القسم' : 'Add provider to this section'}
          </button>
        </div>
      )}

      {/* Edit department modal */}
      <Modal open={editingDept} onClose={() => setEditingDept(false)} title={isAr ? 'تعديل القسم' : 'Edit Section'}>
        <form onSubmit={e => { e.preventDefault(); if (deptName.trim()) updateDeptM.mutate({ name: deptName }) }} className="space-y-4">
          <div><label className="input-label">{isAr ? 'اسم القسم' : 'Section Name'}</label><input type="text" value={deptName} onChange={e => setDeptName(e.target.value)} className="input" required autoFocus /></div>
          <div className="flex gap-3"><button type="button" onClick={() => setEditingDept(false)} className="btn-outline flex-1">{isAr ? 'إلغاء' : 'Cancel'}</button><button type="submit" disabled={updateDeptM.isPending} className="btn-primary flex-1">{isAr ? 'تحديث' : 'Update'}</button></div>
        </form>
      </Modal>

      {/* Add provider modal (pre-filled with this department) */}
      {showAddProvider && (
        <ProviderFormModal
          isAr={isAr}
          departments={departments}
          facilities={facilities}
          defaultDeptId={department.departmentId}
          onClose={() => setShowAddProvider(false)}
        />
      )}
    </div>
  )
}

/* ─── Unassigned Providers Section ────────────────────────── */

function UnassignedSection({ providers, departments, facilities, allServices, isAr }: {
  providers: Provider[]; departments: Department[]; facilities: Facility[]; allServices: Service[]; isAr: boolean
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="card overflow-hidden border-warning-200/50">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between p-4 hover:bg-warning-50/50 transition-colors">
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="h-5 w-5 text-warning-500" /> : <ChevronRight className="h-5 w-5 text-warning-500 rtl:rotate-180" />}
          <div className="w-9 h-9 rounded-lg bg-warning-50 flex items-center justify-center">
            <AlertTriangle className="h-4.5 w-4.5 text-warning-500" />
          </div>
          <div className="text-start">
            <h3 className="font-semibold text-healthcare-text">{isAr ? 'أطباء بدون قسم' : 'Unassigned Providers'}</h3>
            <p className="text-xs text-warning-600">{providers.length} {isAr ? 'طبيب بحاجة لتعيين قسم' : 'provider(s) need a section assignment'}</p>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-healthcare-border/30 p-4 space-y-3">
          {providers.map(p => (
            <ProviderCard key={p.providerId} provider={p} departments={departments} facilities={facilities} allServices={allServices} isAr={isAr} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Provider Card ───────────────────────────────────────── */

function ProviderCard({ provider, departments, facilities, allServices, isAr }: {
  provider: Provider; departments: Department[]; facilities: Facility[]; allServices: Service[]; isAr: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showAvail, setShowAvail] = useState(false)
  const [showServices, setShowServices] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const qc = useQueryClient()

  const { data: provDetails } = useQuery({
    queryKey: ['provider-details', provider.providerId],
    queryFn: async () => (await api.get(`/api/providers/${provider.providerId}`)).data,
    enabled: expanded || showAvail,
  })

  const deleteM = useMutation({ mutationFn: () => api.delete(`/api/providers/${provider.providerId}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['providers'] }); setDeleteConfirm(false) } })
  const linkServiceM = useMutation({
    mutationFn: (serviceId: string) => api.post(`/api/providers/${provider.providerId}/services`, { serviceId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['providers'] }) },
  })
  const unlinkServiceM = useMutation({
    mutationFn: (serviceId: string) => api.delete(`/api/providers/${provider.providerId}/services/${serviceId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['providers'] }) },
  })

  const availRules: AvailabilityRule[] = provDetails?.availabilityRules || []

  return (
    <div className="rounded-xl border border-healthcare-border/30 bg-white overflow-hidden">
      {/* Provider header */}
      <div className="flex items-center justify-between p-3 hover:bg-healthcare-bg/30 transition-colors">
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-3 flex-1 text-start">
          {expanded ? <ChevronDown className="h-4 w-4 text-healthcare-muted" /> : <ChevronRight className="h-4 w-4 text-healthcare-muted rtl:rotate-180" />}
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-primary-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm text-healthcare-text">{provider.displayName}</span>
              {!provider.active && <Badge variant="neutral">{isAr ? 'غير نشط' : 'Inactive'}</Badge>}
              {provider.credentials && <span className="text-xs text-healthcare-muted">({provider.credentials})</span>}
            </div>
            <div className="flex items-center gap-3 text-xs text-healthcare-muted mt-0.5 flex-wrap">
              {provider.facility && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{provider.facility.name}</span>}
              {provider.services.length > 0 && <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{provider.services.length} {isAr ? 'خدمة' : 'services'}</span>}
              {provider.department && !provider.departmentId && <span className="flex items-center gap-1"><FolderTree className="h-3 w-3" />{provider.department.name}</span>}
            </div>
          </div>
        </button>
        <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
          {deleteConfirm ? (
            <div className="flex gap-1">
              <button onClick={() => deleteM.mutate()} className="btn-danger btn-sm px-2 py-0.5 min-h-0 text-xs">{isAr ? 'نعم' : 'Yes'}</button>
              <button onClick={() => setDeleteConfirm(false)} className="btn-ghost btn-sm px-2 py-0.5 min-h-0 text-xs">{isAr ? 'لا' : 'No'}</button>
            </div>
          ) : (
            <>
              <button onClick={() => setShowServices(true)} className="btn-icon btn-ghost p-1.5 min-w-[30px] min-h-[30px] text-primary-500" title={isAr ? 'الخدمات' : 'Services'}><Briefcase className="h-3.5 w-3.5" /></button>
              <button onClick={() => setShowAvail(true)} className="btn-icon btn-ghost p-1.5 min-w-[30px] min-h-[30px] text-success-500" title={isAr ? 'أوقات العمل' : 'Availability'}><Clock className="h-3.5 w-3.5" /></button>
              <button onClick={() => setShowEdit(true)} className="btn-icon btn-ghost p-1.5 min-w-[30px] min-h-[30px]"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => setDeleteConfirm(true)} className="btn-icon btn-ghost p-1.5 min-w-[30px] min-h-[30px] hover:text-danger-500"><Trash2 className="h-3.5 w-3.5" /></button>
            </>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-healthcare-border/20 px-4 py-3 space-y-3 bg-healthcare-bg/20">
          {/* Services chips */}
          {provider.services.length > 0 && (
            <div>
              <p className="text-xs font-medium text-healthcare-muted mb-1.5">{isAr ? 'الخدمات' : 'Services'}</p>
              <div className="flex flex-wrap gap-1.5">
                {provider.services.map(s => (
                  <span key={s.service.serviceId} className="inline-flex items-center px-2.5 py-1 rounded-full bg-primary-50 text-primary-700 text-xs font-medium">
                    {s.service.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Availability schedule */}
          <div>
            <p className="text-xs font-medium text-healthcare-muted mb-1.5">{isAr ? 'الجدول' : 'Schedule'}</p>
            {availRules.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {availRules.map(r => (
                  <span key={r.ruleId} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success-50 text-success-700 text-xs">
                    <Calendar className="h-3 w-3" />
                    {isAr ? DAYS[r.dayOfWeek] : DAYS_EN[r.dayOfWeek]} {r.startLocal.slice(11, 16)}-{r.endLocal.slice(11, 16)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-warning-600">{isAr ? 'لم يتم تعيين جدول' : 'No schedule set'}</p>
            )}
          </div>
        </div>
      )}

      {/* Edit provider modal */}
      {showEdit && (
        <ProviderFormModal
          isAr={isAr}
          departments={departments}
          facilities={facilities}
          editing={provider}
          onClose={() => setShowEdit(false)}
        />
      )}

      {/* Availability modal */}
      {showAvail && (
        <ScheduleModal
          providerId={provider.providerId}
          providerName={provider.displayName}
          availRules={availRules}
          isAr={isAr}
          onClose={() => setShowAvail(false)}
        />
      )}

      {/* Services assignment modal */}
      <Modal open={showServices} onClose={() => setShowServices(false)} title={`${isAr ? 'خدمات' : 'Services'} — ${provider.displayName}`}>
        <div className="space-y-3">
          <p className="text-sm text-healthcare-muted">{isAr ? 'اختر الخدمات التي يقدمها هذا الطبيب' : 'Select the services this provider offers'}</p>
          {allServices.length === 0 ? (
            <div className="p-4 bg-warning-50 border border-warning-200/50 rounded-lg text-sm text-warning-800">
              {isAr ? 'لا توجد خدمات. أضف خدمات من كتالوج الخدمات أولاً.' : 'No services available. Add services from the Services Catalog first.'}
            </div>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {allServices.filter(s => s.active).map(svc => {
                const isLinked = provider.services.some(ps => ps.service.serviceId === svc.serviceId)
                const isToggling = linkServiceM.isPending || unlinkServiceM.isPending
                return (
                  <label key={svc.serviceId} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${isLinked ? 'border-primary-300 bg-primary-50/50' : 'border-healthcare-border/30 hover:bg-healthcare-bg/50'}`}>
                    <input
                      type="checkbox"
                      checked={isLinked}
                      disabled={isToggling}
                      onChange={() => isLinked ? unlinkServiceM.mutate(svc.serviceId) : linkServiceM.mutate(svc.serviceId)}
                      className="checkbox"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-healthcare-text">{svc.name}</span>
                      <span className="text-xs text-healthcare-muted ms-2">{svc.durationMin} {isAr ? 'دقيقة' : 'min'}</span>
                    </div>
                  </label>
                )
              })}
            </div>
          )}
          <button onClick={() => setShowServices(false)} className="btn-outline w-full">{isAr ? 'إغلاق' : 'Close'}</button>
        </div>
      </Modal>
    </div>
  )
}

/* ─── Schedule Modal (Weekly Working Hours) ───────────────── */

function ScheduleModal({ providerId, providerName, availRules, isAr, onClose }: {
  providerId: string; providerName: string; availRules: AvailabilityRule[]; isAr: boolean; onClose: () => void
}) {
  const [addingDay, setAddingDay] = useState<number | null>(null)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [slotInterval, setSlotInterval] = useState(15)
  const qc = useQueryClient()

  const addM = useMutation({
    mutationFn: (d: { dayOfWeek: number; startLocal: string; endLocal: string; slotIntervalMin: number }) =>
      api.post(`/api/providers/${providerId}/availability`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['providers'] })
      qc.invalidateQueries({ queryKey: ['provider-details', providerId] })
      setAddingDay(null); setStartTime('09:00'); setEndTime('17:00')
    },
  })

  const deleteM = useMutation({
    mutationFn: (ruleId: string) => api.delete(`/api/providers/${providerId}/availability/${ruleId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['providers'] })
      qc.invalidateQueries({ queryKey: ['provider-details', providerId] })
    },
  })

  // Group rules by day
  const rulesByDay: Record<number, AvailabilityRule[]> = {}
  for (const r of availRules) {
    if (!rulesByDay[r.dayOfWeek]) rulesByDay[r.dayOfWeek] = []
    rulesByDay[r.dayOfWeek].push(r)
  }

  const dayNames = isAr ? DAYS : DAYS_EN
  const dayOrder = [0, 1, 2, 3, 4, 5, 6] // Sun-Sat

  return (
    <Modal open onClose={onClose} title={`${isAr ? 'جدول العمل' : 'Work Schedule'} — ${providerName}`} size="lg">
      <div className="space-y-1">
        {dayOrder.map(dayIdx => {
          const dayRules = rulesByDay[dayIdx] || []
          const hasRules = dayRules.length > 0
          const isAdding = addingDay === dayIdx

          return (
            <div key={dayIdx} className={`rounded-lg border transition-colors ${hasRules ? 'border-success-200 bg-success-50/30' : 'border-healthcare-border/20 bg-healthcare-bg/20'}`}>
              {/* Day row */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${hasRules ? 'bg-success-500' : 'bg-gray-300'}`} />
                  <span className={`font-medium text-sm ${hasRules ? 'text-healthcare-text' : 'text-healthcare-muted'}`}>
                    {dayNames[dayIdx]}
                  </span>
                  {/* Show time ranges inline */}
                  {hasRules && (
                    <div className="flex flex-wrap gap-1.5">
                      {dayRules.map(r => (
                        <span key={r.ruleId} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-success-100 text-success-700 text-xs font-medium">
                          <Clock className="h-3 w-3" />
                          {r.startLocal.slice(11, 16)} - {r.endLocal.slice(11, 16)}
                          <button
                            onClick={() => deleteM.mutate(r.ruleId)}
                            disabled={deleteM.isPending}
                            className="ms-0.5 hover:text-danger-500 transition-colors"
                            title={isAr ? 'حذف' : 'Remove'}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {!isAdding && (
                  <button
                    onClick={() => { setAddingDay(dayIdx); setStartTime('09:00'); setEndTime('17:00') }}
                    className="btn-ghost btn-sm text-xs px-2 py-1 min-h-0 text-primary-500 hover:text-primary-700"
                  >
                    <Plus className="h-3.5 w-3.5" />{isAr ? 'إضافة' : 'Add'}
                  </button>
                )}
              </div>

              {/* Inline add form */}
              {isAdding && (
                <div className="px-4 pb-3 pt-0">
                  <div className="flex items-end gap-2 flex-wrap">
                    <div className="flex-1 min-w-[100px]">
                      <label className="text-xs text-healthcare-muted">{isAr ? 'من' : 'From'}</label>
                      <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="input text-sm py-1.5" />
                    </div>
                    <div className="flex-1 min-w-[100px]">
                      <label className="text-xs text-healthcare-muted">{isAr ? 'إلى' : 'To'}</label>
                      <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="input text-sm py-1.5" />
                    </div>
                    <div className="min-w-[80px]">
                      <label className="text-xs text-healthcare-muted">{isAr ? 'مدة الفترة' : 'Slot'}</label>
                      <select value={slotInterval} onChange={e => setSlotInterval(parseInt(e.target.value))} className="select text-sm py-1.5">
                        <option value={10}>10 min</option>
                        <option value={15}>15 min</option>
                        <option value={20}>20 min</option>
                        <option value={30}>30 min</option>
                        <option value={45}>45 min</option>
                        <option value={60}>60 min</option>
                      </select>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => addM.mutate({ dayOfWeek: dayIdx, startLocal: startTime, endLocal: endTime, slotIntervalMin: slotInterval })}
                        disabled={addM.isPending}
                        className="btn-primary btn-sm text-xs px-3 py-1.5 min-h-0"
                      >
                        {addM.isPending ? '...' : (isAr ? 'حفظ' : 'Save')}
                      </button>
                      <button onClick={() => setAddingDay(null)} className="btn-ghost btn-sm text-xs px-2 py-1.5 min-h-0">
                        {isAr ? 'إلغاء' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-4">
        <button onClick={onClose} className="btn-outline w-full">{isAr ? 'إغلاق' : 'Close'}</button>
      </div>
    </Modal>
  )
}

/* ─── Provider Form Modal ─────────────────────────────────── */

function ProviderFormModal({ isAr, departments, facilities, editing, defaultDeptId, onClose }: {
  isAr: boolean; departments: Department[]; facilities: Facility[]; editing?: Provider; defaultDeptId?: string; onClose: () => void
}) {
  const [form, setForm] = useState({
    displayName: editing?.displayName || '',
    credentials: editing?.credentials || '',
    departmentId: editing?.departmentId || defaultDeptId || '',
    facilityId: editing?.facilityId || '',
    active: editing?.active ?? true,
  })
  const qc = useQueryClient()

  const createM = useMutation({
    mutationFn: (d: typeof form) => api.post('/api/providers', { displayName: d.displayName, credentials: d.credentials || undefined, departmentId: d.departmentId || undefined, facilityId: d.facilityId || undefined, active: d.active }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['providers'] }); qc.invalidateQueries({ queryKey: ['departments'] }); onClose() },
  })
  const updateM = useMutation({
    mutationFn: (d: typeof form) => api.put(`/api/providers/${editing!.providerId}`, { displayName: d.displayName, credentials: d.credentials || undefined, departmentId: d.departmentId || undefined, facilityId: d.facilityId || undefined, active: d.active }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['providers'] }); qc.invalidateQueries({ queryKey: ['departments'] }); onClose() },
  })

  const submit = (e: React.FormEvent) => { e.preventDefault(); if (!form.displayName.trim()) return; editing ? updateM.mutate(form) : createM.mutate(form) }

  return (
    <Modal open onClose={onClose} title={editing ? (isAr ? 'تعديل الطبيب' : 'Edit Provider') : (isAr ? 'إضافة طبيب' : 'Add Provider')}>
      <form onSubmit={submit} className="space-y-4">
        <div><label className="input-label">{isAr ? 'الاسم *' : 'Name *'}</label><input type="text" value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} className="input" required autoFocus /></div>
        <div><label className="input-label">{isAr ? 'المؤهلات' : 'Credentials'}</label><input type="text" value={form.credentials} onChange={e => setForm({ ...form, credentials: e.target.value })} className="input" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="input-label">{isAr ? 'القسم' : 'Section'}</label><select value={form.departmentId} onChange={e => setForm({ ...form, departmentId: e.target.value })} className="select"><option value="">{isAr ? 'اختر' : 'Select'}</option>{departments.map(d => <option key={d.departmentId} value={d.departmentId}>{d.name}</option>)}</select></div>
          <div><label className="input-label">{isAr ? 'العيادة' : 'Clinic'}</label><select value={form.facilityId} onChange={e => setForm({ ...form, facilityId: e.target.value })} className="select"><option value="">{isAr ? 'اختر' : 'Select'}</option>{facilities.map(f => <option key={f.facilityId} value={f.facilityId}>{f.name}</option>)}</select></div>
        </div>
        <div className="flex items-center gap-2"><input type="checkbox" id="prov-active-form" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} className="checkbox" /><label htmlFor="prov-active-form" className="text-sm text-healthcare-text">{isAr ? 'نشط' : 'Active'}</label></div>
        <div className="flex gap-3"><button type="button" onClick={onClose} className="btn-outline flex-1">{isAr ? 'إلغاء' : 'Cancel'}</button><button type="submit" disabled={createM.isPending || updateM.isPending} className="btn-primary flex-1">{editing ? (isAr ? 'تحديث' : 'Update') : (isAr ? 'إضافة' : 'Add')}</button></div>
      </form>
    </Modal>
  )
}

/* ─── Add Section Button ──────────────────────────────────── */

function AddSectionButton({ isAr }: { isAr: boolean }) {
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const qc = useQueryClient()

  const createM = useMutation({
    mutationFn: (d: { name: string }) => api.post('/api/departments', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); setShowModal(false); setName('') },
  })

  return (
    <>
      <button onClick={() => setShowModal(true)} className="w-full py-3 border-2 border-dashed border-healthcare-border/40 rounded-xl text-sm text-healthcare-muted hover:text-primary-500 hover:border-primary-300 transition-colors flex items-center justify-center gap-2">
        <Plus className="h-4 w-4" />{isAr ? 'إضافة قسم جديد' : 'Add new section'}
      </button>
      <Modal open={showModal} onClose={() => { setShowModal(false); setName('') }} title={isAr ? 'إضافة قسم' : 'Add Section'}>
        <form onSubmit={e => { e.preventDefault(); if (name.trim()) createM.mutate({ name }) }} className="space-y-4">
          <div><label className="input-label">{isAr ? 'اسم القسم' : 'Section Name'}</label><input type="text" value={name} onChange={e => setName(e.target.value)} className="input" required autoFocus /></div>
          <div className="flex gap-3"><button type="button" onClick={() => { setShowModal(false); setName('') }} className="btn-outline flex-1">{isAr ? 'إلغاء' : 'Cancel'}</button><button type="submit" disabled={createM.isPending} className="btn-primary flex-1">{isAr ? 'إضافة' : 'Add'}</button></div>
        </form>
      </Modal>
    </>
  )
}

/* ─── Services Catalog ────────────────────────────────────── */

function ServicesCatalog({ services, isAr }: { services: Service[]; isAr: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const emptyForm = { name: '', durationMin: 30, bufferBeforeMin: 0, bufferAfterMin: 0, active: true, priceSar: '' as string | number, priceNote: '', priceNoteEn: '', showPrice: false }
  const [formData, setFormData] = useState(emptyForm)
  const qc = useQueryClient()
  const { addToast } = useToast()

  const createM = useMutation({
    mutationFn: (data: typeof formData) => {
      const payload: Record<string, unknown> = {
        name: data.name,
        durationMin: data.durationMin,
        bufferBeforeMin: data.bufferBeforeMin,
        bufferAfterMin: data.bufferAfterMin,
        active: data.active,
        showPrice: data.showPrice,
        priceNote: data.priceNote || null,
        priceNoteEn: data.priceNoteEn || null,
      }
      if (data.priceSar !== '' && data.priceSar !== null && !Number.isNaN(Number(data.priceSar))) {
        payload.priceSar = Number(data.priceSar)
      } else {
        payload.priceSar = null
      }
      return api.post('/api/services', payload).then(r => r.data)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['services'] }); setShowModal(false); setFormData(emptyForm); addToast({ type: 'success', title: isAr ? 'تم إضافة الخدمة' : 'Service created' }) },
    onError: (err: any) => { addToast({ type: 'error', title: err.response?.data?.error || 'Failed' }) },
  })

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between p-4 hover:bg-healthcare-bg/50 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
            <Briefcase className="h-4 w-4 text-primary-500" />
          </div>
          <span className="font-semibold text-healthcare-text">{isAr ? 'كتالوج الخدمات' : 'Services Catalog'}</span>
          <Badge variant="neutral">{services.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={e => { e.stopPropagation(); setShowModal(true) }} className="btn-primary btn-sm text-xs"><Plus className="h-3.5 w-3.5" />{isAr ? 'إضافة' : 'Add'}</button>
          {expanded ? <ChevronDown className="h-4 w-4 text-healthcare-muted" /> : <ChevronRight className="h-4 w-4 text-healthcare-muted rtl:rotate-180" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-healthcare-border/30">
          {services.length === 0 ? (
            <div className="p-8"><EmptyState icon={Briefcase} title={isAr ? 'لا توجد خدمات' : 'No services yet'} action={{ label: isAr ? 'إضافة خدمة' : 'Add Service', onClick: () => setShowModal(true) }} /></div>
          ) : (
            <table className="min-w-full">
              <thead className="table-header"><tr><th>{isAr ? 'الخدمة' : 'Service'}</th><th>{isAr ? 'المدة' : 'Duration'}</th><th>{isAr ? 'السعر' : 'Price'}</th><th>{isAr ? 'الفاصل' : 'Buffer'}</th><th>{isAr ? 'الأطباء' : 'Providers'}</th><th>{isAr ? 'الحالة' : 'Status'}</th></tr></thead>
              <tbody>{services.map(s => (
                <tr key={s.serviceId} className="table-row">
                  <td><span className="font-semibold text-healthcare-text">{s.name}</span></td>
                  <td><div className="flex items-center gap-1.5 text-sm text-healthcare-muted"><Clock className="h-4 w-4 text-primary-400" />{s.durationMin} {isAr ? 'دقيقة' : 'min'}</div></td>
                  <td>
                    {s.priceSar != null ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-healthcare-text">{s.priceSar} {isAr ? 'ر.س' : 'SAR'}</span>
                        {s.showPrice ? <Badge variant="success">{isAr ? 'يظهر للذكاء' : 'Shown to AI'}</Badge> : <Badge variant="neutral">{isAr ? 'مخفي' : 'Hidden'}</Badge>}
                      </div>
                    ) : (
                      <span className="text-xs text-healthcare-muted">—</span>
                    )}
                  </td>
                  <td className="text-sm text-healthcare-muted">{s.bufferBeforeMin > 0 || s.bufferAfterMin > 0 ? `${s.bufferBeforeMin}m / ${s.bufferAfterMin}m` : (isAr ? 'بدون فاصل' : 'No buffer')}</td>
                  <td><div className="flex items-center gap-1.5 text-sm text-healthcare-muted"><Users className="h-4 w-4 text-primary-400" />{s.providers.length} {isAr ? 'طبيب' : 'providers'}</div></td>
                  <td><Badge variant={s.active ? 'success' : 'neutral'} dot>{s.active ? (isAr ? 'نشط' : 'Active') : (isAr ? 'غير نشط' : 'Inactive')}</Badge></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={isAr ? 'إضافة خدمة' : 'Add Service'}>
        <form onSubmit={e => { e.preventDefault(); createM.mutate(formData) }} className="space-y-4">
          <div><label className="input-label">{isAr ? 'اسم الخدمة *' : 'Service Name *'}</label><input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="input" required autoFocus /></div>
          <div><label className="input-label">{isAr ? 'المدة (بالدقائق) *' : 'Duration (minutes) *'}</label><input type="number" value={formData.durationMin} onChange={e => setFormData({ ...formData, durationMin: parseInt(e.target.value) || 0 })} className="input" min={5} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="input-label">{isAr ? 'فاصل قبل (دقائق)' : 'Buffer Before (min)'}</label><input type="number" value={formData.bufferBeforeMin} onChange={e => setFormData({ ...formData, bufferBeforeMin: parseInt(e.target.value) || 0 })} className="input" min={0} /></div>
            <div><label className="input-label">{isAr ? 'فاصل بعد (دقائق)' : 'Buffer After (min)'}</label><input type="number" value={formData.bufferAfterMin} onChange={e => setFormData({ ...formData, bufferAfterMin: parseInt(e.target.value) || 0 })} className="input" min={0} /></div>
          </div>
          <div className="border-t border-healthcare-border/30 pt-4 space-y-3">
            <div className="text-sm font-semibold text-healthcare-text">{isAr ? 'السعر (اختياري)' : 'Pricing (optional)'}</div>
            <div><label className="input-label">{isAr ? 'السعر بالريال السعودي' : 'Price in SAR'}</label><input type="number" value={formData.priceSar} onChange={e => setFormData({ ...formData, priceSar: e.target.value })} className="input" min={0} placeholder="200" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="input-label">{isAr ? 'ملاحظة (عربي)' : 'Note (Arabic)'}</label><input type="text" value={formData.priceNote} onChange={e => setFormData({ ...formData, priceNote: e.target.value })} className="input" placeholder={isAr ? 'يختلف حسب الحالة' : ''} maxLength={200} /></div>
              <div><label className="input-label">{isAr ? 'ملاحظة (إنجليزي)' : 'Note (English)'}</label><input type="text" value={formData.priceNoteEn} onChange={e => setFormData({ ...formData, priceNoteEn: e.target.value })} className="input" placeholder={isAr ? '' : 'Varies by case'} maxLength={200} /></div>
            </div>
            <div className="flex items-start gap-2">
              <input type="checkbox" id="svc-show-price" checked={formData.showPrice} onChange={e => setFormData({ ...formData, showPrice: e.target.checked })} className="checkbox mt-0.5" />
              <label htmlFor="svc-show-price" className="text-sm text-healthcare-text leading-tight">
                {isAr ? 'إظهار السعر في ردود الذكاء الاصطناعي على الواتساب' : 'Show this price in WhatsApp AI replies'}
                <div className="text-xs text-healthcare-muted mt-0.5">{isAr ? 'إذا فُعّل، سيذكر المساعد السعر للمرضى مع تنبيه أنه تقريبي.' : 'When on, the assistant will quote this price with an "approximate" disclaimer.'}</div>
              </label>
            </div>
          </div>
          <div className="flex items-center gap-2"><input type="checkbox" id="svc-active" checked={formData.active} onChange={e => setFormData({ ...formData, active: e.target.checked })} className="checkbox" /><label htmlFor="svc-active" className="text-sm text-healthcare-text">{isAr ? 'نشط' : 'Active'}</label></div>
          <div className="flex gap-3"><button type="button" onClick={() => setShowModal(false)} className="btn-outline flex-1">{isAr ? 'إلغاء' : 'Cancel'}</button><button type="submit" disabled={createM.isPending} className="btn-primary flex-1">{createM.isPending ? (isAr ? 'جاري الإنشاء...' : 'Creating...') : (isAr ? 'إنشاء' : 'Create')}</button></div>
        </form>
      </Modal>
    </div>
  )
}
