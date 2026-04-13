import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { Building, Bell, Languages, Save, CheckCircle, User, WifiOff, QrCode, Power, Smartphone, AlertCircle } from 'lucide-react'
import LoadingSpinner from '../components/ui/LoadingSpinner'

function WhatsAppConnectionCard() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const isAr = i18n.language === 'ar'

  // Track whether the user actively initiated a connect
  const [userInitiatedConnect, setUserInitiatedConnect] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Determine poll interval based on state
  const needsFastPoll = userInitiatedConnect

  // Main status query — polls fast when connecting, slow otherwise
  const { data: statusData } = useQuery({
    queryKey: ['baileys-status'],
    queryFn: async () => {
      const res = await api.get('/api/baileys-whatsapp/status')
      return res.data
    },
    refetchInterval: needsFastPoll ? 2000 : 30000,
    retry: 2,
  })

  const status: string = statusData?.status || 'disconnected'
  const isConnected = status === 'connected'
  const isQr = status === 'qr'
  const isConnecting = status === 'connecting'
  const phone = statusData?.phone
  const name = statusData?.name
  const qr = statusData?.qrDataUrl || null

  // Stop fast-polling once connected
  useEffect(() => {
    if (isConnected && userInitiatedConnect) {
      setUserInitiatedConnect(false)
      setError(null)
    }
  }, [isConnected, userInitiatedConnect])

  // Connect mutation
  const connectMutation = useMutation({
    mutationFn: async () => {
      setError(null)
      const res = await api.post('/api/baileys-whatsapp/connect')
      return res.data
    },
    onSuccess: () => {
      setUserInitiatedConnect(true)
      queryClient.invalidateQueries({ queryKey: ['baileys-status'] })
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || (isAr ? 'فشل الاتصال' : 'Connection failed'))
      setUserInitiatedConnect(false)
    },
  })

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/baileys-whatsapp/disconnect')
      return res.data
    },
    onSuccess: () => {
      setUserInitiatedConnect(false)
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['baileys-status'] })
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || (isAr ? 'فشل قطع الاتصال' : 'Disconnect failed'))
    },
  })

  // AI auto-reply toggle
  const { data: aiReplyData } = useQuery({
    queryKey: ['ai-auto-reply'],
    queryFn: async () => {
      const res = await api.get('/api/settings/ai-auto-reply')
      return res.data
    },
    refetchOnWindowFocus: true,
  })

  const aiAutoReply = aiReplyData?.data?.aiAutoReply ?? true

  const toggleAiMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await api.put('/api/settings/ai-auto-reply', { aiAutoReply: enabled })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-auto-reply'] })
    },
  })

  const handleConnect = () => {
    connectMutation.mutate()
  }

  const handleDisconnect = () => {
    if (window.confirm(t('settings.whatsapp.confirmDisconnect'))) {
      disconnectMutation.mutate()
    }
  }

  // Determine what to show
  const showQr = !isConnected && (isQr || (userInitiatedConnect && qr))
  const showLoading = !isConnected && (isConnecting || connectMutation.isPending) && !qr
  const showDisconnected = !isConnected && !showQr && !showLoading && !connectMutation.isPending

  return (
    <div className="card p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
            isConnected ? 'bg-[#25D366]/10' : 'bg-gray-100'
          }`}>
            <svg className={`h-5 w-5 ${isConnected ? 'text-[#25D366]' : 'text-gray-400'}`} viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-heading font-semibold text-healthcare-text">{t('settings.whatsapp.title')}</h2>
            <p className="text-xs text-healthcare-muted">{t('settings.whatsapp.subtitle')}</p>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
          isConnected
            ? 'bg-[#25D366]/10 text-[#25D366]'
            : isConnecting || isQr
              ? 'bg-amber-50 text-amber-600'
              : 'bg-gray-100 text-gray-500'
        }`}>
          {isConnected ? (
            <><div className="w-1.5 h-1.5 rounded-full bg-[#25D366] animate-pulse" /> {t('settings.whatsapp.connected')}</>
          ) : isConnecting || isQr ? (
            <><div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> {t('settings.whatsapp.connecting')}</>
          ) : (
            <><WifiOff className="h-3 w-3" /> {t('settings.whatsapp.disconnected')}</>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200/50 rounded-xl flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Connected state */}
      {isConnected && (
        <div className="space-y-4">
          <div className={`p-4 ${aiAutoReply ? 'bg-[#25D366]/5 border-[#25D366]/20' : 'bg-amber-50/50 border-amber-200/50'} border rounded-xl`}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2 h-2 rounded-full ${aiAutoReply ? 'bg-[#25D366] animate-pulse' : 'bg-amber-500'}`} />
              <p className={`text-sm font-medium ${aiAutoReply ? 'text-[#25D366]' : 'text-amber-600'}`}>
                {aiAutoReply ? t('settings.whatsapp.statusActive') : t('settings.whatsapp.statusActiveNoAi')}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {phone && (
                <div className="p-3 bg-white/60 rounded-lg">
                  <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">{t('settings.whatsapp.linkedPhone')}</p>
                  <p className="text-sm font-semibold text-gray-800 dir-ltr">{phone}</p>
                </div>
              )}
              {name && (
                <div className="p-3 bg-white/60 rounded-lg">
                  <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">{t('settings.whatsapp.linkedName')}</p>
                  <p className="text-sm font-semibold text-gray-800">{name}</p>
                </div>
              )}
            </div>
          </div>
          {/* AI Auto-Reply Toggle */}
          <div className="flex items-center justify-between p-4 bg-primary-50/30 rounded-xl">
            <div>
              <p className="font-medium text-healthcare-text text-sm">{t('settings.whatsapp.aiAutoReply')}</p>
              <p className="text-xs text-healthcare-muted mt-0.5">{t('settings.whatsapp.aiAutoReplyDesc')}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={aiAutoReply}
                onChange={(e) => toggleAiMutation.mutate(e.target.checked)}
                disabled={toggleAiMutation.isPending}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-[3px] peer-focus:ring-primary-400/30 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
            </label>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={disconnectMutation.isPending}
            className="btn-outline text-red-600 border-red-200 hover:bg-red-50 flex items-center gap-2 text-sm"
          >
            {disconnectMutation.isPending ? <LoadingSpinner size="sm" /> : <Power className="h-4 w-4" />}
            {t('settings.whatsapp.disconnect')}
          </button>
        </div>
      )}

      {/* QR Code state */}
      {showQr && (
        <div className="space-y-3">
          <div className="flex flex-col items-center py-2">
            <div className="relative p-4 bg-white rounded-2xl shadow-md border border-gray-100 mb-4">
              {qr ? (
                <img src={qr} alt="WhatsApp QR Code" className="w-56 h-56 sm:w-64 sm:h-64" />
              ) : (
                <div className="w-56 h-56 sm:w-64 sm:h-64 flex items-center justify-center bg-gray-50 rounded-xl">
                  <LoadingSpinner size="lg" />
                </div>
              )}
            </div>
            <div className="text-center max-w-xs">
              <p className="text-sm font-medium text-healthcare-text mb-1">{t('settings.whatsapp.scanPrompt')}</p>
              <div className="flex items-center justify-center gap-2 text-xs text-healthcare-muted">
                <Smartphone className="h-3.5 w-3.5" />
                <p>{t('settings.whatsapp.scanInstructions')}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading / waiting for QR */}
      {showLoading && (
        <div className="flex flex-col items-center py-10">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-gray-100 border-t-[#25D366] animate-spin" />
          </div>
          <p className="text-sm text-healthcare-muted mt-4">{t('settings.whatsapp.waitingQr')}</p>
        </div>
      )}

      {/* Disconnected state */}
      {showDisconnected && (
        <div className="space-y-4">
          <div className="p-4 bg-gray-50/80 border border-gray-200/50 rounded-xl">
            <p className="text-sm text-gray-600">{t('settings.whatsapp.statusInactive')}</p>
          </div>
          <button
            onClick={handleConnect}
            disabled={connectMutation.isPending}
            className="btn-primary flex items-center gap-2 bg-[#25D366] hover:bg-[#20BD5A] border-[#25D366] hover:border-[#20BD5A]"
          >
            {connectMutation.isPending ? <LoadingSpinner size="sm" /> : <QrCode className="h-4 w-4" />}
            {t('settings.whatsapp.connect')}
          </button>
        </div>
      )}
    </div>
  )
}

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

        {/* WhatsApp Baileys Connection */}
        <WhatsAppConnectionCard />

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
