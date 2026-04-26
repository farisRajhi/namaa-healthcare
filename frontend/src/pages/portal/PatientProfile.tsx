import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePatientAuth, patientApi } from '../../context/PatientAuthContext'
import { User, Phone, Mail, Calendar, Edit3, Check, X } from 'lucide-react'

export default function PatientProfile() {
  const { t } = useTranslation()
  const { patient, refreshProfile } = usePatientAuth()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [firstName, setFirstName] = useState(patient?.firstName || '')
  const [lastName, setLastName] = useState(patient?.lastName || '')
  const [email, setEmail] = useState(
    patient?.contacts.find((c) => c.type === 'email')?.value || ''
  )
  const [phone, setPhone] = useState(
    patient?.contacts.find((c) => c.type === 'phone')?.value || ''
  )

  if (!patient) return null

  const handleSave = async () => {
    setSaving(true)
    try {
      const api = patientApi()
      await api.put('/api/patient-portal/profile', {
        firstName,
        lastName,
        email: email || undefined,
        phone: phone || undefined,
      })
      await refreshProfile()
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setFirstName(patient.firstName)
    setLastName(patient.lastName)
    setEmail(patient.contacts.find((c) => c.type === 'email')?.value || '')
    setPhone(patient.contacts.find((c) => c.type === 'phone')?.value || '')
    setEditing(false)
  }

  const preferences = patient.memories.filter((m) => m.type === 'preference')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">{t('portal.profile.title')}</h2>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-xs text-primary-600 font-medium bg-primary-50 px-3 py-1.5 rounded-lg"
          >
            <Edit3 className="w-3.5 h-3.5" />
            {t('portal.profile.edit')}
          </button>
        )}
      </div>

      {saved && (
        <div className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 px-4 py-2.5 rounded-xl">
          <Check className="w-3.5 h-3.5" />
          {t('portal.profile.saved')}
        </div>
      )}

      {/* Personal Info */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-100">
          <p className="text-xs font-bold text-slate-600">{t('portal.profile.personalInfo')}</p>
        </div>
        <div className="p-4 space-y-4">
          {editing ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">{t('portal.profile.firstName')}</label>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="off"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">{t('portal.profile.lastName')}</label>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoComplete="off"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">{t('portal.profile.phone')}</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  dir="ltr"
                  autoComplete="off"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-left focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">{t('portal.profile.email')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  dir="ltr"
                  autoComplete="off"
                  placeholder="example@email.com"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-left focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1 text-xs text-white bg-primary-500 px-4 py-2 rounded-lg font-medium disabled:opacity-60"
                >
                  {saving ? (
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  {t('portal.profile.save')}
                </button>
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-1 text-xs text-slate-500 px-3 py-2 rounded-lg border border-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                  {t('portal.profile.cancel')}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
                  <User className="w-6 h-6 text-primary-600" />
                </div>
                <div>
                  <p className="font-medium text-slate-800">
                    {patient.firstName} {patient.lastName}
                  </p>
                  {patient.mrn && (
                    <p className="text-[10px] text-slate-400">MRN: {patient.mrn}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2 pt-2">
                {patient.contacts
                  .filter((c) => c.type === 'phone')
                  .map((c) => (
                    <div key={c.contactId} className="flex items-center gap-2 text-sm text-slate-600">
                      <Phone className="w-4 h-4 text-slate-400" />
                      <span dir="ltr">{c.value}</span>
                      {c.isPrimary && (
                        <span className="text-[9px] bg-primary-50 text-primary-600 px-1.5 py-0.5 rounded">{t('portal.profile.primary')}</span>
                      )}
                    </div>
                  ))}

                {patient.contacts
                  .filter((c) => c.type === 'email')
                  .map((c) => (
                    <div key={c.contactId} className="flex items-center gap-2 text-sm text-slate-600">
                      <Mail className="w-4 h-4 text-slate-400" />
                      <span dir="ltr">{c.value}</span>
                    </div>
                  ))}

                {patient.dateOfBirth && (
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span dir="ltr">{patient.dateOfBirth}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Preferences */}
      {preferences.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-600">{t('portal.profile.preferences')}</p>
          </div>
          <div className="p-4">
            <div className="space-y-2">
              {preferences.map((p) => (
                <div key={p.key} className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{p.key}</span>
                  <span className="text-slate-700 font-medium">{p.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
