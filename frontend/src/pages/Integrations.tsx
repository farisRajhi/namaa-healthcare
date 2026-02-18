import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import {
  Plug,
  Plus,
  CheckCircle,
  XCircle,
  Webhook,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react'
import { cn, formatDateTime } from '../lib/utils'
import Modal from '../components/ui/Modal'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'

interface Integration {
  integrationId: string
  type: string
  provider: string
  isActive: boolean
  lastSyncAt: string | null
  config: Record<string, any>
  createdAt: string
}

interface WebhookSub {
  webhookId: string
  event: string
  url: string
  secret: string
  isActive: boolean
  lastFiredAt: string | null
  failCount: number
  createdAt: string
}

const typeLabels: Record<string, { ar: string; en: string; icon: string }> = {
  emr: { ar: 'سجل طبي إلكتروني', en: 'EMR', icon: '🏥' },
  crm: { ar: 'إدارة علاقات العملاء', en: 'CRM', icon: '📇' },
  phone: { ar: 'نظام الاتصالات', en: 'Phone System', icon: '📞' },
  payment: { ar: 'نظام الدفع', en: 'Payment', icon: '💳' },
  calendar: { ar: 'التقويم', en: 'Calendar', icon: '📅' },
  custom: { ar: 'مخصص', en: 'Custom', icon: '⚙️' },
}

const webhookEvents = [
  'appointment.created', 'appointment.cancelled', 'appointment.completed',
  'patient.created', 'call.completed', 'call.escalated',
  'prescription.refill_requested', 'campaign.completed',
]

export default function Integrations() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const queryClient = useQueryClient()

  const [showAddIntegration, setShowAddIntegration] = useState(false)
  const [showAddWebhook, setShowAddWebhook] = useState(false)
  const [activeTab, setActiveTab] = useState<'integrations' | 'webhooks'>('integrations')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null)

  const [integrationForm, setIntegrationForm] = useState({
    type: 'emr',
    provider: '',
    apiUrl: '',
    apiKey: '',
  })

  const [webhookForm, setWebhookForm] = useState({
    event: webhookEvents[0],
    url: '',
    secret: '',
  })

  // Real API calls
  const { data: integrationsData, isLoading: intLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => (await api.get('/api/integrations')).data,
  })

  const { data: webhooksData, isLoading: whLoading } = useQuery({
    queryKey: ['webhook-subscriptions'],
    queryFn: async () => (await api.get('/api/webhook-subscriptions')).data,
  })

  const integrations: Integration[] = integrationsData?.data || []
  const webhooks: WebhookSub[] = webhooksData?.data || []

  const addIntegrationMutation = useMutation({
    mutationFn: async (data: typeof integrationForm) =>
      api.post('/api/integrations', {
        type: data.type,
        provider: data.provider,
        config: { apiUrl: data.apiUrl, apiKey: data.apiKey },
        isActive: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      setShowAddIntegration(false)
      setIntegrationForm({ type: 'emr', provider: '', apiUrl: '', apiKey: '' })
    },
  })

  const deleteIntegrationMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/integrations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      setDeleteConfirm(null)
    },
  })

  const syncIntegrationMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/integrations/${id}/sync`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  })

  const addWebhookMutation = useMutation({
    mutationFn: async (data: typeof webhookForm) =>
      api.post('/api/webhook-subscriptions', {
        event: data.event,
        url: data.url,
        secret: data.secret || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-subscriptions'] })
      setShowAddWebhook(false)
      setWebhookForm({ event: webhookEvents[0], url: '', secret: '' })
    },
  })

  const deleteWebhookMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/webhook-subscriptions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-subscriptions'] })
      setDeleteConfirm(null)
    },
  })

  const testWebhookMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/api/webhook-subscriptions/${id}/test`)
      return { id, ...res.data }
    },
    onSuccess: (data) => {
      setTestResult({ id: data.id, success: data.success, message: data.message })
      queryClient.invalidateQueries({ queryKey: ['webhook-subscriptions'] })
      setTimeout(() => setTestResult(null), 5000)
    },
    onError: (err: any, id) => {
      setTestResult({ id, success: false, message: err?.response?.data?.message || 'Failed to test webhook' })
      setTimeout(() => setTestResult(null), 5000)
    },
  })

  const isLoading = activeTab === 'integrations' ? intLoading : whLoading

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{isAr ? 'التكاملات' : 'Integrations'}</h1>
          <p className="page-subtitle">
            {isAr ? 'إدارة التكاملات الخارجية والويب هوك' : 'Manage external integrations and webhooks'}
          </p>
        </div>
        {activeTab === 'integrations' ? (
          <button onClick={() => setShowAddIntegration(true)} className="btn-primary">
            <Plus className="h-4 w-4" />
            {isAr ? 'إضافة تكامل' : 'Add Integration'}
          </button>
        ) : (
          <button onClick={() => setShowAddWebhook(true)} className="btn-primary">
            <Plus className="h-4 w-4" />
            {isAr ? 'إضافة ويب هوك' : 'Add Webhook'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-healthcare-border/30">
        <button
          onClick={() => setActiveTab('integrations')}
          className={cn(
            'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'integrations'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-healthcare-muted hover:text-healthcare-text'
          )}
        >
          <Plug className="h-4 w-4" />
          {isAr ? 'التكاملات' : 'Integrations'}
          {integrations.length > 0 && (
            <span className="px-1.5 py-0.5 bg-primary-50 text-primary-600 rounded-full text-xs">{integrations.length}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('webhooks')}
          className={cn(
            'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'webhooks'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-healthcare-muted hover:text-healthcare-text'
          )}
        >
          <Webhook className="h-4 w-4" />
          {isAr ? 'الويب هوك' : 'Webhooks'}
          {webhooks.length > 0 && (
            <span className="px-1.5 py-0.5 bg-primary-50 text-primary-600 rounded-full text-xs">{webhooks.length}</span>
          )}
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64"><LoadingSpinner /></div>
      ) : activeTab === 'integrations' ? (
        integrations.length === 0 ? (
          <EmptyState
            icon={Plug}
            title={isAr ? 'لا توجد تكاملات' : 'No integrations configured'}
            description={isAr ? 'أضف تكاملات مع الأنظمة الخارجية' : 'Connect external systems like EMR, CRM, or payment providers'}
            action={{ label: isAr ? 'إضافة تكامل' : 'Add Integration', onClick: () => setShowAddIntegration(true) }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {integrations.map((integration) => {
              const typeLabel = typeLabels[integration.type] || typeLabels.custom
              return (
                <div key={integration.integrationId} className="card p-5 group">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{typeLabel.icon}</span>
                      <div>
                        <h3 className="font-semibold text-healthcare-text">{integration.provider}</h3>
                        <p className="text-xs text-healthcare-muted">{isAr ? typeLabel.ar : typeLabel.en}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => syncIntegrationMutation.mutate(integration.integrationId)}
                        className="btn-icon btn-ghost p-1.5 min-w-[32px] min-h-[32px] text-primary-500"
                        title={isAr ? 'مزامنة' : 'Sync'}
                      >
                        <RefreshCw className={cn('h-3.5 w-3.5', syncIntegrationMutation.isPending && 'animate-spin')} />
                      </button>
                      {deleteConfirm === integration.integrationId ? (
                        <div className="flex gap-1">
                          <button onClick={() => deleteIntegrationMutation.mutate(integration.integrationId)} className="btn-danger btn-sm px-2 py-1 min-h-0 text-xs">{isAr ? 'نعم' : 'Yes'}</button>
                          <button onClick={() => setDeleteConfirm(null)} className="btn-ghost btn-sm px-2 py-1 min-h-0 text-xs">{isAr ? 'لا' : 'No'}</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(integration.integrationId)}
                          className="btn-icon btn-ghost p-1.5 min-w-[32px] min-h-[32px] hover:text-danger-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      'flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium',
                      integration.isActive ? 'bg-success-50 text-success-700' : 'bg-primary-50/50 text-healthcare-muted'
                    )}>
                      {integration.isActive ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {integration.isActive ? (isAr ? 'نشط' : 'Active') : (isAr ? 'غير نشط' : 'Inactive')}
                    </span>
                    {integration.lastSyncAt && (
                      <span className="text-xs text-healthcare-muted flex items-center gap-1">
                        <RefreshCw className="h-3 w-3" />
                        {formatDateTime(integration.lastSyncAt)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : (
        webhooks.length === 0 ? (
          <EmptyState
            icon={Webhook}
            title={isAr ? 'لا يوجد ويب هوك' : 'No webhooks configured'}
            description={isAr ? 'أضف ويب هوك لتلقي إشعارات الأحداث' : 'Add webhooks to receive event notifications'}
            action={{ label: isAr ? 'إضافة ويب هوك' : 'Add Webhook', onClick: () => setShowAddWebhook(true) }}
          />
        ) : (
          <div className="table-container">
            <table className="min-w-full">
              <thead className="table-header">
                <tr>
                  <th>{isAr ? 'الحدث' : 'Event'}</th>
                  <th>{isAr ? 'الرابط' : 'URL'}</th>
                  <th>{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="text-end">{isAr ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map((wh) => (
                  <tr key={wh.webhookId} className="table-row">
                    <td>
                      <span className="px-2 py-1 bg-primary-50 text-primary-700 rounded-lg text-xs font-mono">
                        {wh.event}
                      </span>
                    </td>
                    <td>
                      <span className="text-sm text-healthcare-text font-mono truncate block max-w-xs" dir="ltr">
                        {wh.url}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'px-2 py-1 rounded-lg text-xs font-medium',
                          wh.isActive ? 'bg-success-50 text-success-700' : 'bg-primary-50/50 text-healthcare-muted'
                        )}>
                          {wh.isActive ? (isAr ? 'نشط' : 'Active') : (isAr ? 'معطّل' : 'Inactive')}
                        </span>
                        {wh.failCount > 0 && (
                          <span className="px-2 py-0.5 bg-danger-50 text-danger-600 rounded-lg text-xs">
                            {wh.failCount} {isAr ? 'أخطاء' : 'failures'}
                          </span>
                        )}
                        {testResult?.id === wh.webhookId && (
                          <span className={cn('px-2 py-0.5 rounded-lg text-xs', testResult.success ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-600')}>
                            {testResult.message}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => testWebhookMutation.mutate(wh.webhookId)}
                          disabled={testWebhookMutation.isPending}
                          className="btn-ghost btn-sm px-2 py-1 min-h-0 text-xs text-primary-600"
                        >
                          <Send className="h-3 w-3 me-1" />
                          {isAr ? 'اختبار' : 'Test'}
                        </button>
                        {deleteConfirm === wh.webhookId ? (
                          <div className="flex gap-1">
                            <button onClick={() => deleteWebhookMutation.mutate(wh.webhookId)} className="btn-danger btn-sm px-2 py-1 min-h-0 text-xs">{isAr ? 'نعم' : 'Yes'}</button>
                            <button onClick={() => setDeleteConfirm(null)} className="btn-ghost btn-sm px-2 py-1 min-h-0 text-xs">{isAr ? 'لا' : 'No'}</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirm(wh.webhookId)} className="btn-icon btn-ghost p-2 min-w-[36px] min-h-[36px] hover:text-danger-500">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Add Integration Modal */}
      <Modal open={showAddIntegration} onClose={() => setShowAddIntegration(false)} title={isAr ? 'إضافة تكامل جديد' : 'Add Integration'}>
        <form onSubmit={(e) => { e.preventDefault(); addIntegrationMutation.mutate(integrationForm) }} className="space-y-4">
          <div>
            <label className="input-label">{isAr ? 'النوع' : 'Type'}</label>
            <select value={integrationForm.type} onChange={(e) => setIntegrationForm({ ...integrationForm, type: e.target.value })} className="select">
              {Object.entries(typeLabels).map(([key, label]) => (
                <option key={key} value={key}>{label.icon} {isAr ? label.ar : label.en}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="input-label">{isAr ? 'المزوّد' : 'Provider'}</label>
            <input type="text" value={integrationForm.provider} onChange={(e) => setIntegrationForm({ ...integrationForm, provider: e.target.value })}
              placeholder={isAr ? 'مثال: Epic, Salesforce' : 'e.g., Epic, Salesforce'} className="input" required />
          </div>
          <div>
            <label className="input-label">{isAr ? 'رابط API' : 'API URL'}</label>
            <input type="url" dir="ltr" value={integrationForm.apiUrl} onChange={(e) => setIntegrationForm({ ...integrationForm, apiUrl: e.target.value })} className="input" required />
          </div>
          <div>
            <label className="input-label">{isAr ? 'مفتاح API' : 'API Key'}</label>
            <input type="password" dir="ltr" value={integrationForm.apiKey} onChange={(e) => setIntegrationForm({ ...integrationForm, apiKey: e.target.value })} className="input" required />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setShowAddIntegration(false)} className="btn-outline flex-1">{isAr ? 'إلغاء' : 'Cancel'}</button>
            <button type="submit" disabled={addIntegrationMutation.isPending} className="btn-primary flex-1">
              {addIntegrationMutation.isPending ? (isAr ? 'جاري الإضافة...' : 'Adding...') : (isAr ? 'إضافة' : 'Add')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Webhook Modal */}
      <Modal open={showAddWebhook} onClose={() => setShowAddWebhook(false)} title={isAr ? 'إضافة ويب هوك' : 'Add Webhook'}>
        <form onSubmit={(e) => { e.preventDefault(); addWebhookMutation.mutate(webhookForm) }} className="space-y-4">
          <div>
            <label className="input-label">{isAr ? 'الحدث' : 'Event'}</label>
            <select value={webhookForm.event} onChange={(e) => setWebhookForm({ ...webhookForm, event: e.target.value })} className="select">
              {webhookEvents.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
            </select>
          </div>
          <div>
            <label className="input-label">{isAr ? 'الرابط' : 'URL'}</label>
            <input type="url" dir="ltr" value={webhookForm.url} onChange={(e) => setWebhookForm({ ...webhookForm, url: e.target.value })}
              placeholder="https://example.com/webhook" className="input" required />
          </div>
          <div>
            <label className="input-label">{isAr ? 'المفتاح السري (اختياري)' : 'Secret (optional)'}</label>
            <input type="text" dir="ltr" value={webhookForm.secret} onChange={(e) => setWebhookForm({ ...webhookForm, secret: e.target.value })} className="input" />
            <p className="input-hint">{isAr ? 'سيتم إنشاء مفتاح تلقائياً إذا لم يُحدد' : 'Auto-generated if not specified'}</p>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setShowAddWebhook(false)} className="btn-outline flex-1">{isAr ? 'إلغاء' : 'Cancel'}</button>
            <button type="submit" disabled={addWebhookMutation.isPending} className="btn-primary flex-1">
              {addWebhookMutation.isPending ? (isAr ? 'جاري الإضافة...' : 'Adding...') : (isAr ? 'إضافة' : 'Add')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
