import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import {
  ArrowLeft,
  Phone,
  Mail,
  Calendar,
  User,
  Edit3,
  Save,
  X,
  ClipboardList,
  Clock,
  CheckCircle,
  AlertCircle,
  Hash,
  Activity,
  Brain,
  Tag,
  Plus,
  RefreshCw,
  Sparkles,
  Heart,
  Star,
  BarChart3,
  MessageCircle,
} from 'lucide-react'
import { formatDate, formatTime, cn } from '../lib/utils'
import Badge, { getStatusBadgeVariant } from '../components/ui/Badge'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import StatCard from '../components/ui/StatCard'
import { useToast } from '../components/ui/Toast'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Contact {
  contactId: string
  contactType: string
  contactValue: string
  isPrimary: boolean
}

interface Appointment {
  appointmentId: string
  startTs: string
  endTs: string
  status: string
  reason: string | null
  provider: { displayName: string; providerId: string }
  service: { name: string; durationMin: number }
}

interface PatientInsight {
  patientId: string
  totalAppointments: number
  completedAppointments: number
  noShowCount: number
  cancelledCount: number
  completionRate: number
  preferredServiceIds: string[]
  preferredProviderIds: string[]
  preferredDayOfWeek: number | null
  preferredTimeSlot: string | null
  channelPreference: string | null
  engagementScore: number
  lastInteractionAt: string | null
  totalConversations: number
  lifetimeValue: number
}

interface PatientTag {
  tagId: string
  tag: string
  source: string
  createdAt: string
}

interface PatientMemory {
  memoryId: string
  memoryType: string
  memoryKey: string
  memoryValue: string
  confidence: number
  isActive: boolean
  updatedAt: string
}

interface KnowledgeData {
  memories: Record<string, PatientMemory[]>
  insight: PatientInsight | null
  tags: PatientTag[]
}

interface Patient {
  patientId: string
  firstName: string
  lastName: string
  dateOfBirth: string | null
  sex: string | null
  mrn: string | null
  createdAt: string
  contacts: Contact[]
  appointments: Appointment[]
  insight?: PatientInsight | null
  tags?: PatientTag[]
}

interface EditForm {
  firstName: string
  lastName: string
  dateOfBirth: string
  sex: string
  mrn: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcAge(dob: string | null): string | null {
  if (!dob) return null
  const birth = new Date(dob)
  const now = new Date()
  const age = now.getFullYear() - birth.getFullYear()
  return String(age)
}

const MEMORY_CATEGORIES = [
  { key: 'preference', icon: Star, labelAr: 'التفضيلات', labelEn: 'Preferences', bgColor: 'bg-yellow-50/50', borderColor: 'border-yellow-200/50', iconColor: 'text-yellow-500' },
  { key: 'service_interest', icon: Sparkles, labelAr: 'اهتمامات بالخدمات', labelEn: 'Service Interests', bgColor: 'bg-green-50/50', borderColor: 'border-green-200/50', iconColor: 'text-green-500' },
  { key: 'behavioral', icon: BarChart3, labelAr: 'أنماط سلوكية', labelEn: 'Behavioral', bgColor: 'bg-indigo-50/50', borderColor: 'border-indigo-200/50', iconColor: 'text-indigo-500' },
  { key: 'satisfaction', icon: Heart, labelAr: 'مؤشرات الرضا', labelEn: 'Satisfaction', bgColor: 'bg-pink-50/50', borderColor: 'border-pink-200/50', iconColor: 'text-pink-500' },
  { key: 'note', icon: ClipboardList, labelAr: 'ملاحظات', labelEn: 'Notes', bgColor: 'bg-gray-50/50', borderColor: 'border-gray-200/50', iconColor: 'text-gray-500' },
]

// ─── Component ───────────────────────────────────────────────────────────────

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<EditForm>({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    sex: '',
    mrn: '',
  })
  const [activeTab, setActiveTab] = useState<'appointments' | 'info' | 'knowledge'>('knowledge')
  const [newTag, setNewTag] = useState('')
  const [showTagInput, setShowTagInput] = useState(false)

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: patient, isLoading, isError } = useQuery<Patient>({
    queryKey: ['patient', id],
    queryFn: async () => {
      const res = await api.get(`/api/patients/${id}`)
      if (res.data?.error) throw new Error(res.data.error)
      return res.data
    },
    enabled: !!id,
  })

  const { data: knowledge } = useQuery<KnowledgeData>({
    queryKey: ['patient-knowledge', id],
    queryFn: async () => {
      const res = await api.get(`/api/patients/${id}/knowledge`)
      return res.data ?? { memories: {}, insight: null, tags: [] }
    },
    enabled: !!id && activeTab === 'knowledge',
  })

  // ── Mutations ──────────────────────────────────────────────────────────────

  const updateMutation = useMutation({
    mutationFn: (data: Partial<EditForm>) => api.put(`/api/patients/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient', id] })
      queryClient.invalidateQueries({ queryKey: ['patients'] })
      setEditing(false)
      addToast({ type: 'success', title: isAr ? 'تم تحديث بيانات المريض' : 'Patient updated successfully' })
    },
    onError: () => {
      addToast({ type: 'error', title: isAr ? 'فشل تحديث البيانات' : 'Failed to update patient' })
    },
  })

  const addTagMutation = useMutation({
    mutationFn: (tag: string) => api.post(`/api/patients/${id}/tags`, { tag }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-knowledge', id] })
      queryClient.invalidateQueries({ queryKey: ['patient', id] })
      setNewTag('')
      setShowTagInput(false)
    },
  })

  const removeTagMutation = useMutation({
    mutationFn: (tagId: string) => api.delete(`/api/patients/${id}/tags/${tagId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-knowledge', id] })
      queryClient.invalidateQueries({ queryKey: ['patient', id] })
    },
  })

  const rebuildInsightMutation = useMutation({
    mutationFn: () => api.post(`/api/patients/${id}/insights/rebuild`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-knowledge', id] })
      addToast({ type: 'success', title: isAr ? 'تم تحديث الرؤى' : 'Insights rebuilt' })
    },
  })

  // ── Handlers ──────────────────────────────────────────────────────────────

  const startEdit = () => {
    if (!patient) return
    setEditForm({
      firstName: patient.firstName,
      lastName: patient.lastName,
      dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.slice(0, 10) : '',
      sex: patient.sex || '',
      mrn: patient.mrn || '',
    })
    setEditing(true)
  }

  const handleSave = () => {
    updateMutation.mutate({
      firstName: editForm.firstName || undefined,
      lastName: editForm.lastName || undefined,
      dateOfBirth: editForm.dateOfBirth || undefined,
      sex: editForm.sex || undefined,
      mrn: editForm.mrn || undefined,
    })
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  const appointments: Appointment[] = patient?.appointments || []
  const upcomingCount = appointments.filter(a => ['scheduled', 'confirmed'].includes(a.status)).length
  const completedCount = appointments.filter(a => a.status === 'completed').length

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" text={isAr ? 'جاري التحميل...' : 'Loading...'} />
      </div>
    )
  }

  if (isError || !patient) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-12 w-12 text-danger-400" />
        <p className="text-healthcare-muted">{isAr ? 'لم يتم العثور على المريض' : 'Patient not found'}</p>
        <button onClick={() => navigate('/dashboard/patients')} className="btn-outline">
          <ArrowLeft className="h-4 w-4" />
          {isAr ? 'العودة للقائمة' : 'Back to Patients'}
        </button>
      </div>
    )
  }

  const phone = patient.contacts.find(c => c.contactType === 'phone')
  const email = patient.contacts.find(c => c.contactType === 'email')
  const age = calcAge(patient.dateOfBirth)
  const initials = `${patient.firstName.charAt(0)}${patient.lastName.charAt(0)}`.toUpperCase()

  const tabs = [
    { key: 'appointments' as const, label: isAr ? 'المواعيد' : 'Appointments', icon: Calendar, count: appointments.length },
    { key: 'knowledge' as const, label: isAr ? 'قاعدة المعرفة' : 'Knowledge Base', icon: Brain, count: null },
    { key: 'info' as const, label: isAr ? 'معلومات إضافية' : 'Details', icon: User, count: null },
  ]

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Back Button ──────────────────────────────────────────────────── */}
      <div>
        <button
          onClick={() => navigate('/dashboard/patients')}
          className="flex items-center gap-2 text-sm text-healthcare-muted hover:text-healthcare-text transition-colors group"
        >
          <ArrowLeft className={cn('h-4 w-4 transition-transform group-hover:-translate-x-1', isAr && 'rotate-180')} />
          {isAr ? 'العودة لقائمة المرضى' : 'Back to Patients'}
        </button>
      </div>

      {/* ── Patient Header ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-healthcare-border/30 shadow-sm p-6">
        <div className="flex items-start gap-5 flex-wrap">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center flex-shrink-0 shadow-lg">
            <span className="text-white font-bold text-2xl">{initials}</span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            {!editing ? (
              <>
                <div className="flex items-start gap-3 flex-wrap">
                  <div>
                    <h1 className="text-2xl font-bold text-healthcare-text">
                      {patient.firstName} {patient.lastName}
                    </h1>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {patient.mrn && (
                        <span className="flex items-center gap-1 text-sm text-healthcare-muted font-mono">
                          <Hash className="h-3.5 w-3.5" />
                          {patient.mrn}
                        </span>
                      )}
                      {age && (
                        <span className="text-sm text-healthcare-muted">
                          {isAr ? `${age} سنة` : `${age} years old`}
                        </span>
                      )}
                      {patient.sex && (
                        <span className="text-sm text-healthcare-muted capitalize">
                          {patient.sex === 'male' ? (isAr ? 'ذكر' : 'Male') : (isAr ? 'أنثى' : 'Female')}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={startEdit}
                    className="btn-outline ms-auto flex items-center gap-2 text-sm"
                  >
                    <Edit3 className="h-4 w-4" />
                    {isAr ? 'تعديل' : 'Edit'}
                  </button>
                </div>

                {/* Contacts */}
                <div className="flex flex-wrap gap-4 mt-3">
                  {phone && (
                    <a href={`tel:${phone.contactValue}`} className="flex items-center gap-2 text-sm text-primary-600 hover:underline dir-ltr">
                      <Phone className="h-4 w-4" />
                      {phone.contactValue}
                    </a>
                  )}
                  {email && (
                    <a href={`mailto:${email.contactValue}`} className="flex items-center gap-2 text-sm text-primary-600 hover:underline">
                      <Mail className="h-4 w-4" />
                      {email.contactValue}
                    </a>
                  )}
                  <span className="flex items-center gap-2 text-sm text-healthcare-muted">
                    <Calendar className="h-4 w-4" />
                    {isAr ? 'مسجل' : 'Registered'} {formatDate(patient.createdAt)}
                  </span>
                </div>
              </>
            ) : (
              /* ── Edit Form ── */
              <div className="space-y-3 w-full">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="input-label">{isAr ? 'الاسم الأول *' : 'First Name *'}</label>
                    <input
                      type="text"
                      value={editForm.firstName}
                      onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="input-label">{isAr ? 'اسم العائلة *' : 'Last Name *'}</label>
                    <input
                      type="text"
                      value={editForm.lastName}
                      onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))}
                      className="input"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="input-label">{isAr ? 'تاريخ الميلاد' : 'Date of Birth'}</label>
                    <input
                      type="date"
                      value={editForm.dateOfBirth}
                      onChange={e => setEditForm(f => ({ ...f, dateOfBirth: e.target.value }))}
                      className="input dir-ltr"
                      max={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div>
                    <label className="input-label">{isAr ? 'الجنس' : 'Sex'}</label>
                    <select
                      value={editForm.sex}
                      onChange={e => setEditForm(f => ({ ...f, sex: e.target.value }))}
                      className="select"
                    >
                      <option value="">{isAr ? 'اختيار...' : 'Select...'}</option>
                      <option value="male">{isAr ? 'ذكر' : 'Male'}</option>
                      <option value="female">{isAr ? 'أنثى' : 'Female'}</option>
                    </select>
                  </div>
                  <div>
                    <label className="input-label">{isAr ? 'رقم الملف' : 'MRN'}</label>
                    <input
                      type="text"
                      value={editForm.mrn}
                      onChange={e => setEditForm(f => ({ ...f, mrn: e.target.value }))}
                      className="input"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                    className="btn-primary flex items-center gap-2"
                  >
                    <Save className="h-4 w-4" />
                    {updateMutation.isPending ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ التغييرات' : 'Save Changes')}
                  </button>
                  <button onClick={() => setEditing(false)} className="btn-outline flex items-center gap-2">
                    <X className="h-4 w-4" />
                    {isAr ? 'إلغاء' : 'Cancel'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats Row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          icon={Calendar}
          value={appointments.length}
          label={isAr ? 'إجمالي المواعيد' : 'Total Appointments'}
          iconBg="bg-primary-100"
          iconColor="text-primary-600"
        />
        <StatCard
          icon={Clock}
          value={upcomingCount}
          label={isAr ? 'مواعيد قادمة' : 'Upcoming'}
          iconBg="bg-warning-100"
          iconColor="text-warning-600"
        />
        <StatCard
          icon={CheckCircle}
          value={completedCount}
          label={isAr ? 'مكتملة' : 'Completed'}
          iconBg="bg-green-100"
          iconColor="text-green-600"
        />
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-healthcare-border/30 shadow-sm overflow-hidden">
        {/* Tab Bar */}
        <div className="flex border-b border-healthcare-border/30 bg-gray-50/50">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors border-b-2',
                activeTab === tab.key
                  ? 'border-primary-500 text-primary-600 bg-white'
                  : 'border-transparent text-healthcare-muted hover:text-healthcare-text'
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {tab.count !== null && (
                <span className={cn(
                  'px-1.5 py-0.5 rounded-full text-xs font-bold',
                  activeTab === tab.key ? 'bg-primary-100 text-primary-700' : 'bg-gray-200 text-gray-500'
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Appointments Tab ─────────────────────────────────────────── */}
        {activeTab === 'appointments' && (
          <div className="divide-y divide-healthcare-border/20">
            {appointments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-healthcare-muted">
                <ClipboardList className="h-12 w-12 opacity-30" />
                <p>{isAr ? 'لا توجد مواعيد مسجلة' : 'No appointments yet'}</p>
              </div>
            ) : (
              appointments.map(appt => (
                <div key={appt.appointmentId} className="flex items-start gap-4 p-5 hover:bg-gray-50/50 transition-colors">
                  {/* Date bubble */}
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary-50 border border-primary-100 flex flex-col items-center justify-center">
                    <span className="text-xs text-primary-500 font-medium leading-none">
                      {new Date(appt.startTs).toLocaleDateString(isAr ? 'ar-SA' : 'en-US', { month: 'short' })}
                    </span>
                    <span className="text-lg font-bold text-primary-700 leading-none">
                      {new Date(appt.startTs).getDate()}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="font-semibold text-healthcare-text">{appt.service.name}</p>
                        <p className="text-sm text-healthcare-muted mt-0.5">
                          {isAr ? 'مع' : 'with'} {appt.provider.displayName}
                        </p>
                      </div>
                      <Badge variant={getStatusBadgeVariant(appt.status)} dot>
                        {appt.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-healthcare-muted">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatTime(appt.startTs)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Activity className="h-3.5 w-3.5" />
                        {appt.service.durationMin} {isAr ? 'دقيقة' : 'min'}
                      </span>
                      {appt.reason && (
                        <span className="truncate max-w-[200px]" title={appt.reason}>
                          {appt.reason}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Knowledge Base Tab ────────────────────────────────────── */}
        {activeTab === 'knowledge' && (
          <div className="p-6 space-y-6">
            {/* Tags Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-healthcare-text flex items-center gap-2">
                  <Tag className="h-4 w-4 text-primary-500" />
                  {isAr ? 'التصنيفات' : 'Tags'}
                </h3>
                <button
                  onClick={() => setShowTagInput(true)}
                  className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {isAr ? 'إضافة' : 'Add'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(knowledge?.tags || patient?.tags || []).map(tag => (
                  <span
                    key={tag.tagId}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-primary-50 text-primary-700 border border-primary-200"
                  >
                    {tag.tag}
                    <button
                      onClick={() => removeTagMutation.mutate(tag.tagId)}
                      className="hover:text-danger-600 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {showTagInput && (
                  <form
                    onSubmit={e => { e.preventDefault(); if (newTag.trim()) addTagMutation.mutate(newTag.trim()) }}
                    className="inline-flex items-center gap-1"
                  >
                    <input
                      type="text"
                      value={newTag}
                      onChange={e => setNewTag(e.target.value)}
                      placeholder={isAr ? 'اسم التصنيف...' : 'Tag name...'}
                      className="px-2 py-1 text-xs border border-primary-300 rounded-lg focus:ring-1 focus:ring-primary-500 outline-none w-32"
                      autoFocus
                    />
                    <button type="submit" className="text-primary-600 hover:text-primary-700">
                      <CheckCircle className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => { setShowTagInput(false); setNewTag('') }} className="text-gray-400 hover:text-gray-600">
                      <X className="h-4 w-4" />
                    </button>
                  </form>
                )}
                {(knowledge?.tags || patient?.tags || []).length === 0 && !showTagInput && (
                  <span className="text-xs text-healthcare-muted">{isAr ? 'لا توجد تصنيفات' : 'No tags yet'}</span>
                )}
              </div>
            </div>

            {/* Engagement Insights */}
            {(() => {
              const insight = knowledge?.insight || patient?.insight
              return (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-healthcare-text flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-primary-500" />
                      {isAr ? 'الرؤى السلوكية' : 'Behavioral Insights'}
                    </h3>
                    <button
                      onClick={() => rebuildInsightMutation.mutate()}
                      disabled={rebuildInsightMutation.isPending}
                      className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5', rebuildInsightMutation.isPending && 'animate-spin')} />
                      {isAr ? 'تحديث' : 'Refresh'}
                    </button>
                  </div>
                  {insight ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-gradient-to-br from-primary-50 to-primary-100/50 rounded-xl p-4 text-center border border-primary-200/50">
                        <div className={cn(
                          'text-2xl font-bold',
                          insight.engagementScore >= 70 ? 'text-green-600' : insight.engagementScore >= 40 ? 'text-yellow-600' : 'text-red-500'
                        )}>
                          {insight.engagementScore}
                        </div>
                        <div className="text-xs text-healthcare-muted mt-1">{isAr ? 'مؤشر التفاعل' : 'Engagement'}</div>
                      </div>
                      <div className="bg-gradient-to-br from-green-50 to-green-100/50 rounded-xl p-4 text-center border border-green-200/50">
                        <div className="text-2xl font-bold text-green-600">{Math.round(insight.completionRate * 100)}%</div>
                        <div className="text-xs text-healthcare-muted mt-1">{isAr ? 'نسبة الإتمام' : 'Completion'}</div>
                      </div>
                      <div className="bg-gradient-to-br from-yellow-50 to-yellow-100/50 rounded-xl p-4 text-center border border-yellow-200/50">
                        <div className="text-2xl font-bold text-yellow-600">{insight.lifetimeValue}</div>
                        <div className="text-xs text-healthcare-muted mt-1">{isAr ? 'زيارات مكتملة' : 'Lifetime Visits'}</div>
                      </div>
                      <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-xl p-4 text-center border border-purple-200/50">
                        <div className="text-2xl font-bold text-purple-600">{insight.totalConversations}</div>
                        <div className="text-xs text-healthcare-muted mt-1">{isAr ? 'محادثات' : 'Conversations'}</div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-healthcare-muted">{isAr ? 'لا توجد رؤى بعد — اضغط تحديث' : 'No insights yet — click Refresh'}</p>
                  )}
                  {insight && (
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-healthcare-muted">
                      {insight.preferredTimeSlot && (
                        <span className="flex items-center gap-1 bg-gray-100 px-2.5 py-1 rounded-full">
                          <Clock className="h-3 w-3" />
                          {isAr
                            ? insight.preferredTimeSlot === 'morning' ? 'يفضل الصباح' : insight.preferredTimeSlot === 'afternoon' ? 'يفضل الظهر' : 'يفضل المساء'
                            : `Prefers ${insight.preferredTimeSlot}`
                          }
                        </span>
                      )}
                      {insight.channelPreference && (
                        <span className="flex items-center gap-1 bg-gray-100 px-2.5 py-1 rounded-full">
                          <MessageCircle className="h-3 w-3" />
                          {isAr ? `يفضل ${insight.channelPreference}` : `Prefers ${insight.channelPreference}`}
                        </span>
                      )}
                      {insight.noShowCount > 0 && (
                        <span className="flex items-center gap-1 bg-red-50 text-red-600 px-2.5 py-1 rounded-full">
                          <AlertCircle className="h-3 w-3" />
                          {insight.noShowCount} {isAr ? 'عدم حضور' : 'no-shows'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Memories by Category */}
            <div>
              <h3 className="text-sm font-semibold text-healthcare-text flex items-center gap-2 mb-3">
                <Brain className="h-4 w-4 text-primary-500" />
                {isAr ? 'ذاكرة المريض' : 'Patient Memory'}
              </h3>
              {knowledge?.memories && Object.keys(knowledge.memories).length > 0 ? (
                <div className="space-y-3">
                  {MEMORY_CATEGORIES.map(cat => {
                    const items = knowledge.memories[cat.key]
                    if (!items || items.length === 0) return null
                    return (
                      <div key={cat.key} className={cn('rounded-xl border p-4', cat.borderColor, cat.bgColor)}>
                        <div className="flex items-center gap-2 mb-2">
                          <cat.icon className={cn('h-4 w-4', cat.iconColor)} />
                          <span className="text-sm font-medium text-healthcare-text">{isAr ? cat.labelAr : cat.labelEn}</span>
                          <span className="text-xs text-healthcare-muted">({items.length})</span>
                        </div>
                        <div className="space-y-1.5">
                          {items.map(mem => (
                            <div key={mem.memoryId} className="flex items-start gap-2 text-sm">
                              <span className="text-healthcare-text">{mem.memoryValue}</span>
                              {mem.confidence < 0.9 && (
                                <span className="text-[10px] text-healthcare-muted bg-white/50 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                  {Math.round(mem.confidence * 100)}%
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-healthcare-muted">{isAr ? 'لا توجد ذكريات مسجلة بعد' : 'No memories recorded yet'}</p>
              )}
            </div>
          </div>
        )}

        {/* ── Info Tab ─────────────────────────────────────────────────── */}
        {activeTab === 'info' && (
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <InfoRow label={isAr ? 'الاسم الكامل' : 'Full Name'} value={`${patient.firstName} ${patient.lastName}`} />
            <InfoRow label={isAr ? 'رقم الملف الطبي' : 'MRN'} value={patient.mrn || '—'} mono />
            <InfoRow label={isAr ? 'تاريخ الميلاد' : 'Date of Birth'} value={patient.dateOfBirth ? formatDate(patient.dateOfBirth) : '—'} />
            <InfoRow label={isAr ? 'العمر' : 'Age'} value={age ? (isAr ? `${age} سنة` : `${age} years`) : '—'} />
            <InfoRow
              label={isAr ? 'الجنس' : 'Sex'}
              value={patient.sex ? (patient.sex === 'male' ? (isAr ? 'ذكر' : 'Male') : (isAr ? 'أنثى' : 'Female')) : '—'}
            />
            <InfoRow label={isAr ? 'تاريخ التسجيل' : 'Registered'} value={formatDate(patient.createdAt)} />
            {phone && <InfoRow label={isAr ? 'الهاتف' : 'Phone'} value={phone.contactValue} mono />}
            {email && <InfoRow label={isAr ? 'البريد الإلكتروني' : 'Email'} value={email.contactValue} />}
            <InfoRow label={isAr ? 'معرف المريض' : 'Patient ID'} value={patient.patientId} mono />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Helper Component ─────────────────────────────────────────────────────────

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-healthcare-muted uppercase tracking-wide">{label}</p>
      <p className={cn('text-sm text-healthcare-text', mono && 'font-mono')}>{value}</p>
    </div>
  )
}
