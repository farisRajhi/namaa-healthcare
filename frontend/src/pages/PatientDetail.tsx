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
  Pill,
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

interface Prescription {
  prescriptionId: string
  medication: string
  dosage: string | null
  instructions: string | null
  status: string
  issuedAt: string
  provider?: { displayName: string }
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
  const [activeTab, setActiveTab] = useState<'appointments' | 'prescriptions' | 'info'>('appointments')

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

  const { data: prescriptionsData } = useQuery<{ data: Prescription[] }>({
    queryKey: ['patient-prescriptions', id],
    queryFn: async () => {
      try {
        const res = await api.get(`/api/prescriptions?patientId=${id}&limit=20`)
        return res.data
      } catch {
        return { data: [] }
      }
    },
    enabled: !!id,
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

  const prescriptions: Prescription[] = prescriptionsData?.data || []
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
    { key: 'prescriptions' as const, label: isAr ? 'الوصفات' : 'Prescriptions', icon: Pill, count: prescriptions.length },
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
        <StatCard
          icon={Pill}
          value={prescriptions.length}
          label={isAr ? 'الوصفات' : 'Prescriptions'}
          iconBg="bg-purple-100"
          iconColor="text-purple-600"
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

        {/* ── Prescriptions Tab ────────────────────────────────────────── */}
        {activeTab === 'prescriptions' && (
          <div className="divide-y divide-healthcare-border/20">
            {prescriptions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-healthcare-muted">
                <Pill className="h-12 w-12 opacity-30" />
                <p>{isAr ? 'لا توجد وصفات مسجلة' : 'No prescriptions yet'}</p>
              </div>
            ) : (
              prescriptions.map(rx => (
                <div key={rx.prescriptionId} className="flex items-start gap-4 p-5 hover:bg-gray-50/50 transition-colors">
                  <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                    <Pill className="h-5 w-5 text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="font-semibold text-healthcare-text">{rx.medication}</p>
                        {rx.dosage && (
                          <p className="text-sm text-healthcare-muted mt-0.5">{rx.dosage}</p>
                        )}
                        {rx.instructions && (
                          <p className="text-xs text-healthcare-muted mt-1 italic">{rx.instructions}</p>
                        )}
                      </div>
                      <Badge variant={rx.status === 'active' ? 'success' : rx.status === 'expired' ? 'neutral' : 'info'} dot>
                        {rx.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-healthcare-muted">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(rx.issuedAt)}
                      </span>
                      {rx.provider && (
                        <span>{isAr ? 'من' : 'by'} {rx.provider.displayName}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
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
