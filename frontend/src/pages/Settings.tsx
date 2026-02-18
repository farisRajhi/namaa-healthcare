import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { Building, Globe, Bell, Webhook, Languages, Save, CheckCircle, User } from 'lucide-react'
import LoadingSpinner from '../components/ui/LoadingSpinner'

export default function Settings() {
  const { user } = useAuth()
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const queryClient = useQueryClient()

  const [orgName, setOrgName] = useState('')
  const [timezone, setTimezone] = useState('Asia/Riyadh')
  const [profileName, setProfileName] = useState('')
  const [profileNameAr, setProfileNameAr] = useState('')
  const [newBookingAlerts, setNewBookingAlerts] = useState(true)
  const [negativeFeedbackAlerts, setNegativeFeedbackAlerts] = useState(true)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const changeLanguage = (lng: string) => i18n.changeLanguage(lng)

  // Fetch current settings
  const { data: settingsData, isLoading } = useQuery({
    queryKey: ['settings-all'],
    queryFn: async () => (await api.get('/api/settings/all')).data,
  })

  const { data: notifData } = useQuery({
    queryKey: ['settings-notifications'],
    queryFn: async () => (await api.get('/api/settings/notifications')).data,
  })

  // Populate form when data loads
  useEffect(() => {
    if (settingsData?.data) {
      setOrgName(settingsData.data.org?.name || '')
      setTimezone(settingsData.data.org?.defaultTimezone || 'Asia/Riyadh')
      setProfileName(settingsData.data.user?.name || '')
      setProfileNameAr(settingsData.data.user?.nameAr || '')
    }
  }, [settingsData])

  useEffect(() => {
    if (notifData?.data) {
      setNewBookingAlerts(notifData.data.newBookingAlerts ?? true)
      setNegativeFeedbackAlerts(notifData.data.negativeFeedbackAlerts ?? true)
    }
  }, [notifData])

  // Save mutations
  const saveOrgMutation = useMutation({
    mutationFn: () => api.put('/api/settings/org', { name: orgName, defaultTimezone: timezone }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings-all'] }),
  })

  const saveProfileMutation = useMutation({
    mutationFn: () => api.put('/api/settings/profile', { name: profileName, nameAr: profileNameAr || undefined }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings-all'] }),
  })

  const saveNotifMutation = useMutation({
    mutationFn: () => api.put('/api/settings/notifications', { newBookingAlerts, negativeFeedbackAlerts }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings-notifications'] }),
  })

  const handleSaveAll = async () => {
    try {
      await Promise.all([
        saveOrgMutation.mutateAsync(),
        saveProfileMutation.mutateAsync(),
        saveNotifMutation.mutateAsync(),
      ])
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch {
      // errors handled by individual mutations
    }
  }

  const isSaving = saveOrgMutation.isPending || saveProfileMutation.isPending || saveNotifMutation.isPending

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" text={isAr ? 'جاري التحميل...' : 'Loading...'} />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('settings.title')}</h1>
          <p className="page-subtitle">{t('settings.subtitle')}</p>
        </div>
        {saveSuccess && (
          <div className="flex items-center gap-2 px-4 py-2 bg-success-50 text-success-700 rounded-xl text-sm font-medium animate-fade-in">
            <CheckCircle className="h-4 w-4" />
            {isAr ? 'تم الحفظ بنجاح' : 'Settings saved successfully'}
          </div>
        )}
      </div>

      <div className="grid gap-6">
        {/* Language */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
              <Languages className="h-5 w-5 text-primary-500" />
            </div>
            <h2 className="text-lg font-heading font-semibold text-healthcare-text">{t('settings.language.title')}</h2>
          </div>
          <div>
            <label className="input-label">{t('settings.language.select')}</label>
            <select value={i18n.language} onChange={(e) => changeLanguage(e.target.value)} className="select max-w-xs">
              <option value="en">{t('settings.language.english')}</option>
              <option value="ar">{t('settings.language.arabic')}</option>
            </select>
          </div>
        </div>

        {/* Organization */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-success-50 flex items-center justify-center">
              <Building className="h-5 w-5 text-success-500" />
            </div>
            <h2 className="text-lg font-heading font-semibold text-healthcare-text">{t('settings.organization.title')}</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="input-label">{t('settings.organization.name')}</label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="input max-w-md"
              />
            </div>
            <div>
              <label className="input-label">{t('settings.organization.timezone')}</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="select max-w-md"
              >
                <option value="Asia/Riyadh">Asia/Riyadh (GMT+3)</option>
                <option value="Asia/Dubai">Asia/Dubai (GMT+4)</option>
                <option value="Asia/Kuwait">Asia/Kuwait (GMT+3)</option>
                <option value="Africa/Cairo">Africa/Cairo (GMT+2)</option>
                <option value="UTC">UTC (GMT+0)</option>
              </select>
            </div>
          </div>
        </div>

        {/* User Profile */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
              <User className="h-5 w-5 text-primary-500" />
            </div>
            <h2 className="text-lg font-heading font-semibold text-healthcare-text">{isAr ? 'الملف الشخصي' : 'Profile'}</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="input-label">{isAr ? 'البريد الإلكتروني' : 'Email'}</label>
              <input type="text" value={user?.email || ''} readOnly className="input max-w-md bg-primary-50/30" />
            </div>
            <div>
              <label className="input-label">{isAr ? 'الاسم (English)' : 'Name (English)'}</label>
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="input max-w-md"
                placeholder={isAr ? 'الاسم بالإنجليزية' : 'Your name'}
              />
            </div>
            <div>
              <label className="input-label">{isAr ? 'الاسم (العربية)' : 'Name (Arabic)'}</label>
              <input
                type="text"
                value={profileNameAr}
                onChange={(e) => setProfileNameAr(e.target.value)}
                className="input max-w-md"
                placeholder={isAr ? 'الاسم بالعربية' : 'Name in Arabic'}
              />
            </div>
          </div>
        </div>

        {/* n8n Webhook */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-secondary-100 flex items-center justify-center">
              <Webhook className="h-5 w-5 text-secondary-600" />
            </div>
            <h2 className="text-lg font-heading font-semibold text-healthcare-text">{t('settings.n8n.title')}</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="input-label">{t('settings.n8n.apiKey')}</label>
              <div className="flex gap-2 max-w-md">
                <input type="password" defaultValue="••••••••••••••••" readOnly className="input bg-primary-50/30" />
                <button className="btn-outline flex-shrink-0">{t('settings.n8n.regenerate')}</button>
              </div>
              <p className="input-hint">{t('settings.n8n.apiKeyHint')}</p>
            </div>
            <div>
              <label className="input-label">{t('settings.n8n.endpoints')}</label>
              <div className="space-y-2 max-w-md">
                {['POST /api/webhooks/availability', 'POST /api/webhooks/book', 'POST /api/webhooks/patient'].map((ep) => (
                  <div key={ep} className="p-3 bg-primary-50/50 rounded-lg font-mono text-xs text-primary-700 border border-primary-200/30">
                    {ep}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* WhatsApp */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-success-50 flex items-center justify-center">
              <Globe className="h-5 w-5 text-success-500" />
            </div>
            <h2 className="text-lg font-heading font-semibold text-healthcare-text">{t('settings.whatsapp.title')}</h2>
          </div>
          <div className="space-y-4">
            <div className="p-4 bg-warning-50 border border-warning-200/50 rounded-xl">
              <p className="text-sm text-warning-800">{t('settings.whatsapp.notice')}</p>
            </div>
            <div>
              <label className="input-label">{t('settings.whatsapp.phoneNumber')}</label>
              <input type="text" placeholder="+966 XX XXX XXXX" className="input max-w-xs dir-ltr" />
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-warning-50 flex items-center justify-center">
              <Bell className="h-5 w-5 text-warning-500" />
            </div>
            <h2 className="text-lg font-heading font-semibold text-healthcare-text">{t('settings.notifications.title')}</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-primary-50/30 rounded-xl">
              <div>
                <p className="font-medium text-healthcare-text text-sm">{t('settings.notifications.newBooking')}</p>
                <p className="text-xs text-healthcare-muted mt-0.5">{t('settings.notifications.newBookingDesc')}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={newBookingAlerts} onChange={(e) => setNewBookingAlerts(e.target.checked)} className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-[3px] peer-focus:ring-primary-400/30 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
              </label>
            </div>
            <div className="flex items-center justify-between p-4 bg-primary-50/30 rounded-xl">
              <div>
                <p className="font-medium text-healthcare-text text-sm">{t('settings.notifications.negativeFeedback')}</p>
                <p className="text-xs text-healthcare-muted mt-0.5">{t('settings.notifications.negativeFeedbackDesc')}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={negativeFeedbackAlerts} onChange={(e) => setNegativeFeedbackAlerts(e.target.checked)} className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-[3px] peer-focus:ring-primary-400/30 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex justify-end">
          <button onClick={handleSaveAll} disabled={isSaving} className="btn-primary">
            {isSaving ? <LoadingSpinner size="sm" /> : <Save className="h-4 w-4" />}
            {isSaving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
