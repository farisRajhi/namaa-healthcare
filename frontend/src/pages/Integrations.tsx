import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import {
  Plug,
  Plus,
  X,
  CheckCircle,
  XCircle,
  Webhook,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react'
import { cn, formatDateTime } from '../lib/utils'

interface Integration {
  integrationId: string
  type: 'emr' | 'crm' | 'phone' | 'payment' | 'calendar' | 'custom'
  provider: string
  status: 'connected' | 'disconnected' | 'error'
  lastSync: string | null
  config: Record<string, any>
}

interface WebhookSubscription {
  webhookId: string
  event: string
  url: string
  secret: string
  isActive: boolean
  lastTriggered: string | null
  failureCount: number
}

const typeLabels: Record<string, { ar: string; en: string; icon: string }> = {
  emr: { ar: 'سجل طبي إلكتروني', en: 'EMR', icon: '🏥' },
  crm: { ar: 'إدارة علاقات العملاء', en: 'CRM', icon: '📇' },
  phone: { ar: 'نظام الاتصالات', en: 'Phone System', icon: '📞' },
  payment: { ar: 'نظام الدفع', en: 'Payment', icon: '💳' },
  calendar: { ar: 'التقويم', en: 'Calendar', icon: '📅' },
  custom: { ar: 'مخصص', en: 'Custom', icon: '⚙️' },
}

const statusConfig: Record<string, { ar: string; en: string; color: string; icon: React.ElementType }> = {
  connected: { ar: 'متصل', en: 'Connected', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  disconnected: { ar: 'غير متصل', en: 'Disconnected', color: 'bg-primary-50/50 text-gray-800', icon: XCircle },
  error: { ar: 'خطأ', en: 'Error', color: 'bg-red-100 text-red-800', icon: XCircle },
}

const webhookEvents = [
  'appointment.created', 'appointment.cancelled', 'appointment.completed',
  'patient.created', 'call.completed', 'call.escalated',
  'prescription.refill_requested', 'campaign.completed',
]

// Mock data store (no backend integration routes exist yet)
let mockIntegrations: Integration[] = []
let mockWebhooks: WebhookSubscription[] = []

export default function Integrations() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const queryClient = useQueryClient()

  const [showAddIntegration, setShowAddIntegration] = useState(false)
  const [showAddWebhook, setShowAddWebhook] = useState(false)
  const [activeTab, setActiveTab] = useState<'integrations' | 'webhooks'>('integrations')

  const [integrationForm, setIntegrationForm] = useState({
    type: 'emr' as Integration['type'],
    provider: '',
    apiUrl: '',
    apiKey: '',
  })

  const [webhookForm, setWebhookForm] = useState({
    event: webhookEvents[0],
    url: '',
    secret: '',
  })

  // No backend endpoint — use local mock data
  const { data: integrations } = useQuery<Integration[]>({
    queryKey: ['integrations'],
    queryFn: async () => {
      try {
        const res = await api.get('/api/integrations')
        return res.data?.data || []
      } catch {
        // No backend route — return mock data
        return mockIntegrations
      }
    },
    placeholderData: [],
  })

  const { data: webhooks } = useQuery<WebhookSubscription[]>({
    queryKey: ['webhooks'],
    queryFn: async () => {
      try {
        const res = await api.get('/api/integrations/webhooks')
        return res.data?.data || []
      } catch {
        // No backend route — return mock data
        return mockWebhooks
      }
    },
    placeholderData: [],
  })

  const addIntegrationMutation = useMutation({
    mutationFn: async (data: typeof integrationForm) => {
      try {
        return await api.post('/api/integrations', data)
      } catch {
        // Mock: add locally
        const newIntegration: Integration = {
          integrationId: `int-${Date.now()}`,
          type: data.type,
          provider: data.provider,
          status: 'disconnected',
          lastSync: null,
          config: { apiUrl: data.apiUrl },
        }
        mockIntegrations = [...mockIntegrations, newIntegration]
        return { data: newIntegration }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      setShowAddIntegration(false)
      setIntegrationForm({ type: 'emr', provider: '', apiUrl: '', apiKey: '' })
    },
  })

  const deleteIntegrationMutation = useMutation({
    mutationFn: async (id: string) => {
      try {
        return await api.delete(`/api/integrations/${id}`)
      } catch {
        mockIntegrations = mockIntegrations.filter(i => i.integrationId !== id)
        return { success: true }
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  })

  const addWebhookMutation = useMutation({
    mutationFn: async (data: typeof webhookForm) => {
      try {
        return await api.post('/api/integrations/webhooks', data)
      } catch {
        const newWebhook: WebhookSubscription = {
          webhookId: `wh-${Date.now()}`,
          event: data.event,
          url: data.url,
          secret: data.secret,
          isActive: true,
          lastTriggered: null,
          failureCount: 0,
        }
        mockWebhooks = [...mockWebhooks, newWebhook]
        return { data: newWebhook }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] })
      setShowAddWebhook(false)
      setWebhookForm({ event: webhookEvents[0], url: '', secret: '' })
    },
  })

  const deleteWebhookMutation = useMutation({
    mutationFn: async (id: string) => {
      try {
        return await api.delete(`/api/integrations/webhooks/${id}`)
      } catch {
        mockWebhooks = mockWebhooks.filter(w => w.webhookId !== id)
        return { success: true }
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhooks'] }),
  })

  const testWebhookMutation = useMutation({
    mutationFn: async (id: string) => {
      try {
        return await api.post(`/api/integrations/webhooks/${id}/test`)
      } catch {
        // Mock test — just show success
        return { success: true, message: 'Test webhook sent (mock)' }
      }
    },
  })

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">
            {isAr ? 'التكاملات' : 'Integrations'}
          </h1>
          <p className="text-healthcare-muted">
            {isAr ? 'إدارة التكاملات الخارجية والويب هوك' : 'Manage external integrations and webhooks'}
          </p>
        </div>
        {activeTab === 'integrations' ? (
          <button
            onClick={() => setShowAddIntegration(true)}
            className="btn-primary"
          >
            <Plus className="h-5 w-5" />
            {isAr ? 'إضافة تكامل' : 'Add Integration'}
          </button>
        ) : (
          <button
            onClick={() => setShowAddWebhook(true)}
            className="btn-primary"
          >
            <Plus className="h-5 w-5" />
            {isAr ? 'إضافة ويب هوك' : 'Add Webhook'}
          </button>
        )}
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
        {isAr
          ? 'ملاحظة: نظام التكاملات قيد التطوير. البيانات المعروضة محلية.'
          : 'Note: Integration system is under development. Data shown is local only.'}
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab('integrations')}
          className={cn(
            'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'integrations'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          <div className="flex items-center gap-2">
            <Plug className="h-4 w-4" />
            {isAr ? 'التكاملات' : 'Integrations'}
          </div>
        </button>
        <button
          onClick={() => setActiveTab('webhooks')}
          className={cn(
            'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'webhooks'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          <div className="flex items-center gap-2">
            <Webhook className="h-4 w-4" />
            {isAr ? 'الويب هوك' : 'Webhooks'}
            {(webhooks || []).length > 0 && (
              <span className="px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded-full text-xs">
                {(webhooks || []).length}
              </span>
            )}
          </div>
        </button>
      </div>

      {activeTab === 'integrations' ? (
        (integrations || []).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 bg-white rounded-xl border">
            <Plug className="h-12 w-12 mb-3 text-gray-300" />
            <p>{isAr ? 'لا توجد تكاملات مُعدّة' : 'No integrations configured'}</p>
            <button
              onClick={() => setShowAddIntegration(true)}
              className="mt-3 text-primary-600 hover:underline text-sm"
            >
              {isAr ? 'أضف أول تكامل' : 'Add your first integration'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(integrations || []).map((integration) => {
              const typeLabel = typeLabels[integration.type] || typeLabels.custom
              const status = statusConfig[integration.status] || statusConfig.disconnected
              const StatusIcon = status.icon
              return (
                <div key={integration.integrationId} className="table-container p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{typeLabel.icon}</span>
                      <div>
                        <h3 className="font-semibold text-healthcare-text">{integration.provider}</h3>
                        <p className="text-sm page-subtitle">{isAr ? typeLabel.ar : typeLabel.en}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteIntegrationMutation.mutate(integration.integrationId)}
                      className="p-1.5 hover:bg-red-50 rounded-lg text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={cn('flex items-center gap-1 px-2 py-1 rounded text-xs font-medium', status.color)}>
                      <StatusIcon className="h-3 w-3" />
                      {isAr ? status.ar : status.en}
                    </span>
                    {integration.lastSync && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <RefreshCw className="h-3 w-3" />
                        {formatDateTime(integration.lastSync)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : (
        (webhooks || []).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 bg-white rounded-xl border">
            <Webhook className="h-12 w-12 mb-3 text-gray-300" />
            <p>{isAr ? 'لا يوجد ويب هوك مُعد' : 'No webhooks configured'}</p>
          </div>
        ) : (
          <div className="table-container overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-healthcare-bg">
                  <tr>
                    <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{isAr ? 'الحدث' : 'Event'}</th>
                    <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{isAr ? 'الرابط' : 'URL'}</th>
                    <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{isAr ? 'الحالة' : 'Status'}</th>
                    <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{isAr ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(webhooks || []).map((wh) => (
                    <tr key={wh.webhookId} className="hover:bg-healthcare-bg">
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-sm font-mono">
                          {wh.event}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-700 font-mono truncate block max-w-xs" dir="ltr">
                          {wh.url}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          'px-2 py-1 rounded text-xs font-medium',
                          wh.isActive ? 'bg-green-100 text-green-800' : 'bg-primary-50/50 text-gray-800'
                        )}>
                          {wh.isActive ? (isAr ? 'نشط' : 'Active') : (isAr ? 'معطّل' : 'Inactive')}
                        </span>
                        {wh.failureCount > 0 && (
                          <span className="ms-2 px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
                            {wh.failureCount} {isAr ? 'أخطاء' : 'failures'}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => testWebhookMutation.mutate(wh.webhookId)}
                            disabled={testWebhookMutation.isPending}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                          >
                            <Send className="h-3 w-3" />
                            {isAr ? 'اختبار' : 'Test'}
                          </button>
                          <button
                            onClick={() => deleteWebhookMutation.mutate(wh.webhookId)}
                            className="p-1 hover:bg-red-50 rounded text-red-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Add Integration Modal */}
      {showAddIntegration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-heading font-semibold text-healthcare-text">{isAr ? 'إضافة تكامل جديد' : 'Add Integration'}</h2>
              <button onClick={() => setShowAddIntegration(false)} className="p-1 hover:bg-primary-50 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); addIntegrationMutation.mutate(integrationForm) }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isAr ? 'النوع' : 'Type'}</label>
                <select
                  value={integrationForm.type}
                  onChange={(e) => setIntegrationForm({ ...integrationForm, type: e.target.value as any })}
                  className="input focus:ring-primary-400/20 focus:border-primary-500"
                >
                  {Object.entries(typeLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label.icon} {isAr ? label.ar : label.en}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isAr ? 'المزوّد' : 'Provider'}</label>
                <input
                  type="text"
                  value={integrationForm.provider}
                  onChange={(e) => setIntegrationForm({ ...integrationForm, provider: e.target.value })}
                  placeholder={isAr ? 'مثال: Epic, Salesforce' : 'e.g., Epic, Salesforce'}
                  className="input focus:ring-primary-400/20 focus:border-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isAr ? 'رابط API' : 'API URL'}</label>
                <input
                  type="url"
                  dir="ltr"
                  value={integrationForm.apiUrl}
                  onChange={(e) => setIntegrationForm({ ...integrationForm, apiUrl: e.target.value })}
                  className="input focus:ring-primary-400/20 focus:border-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isAr ? 'مفتاح API' : 'API Key'}</label>
                <input
                  type="password"
                  dir="ltr"
                  value={integrationForm.apiKey}
                  onChange={(e) => setIntegrationForm({ ...integrationForm, apiKey: e.target.value })}
                  className="input focus:ring-primary-400/20 focus:border-primary-500"
                  required
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={addIntegrationMutation.isPending}
                  className="flex-1 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {addIntegrationMutation.isPending ? (isAr ? 'جاري الإضافة...' : 'Adding...') : (isAr ? 'إضافة' : 'Add')}
                </button>
                <button type="button" onClick={() => setShowAddIntegration(false)} className="px-4 py-2 border rounded-lg hover:bg-healthcare-bg">
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Webhook Modal */}
      {showAddWebhook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-heading font-semibold text-healthcare-text">{isAr ? 'إضافة ويب هوك' : 'Add Webhook'}</h2>
              <button onClick={() => setShowAddWebhook(false)} className="p-1 hover:bg-primary-50 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); addWebhookMutation.mutate(webhookForm) }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isAr ? 'الحدث' : 'Event'}</label>
                <select
                  value={webhookForm.event}
                  onChange={(e) => setWebhookForm({ ...webhookForm, event: e.target.value })}
                  className="input focus:ring-primary-400/20 focus:border-primary-500"
                >
                  {webhookEvents.map((ev) => (
                    <option key={ev} value={ev}>{ev}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isAr ? 'الرابط' : 'URL'}</label>
                <input
                  type="url"
                  dir="ltr"
                  value={webhookForm.url}
                  onChange={(e) => setWebhookForm({ ...webhookForm, url: e.target.value })}
                  placeholder="https://example.com/webhook"
                  className="input focus:ring-primary-400/20 focus:border-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{isAr ? 'المفتاح السري' : 'Secret'}</label>
                <input
                  type="text"
                  dir="ltr"
                  value={webhookForm.secret}
                  onChange={(e) => setWebhookForm({ ...webhookForm, secret: e.target.value })}
                  className="input focus:ring-primary-400/20 focus:border-primary-500"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={addWebhookMutation.isPending}
                  className="flex-1 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {addWebhookMutation.isPending ? (isAr ? 'جاري الإضافة...' : 'Adding...') : (isAr ? 'إضافة' : 'Add')}
                </button>
                <button type="button" onClick={() => setShowAddWebhook(false)} className="px-4 py-2 border rounded-lg hover:bg-healthcare-bg">
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
