import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import {
  Plus,
  MessageSquare,
  Send,
  FileText,
  CheckCircle,
  BarChart3,
  Filter,
  ToggleLeft,
  ToggleRight,
  Eye,
  Edit2,
  Trash2,
  Clock,
  X,
  Smartphone,
  QrCode,
  Wifi,
  WifiOff,
  RefreshCw,
  Loader2,
} from 'lucide-react'
import { cn, formatDateTime } from '../lib/utils'
import { useToast } from '../components/ui/Toast'
import StatCard from '../components/ui/StatCard'
import DataTable from '../components/ui/DataTable'
import Modal from '../components/ui/Modal'
import SearchInput from '../components/ui/SearchInput'
import Badge from '../components/ui/Badge'

// ─── Types ──────────────────────────────────────────────────────────────────────

interface SmsTemplate {
  id: string
  orgId: string
  name: string
  trigger: string
  bodyEn: string
  bodyAr: string
  variables: string[]
  channel: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface SmsLog {
  id: string
  phone: string
  channel: string
  body: string
  status: string
  patientId?: string
  templateId?: string
  triggeredBy?: string
  createdAt: string
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const TRIGGERS = ['post_booking', 'reminder', 'mid_call_link', 'survey', 'custom', 'follow_up'] as const
const CHANNELS = ['sms', 'whatsapp', 'both'] as const

const triggerLabels: Record<string, { ar: string; en: string }> = {
  post_booking: { ar: 'بعد الحجز', en: 'Post Booking' },
  reminder: { ar: 'تذكير', en: 'Reminder' },
  mid_call_link: { ar: 'رابط أثناء المكالمة', en: 'Mid-Call Link' },
  survey: { ar: 'استبيان', en: 'Survey' },
  custom: { ar: 'مخصص', en: 'Custom' },
  follow_up: { ar: 'متابعة', en: 'Follow Up' },
}

const channelLabels: Record<string, { ar: string; en: string }> = {
  sms: { ar: 'رسالة نصية', en: 'SMS' },
  whatsapp: { ar: 'واتساب', en: 'WhatsApp' },
  both: { ar: 'الكل', en: 'Both' },
}

const logStatusConfig: Record<string, { ar: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
  sent: { ar: 'تم الإرسال', variant: 'info' },
  delivered: { ar: 'تم التوصيل', variant: 'success' },
  failed: { ar: 'فشل', variant: 'danger' },
  read: { ar: 'تمت القراءة', variant: 'success' },
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function SmsTemplates() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const orgId = user?.org?.id || ''

  // State
  const [search, setSearch] = useState('')
  const [filterTrigger, setFilterTrigger] = useState<string>('all')
  const [activeTab, setActiveTab] = useState<'templates' | 'whatsapp' | 'logs'>('templates')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editTemplate, setEditTemplate] = useState<SmsTemplate | null>(null)
  const [showSendTest, setShowSendTest] = useState<SmsTemplate | null>(null)
  const [showPreview, setShowPreview] = useState<SmsTemplate | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    trigger: 'custom' as string,
    bodyEn: '',
    bodyAr: '',
    variables: [] as string[],
    channel: 'sms' as string,
    isActive: true,
  })
  const [newVariable, setNewVariable] = useState('')

  // Send test state
  const [testPhone, setTestPhone] = useState('')
  const [testLang, setTestLang] = useState<'ar' | 'en'>('ar')
  const [testChannel, setTestChannel] = useState<'sms' | 'whatsapp'>('sms')

  // Log pagination
  const [logPage, setLogPage] = useState(1)
  const [logStatusFilter, setLogStatusFilter] = useState<string>('all')
  const [logChannelFilter, setLogChannelFilter] = useState<string>('all')

  // ─── Queries ────────────────────────────────────────────────────────────────

  const { data: templates, isLoading: templatesLoading } = useQuery<SmsTemplate[]>({
    queryKey: ['sms-templates', orgId],
    queryFn: async () => {
      if (!orgId) return []
      try {
        const res = await api.get(`/api/sms-templates/${orgId}`)
        return res.data?.data || res.data || []
      } catch {
        return []
      }
    },
    enabled: !!orgId,
  })

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['sms-logs', orgId, logPage, logStatusFilter, logChannelFilter],
    queryFn: async () => {
      if (!orgId) return { data: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } }
      try {
        const params = new URLSearchParams()
        params.set('page', String(logPage))
        params.set('limit', '50')
        if (logStatusFilter !== 'all') params.set('status', logStatusFilter)
        if (logChannelFilter !== 'all') params.set('channel', logChannelFilter)
        const res = await api.get(`/api/sms-logs/${orgId}?${params}`)
        return res.data
      } catch {
        return { data: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } }
      }
    },
    enabled: !!orgId && activeTab === 'logs',
  })

  // ─── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) =>
      api.post('/api/sms-templates', {
        orgId,
        name: data.name,
        trigger: data.trigger,
        bodyEn: data.bodyEn,
        bodyAr: data.bodyAr,
        variables: data.variables,
        channel: data.channel,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms-templates'] })
      resetForm()
      setShowCreateModal(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof formData> }) =>
      api.patch(`/api/sms-templates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms-templates'] })
      resetForm()
      setEditTemplate(null)
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/api/sms-templates/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms-templates'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/sms-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms-templates'] })
    },
  })

  const sendTestMutation = useMutation({
    mutationFn: ({ templateId, phone, lang, channel }: { templateId: string; phone: string; lang: 'en' | 'ar'; channel: 'sms' | 'whatsapp' }) =>
      api.post(`/api/sms-templates/${templateId}/send`, {
        phone,
        lang,
        channel,
        variables: {},
      }),
    onSuccess: () => {
      setShowSendTest(null)
      setTestPhone('')
    },
  })

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const resetForm = () => {
    setFormData({
      name: '',
      trigger: 'custom',
      bodyEn: '',
      bodyAr: '',
      variables: [],
      channel: 'sms',
      isActive: true,
    })
    setNewVariable('')
  }

  const openEditModal = (template: SmsTemplate) => {
    setFormData({
      name: template.name,
      trigger: template.trigger,
      bodyEn: template.bodyEn,
      bodyAr: template.bodyAr,
      variables: template.variables || [],
      channel: template.channel,
      isActive: template.isActive,
    })
    setEditTemplate(template)
  }

  const addVariable = () => {
    if (newVariable.trim() && !formData.variables.includes(newVariable.trim())) {
      setFormData(prev => ({ ...prev, variables: [...prev.variables, newVariable.trim()] }))
      setNewVariable('')
    }
  }

  const removeVariable = (v: string) => {
    setFormData(prev => ({ ...prev, variables: prev.variables.filter(x => x !== v) }))
  }

  // ─── Computed ───────────────────────────────────────────────────────────────

  const allTemplates = templates || []
  const filteredTemplates = allTemplates.filter(t => {
    const matchesSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.bodyAr.includes(search)
    const matchesTrigger = filterTrigger === 'all' || t.trigger === filterTrigger
    return matchesSearch && matchesTrigger
  })

  const activeCount = allTemplates.filter(t => t.isActive).length
  const logs: SmsLog[] = logsData?.data || []
  const logPagination = logsData?.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 }

  // Stats
  const todaySent = logs.filter(l => {
    const d = new Date(l.createdAt)
    const now = new Date()
    return d.toDateString() === now.toDateString()
  }).length

  const deliveredCount = logs.filter(l => l.status === 'delivered' || l.status === 'read').length
  const deliveryRate = logs.length > 0 ? Math.round((deliveredCount / logs.length) * 100) : 0

  // ─── Template columns ──────────────────────────────────────────────────────

  const templateColumns = [
    {
      key: 'name',
      header: isAr ? 'اسم القالب' : 'Template Name',
      render: (t: SmsTemplate) => (
        <div className="flex items-center gap-3">
          <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', t.isActive ? 'bg-primary-100' : 'bg-gray-100')}>
            <MessageSquare className={cn('h-4 w-4', t.isActive ? 'text-primary-600' : 'text-gray-400')} />
          </div>
          <div>
            <p className="font-medium text-healthcare-text">{t.name}</p>
            <p className="text-xs text-healthcare-muted">{channelLabels[t.channel]?.[isAr ? 'ar' : 'en'] || t.channel}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'trigger',
      header: isAr ? 'المشغّل' : 'Trigger',
      render: (t: SmsTemplate) => (
        <Badge variant="info">
          {triggerLabels[t.trigger]?.[isAr ? 'ar' : 'en'] || t.trigger}
        </Badge>
      ),
    },
    {
      key: 'variables',
      header: isAr ? 'المتغيرات' : 'Variables',
      render: (t: SmsTemplate) => (
        <div className="flex flex-wrap gap-1">
          {(t.variables || []).length === 0 ? (
            <span className="text-xs text-healthcare-muted">—</span>
          ) : (
            (t.variables || []).slice(0, 3).map(v => (
              <span key={v} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-mono">{`{${v}}`}</span>
            ))
          )}
          {(t.variables || []).length > 3 && (
            <span className="text-xs text-healthcare-muted">+{t.variables.length - 3}</span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: isAr ? 'الحالة' : 'Status',
      render: (t: SmsTemplate) => (
        <button
          onClick={(e) => { e.stopPropagation(); toggleActiveMutation.mutate({ id: t.id, isActive: !t.isActive }) }}
          className="flex items-center gap-2"
        >
          {t.isActive ? (
            <ToggleRight className="h-6 w-6 text-green-500" />
          ) : (
            <ToggleLeft className="h-6 w-6 text-gray-300" />
          )}
          <span className={cn('text-sm', t.isActive ? 'text-green-600' : 'text-gray-400')}>
            {t.isActive ? (isAr ? 'مفعّل' : 'Active') : (isAr ? 'معطّل' : 'Inactive')}
          </span>
        </button>
      ),
    },
    {
      key: 'actions',
      header: isAr ? 'إجراءات' : 'Actions',
      render: (t: SmsTemplate) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setShowPreview(t) }}
            className="btn-icon btn-ghost p-2 min-w-[32px] min-h-[32px]"
            title={isAr ? 'معاينة' : 'Preview'}
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); openEditModal(t) }}
            className="btn-icon btn-ghost p-2 min-w-[32px] min-h-[32px]"
            title={isAr ? 'تعديل' : 'Edit'}
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowSendTest(t) }}
            className="btn-icon btn-ghost p-2 min-w-[32px] min-h-[32px] text-primary-600"
            title={isAr ? 'إرسال تجريبي' : 'Send Test'}
          >
            <Send className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); if (confirm(isAr ? 'هل تريد حذف هذا القالب؟' : 'Delete this template?')) deleteMutation.mutate(t.id) }}
            className="btn-icon btn-ghost p-2 min-w-[32px] min-h-[32px] text-danger-500 hover:bg-danger-50"
            title={isAr ? 'حذف' : 'Delete'}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ]

  // ─── Log columns ────────────────────────────────────────────────────────────

  const logColumns = [
    {
      key: 'recipient',
      header: isAr ? 'المستلم' : 'Recipient',
      render: (l: SmsLog) => (
        <span className="font-mono text-sm dir-ltr">{l.phone}</span>
      ),
    },
    {
      key: 'channel',
      header: isAr ? 'القناة' : 'Channel',
      render: (l: SmsLog) => (
        <Badge variant={l.channel === 'whatsapp' ? 'success' : 'primary'}>
          {channelLabels[l.channel]?.[isAr ? 'ar' : 'en'] || l.channel}
        </Badge>
      ),
    },
    {
      key: 'body',
      header: isAr ? 'المحتوى' : 'Content',
      render: (l: SmsLog) => (
        <p className="text-sm text-healthcare-muted truncate max-w-xs">{l.body}</p>
      ),
    },
    {
      key: 'status',
      header: isAr ? 'الحالة' : 'Status',
      render: (l: SmsLog) => {
        const cfg = logStatusConfig[l.status] || { ar: l.status, variant: 'neutral' as const }
        return <Badge variant={cfg.variant} dot>{isAr ? cfg.ar : l.status}</Badge>
      },
    },
    {
      key: 'triggeredBy',
      header: isAr ? 'المصدر' : 'Source',
      render: (l: SmsLog) => (
        <span className="text-sm text-healthcare-muted">{l.triggeredBy || '—'}</span>
      ),
    },
    {
      key: 'createdAt',
      header: isAr ? 'التاريخ' : 'Date',
      render: (l: SmsLog) => (
        <div className="flex items-center gap-1.5 text-sm text-healthcare-muted">
          <Clock className="h-3.5 w-3.5" />
          {l.createdAt ? formatDateTime(l.createdAt) : '—'}
        </div>
      ),
    },
  ]

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">{isAr ? 'قوالب الرسائل النصية' : 'SMS Templates'}</h1>
          <p className="text-healthcare-muted">
            {isAr ? 'إدارة قوالب الرسائل النصية والواتساب' : 'Manage SMS & WhatsApp message templates'}
          </p>
        </div>
        <button onClick={() => { resetForm(); setShowCreateModal(true) }} className="btn-primary">
          <Plus className="h-5 w-5" />
          {isAr ? 'قالب جديد' : 'New Template'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={FileText}
          value={allTemplates.length}
          label={isAr ? 'إجمالي القوالب' : 'Total Templates'}
          iconBg="bg-primary-100"
          iconColor="text-primary-600"
        />
        <StatCard
          icon={CheckCircle}
          value={activeCount}
          label={isAr ? 'القوالب المفعّلة' : 'Active Templates'}
          iconBg="bg-green-100"
          iconColor="text-green-600"
        />
        <StatCard
          icon={Send}
          value={todaySent}
          label={isAr ? 'رسائل اليوم' : 'Sent Today'}
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
        />
        <StatCard
          icon={BarChart3}
          value={`${deliveryRate}%`}
          label={isAr ? 'معدل التوصيل' : 'Delivery Rate'}
          iconBg="bg-purple-100"
          iconColor="text-purple-600"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('templates')}
          className={cn(
            'px-4 py-2 rounded-md text-sm font-medium transition-colors',
            activeTab === 'templates' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            {isAr ? 'القوالب' : 'Templates'}
          </div>
        </button>
        <button
          onClick={() => setActiveTab('whatsapp')}
          className={cn(
            'px-4 py-2 rounded-md text-sm font-medium transition-colors',
            activeTab === 'whatsapp' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            {isAr ? 'واتساب' : 'WhatsApp'}
          </div>
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={cn(
            'px-4 py-2 rounded-md text-sm font-medium transition-colors',
            activeTab === 'logs' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {isAr ? 'سجل الرسائل' : 'Message Logs'}
          </div>
        </button>
      </div>

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={isAr ? 'بحث في القوالب...' : 'Search templates...'}
              className="w-full sm:w-72"
            />
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <select
                value={filterTrigger}
                onChange={(e) => setFilterTrigger(e.target.value)}
                className="input py-2 text-sm min-w-[160px]"
              >
                <option value="all">{isAr ? 'جميع الأنواع' : 'All Triggers'}</option>
                {TRIGGERS.map(t => (
                  <option key={t} value={t}>{triggerLabels[t]?.[isAr ? 'ar' : 'en'] || t}</option>
                ))}
              </select>
            </div>
          </div>

          <DataTable
            columns={templateColumns}
            data={filteredTemplates}
            isLoading={templatesLoading}
            keyExtractor={(t) => t.id}
            emptyIcon={MessageSquare}
            emptyTitle={isAr ? 'لا توجد قوالب' : 'No templates found'}
            emptyDescription={isAr ? 'أنشئ أول قالب رسالة نصية' : 'Create your first SMS template'}
            emptyAction={{ label: isAr ? 'قالب جديد' : 'New Template', onClick: () => { resetForm(); setShowCreateModal(true) } }}
          />
        </>
      )}

      {/* WhatsApp Tab */}
      {activeTab === 'whatsapp' && (
        <WhatsAppTab orgId={orgId} isAr={isAr} templates={templates || []} />
      )}

      {/* Logs Tab */}
      {activeTab === 'logs' && (
        <>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <select
                value={logStatusFilter}
                onChange={(e) => { setLogStatusFilter(e.target.value); setLogPage(1) }}
                className="input py-2 text-sm min-w-[140px]"
              >
                <option value="all">{isAr ? 'جميع الحالات' : 'All Status'}</option>
                <option value="sent">{isAr ? 'تم الإرسال' : 'Sent'}</option>
                <option value="delivered">{isAr ? 'تم التوصيل' : 'Delivered'}</option>
                <option value="failed">{isAr ? 'فشل' : 'Failed'}</option>
                <option value="read">{isAr ? 'تمت القراءة' : 'Read'}</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={logChannelFilter}
                onChange={(e) => { setLogChannelFilter(e.target.value); setLogPage(1) }}
                className="input py-2 text-sm min-w-[140px]"
              >
                <option value="all">{isAr ? 'جميع القنوات' : 'All Channels'}</option>
                <option value="sms">{isAr ? 'رسالة نصية' : 'SMS'}</option>
                <option value="whatsapp">{isAr ? 'واتساب' : 'WhatsApp'}</option>
              </select>
            </div>
          </div>

          <DataTable
            columns={logColumns}
            data={logs}
            isLoading={logsLoading}
            keyExtractor={(l) => l.id}
            emptyIcon={FileText}
            emptyTitle={isAr ? 'لا توجد سجلات' : 'No logs found'}
            emptyDescription={isAr ? 'لم يتم إرسال أي رسائل بعد' : 'No messages sent yet'}
            pagination={logPagination.totalPages > 1 ? {
              page: logPagination.page,
              totalPages: logPagination.totalPages,
              total: logPagination.total,
              limit: logPagination.limit,
              onPageChange: setLogPage,
            } : undefined}
          />
        </>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={showCreateModal || !!editTemplate}
        onClose={() => { setShowCreateModal(false); setEditTemplate(null); resetForm() }}
        title={editTemplate ? (isAr ? 'تعديل القالب' : 'Edit Template') : (isAr ? 'قالب جديد' : 'New Template')}
        size="xl"
      >
        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isAr ? 'اسم القالب' : 'Template Name'}
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="input focus:ring-primary-400/20 focus:border-primary-500"
              placeholder={isAr ? 'مثال: تذكير الموعد' : 'e.g., Appointment Reminder'}
            />
          </div>

          {/* Trigger + Channel */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {isAr ? 'المشغّل' : 'Trigger'}
              </label>
              <select
                value={formData.trigger}
                onChange={(e) => setFormData(prev => ({ ...prev, trigger: e.target.value }))}
                className="input focus:ring-primary-400/20 focus:border-primary-500"
              >
                {TRIGGERS.map(t => (
                  <option key={t} value={t}>{triggerLabels[t]?.[isAr ? 'ar' : 'en'] || t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {isAr ? 'القناة' : 'Channel'}
              </label>
              <select
                value={formData.channel}
                onChange={(e) => setFormData(prev => ({ ...prev, channel: e.target.value }))}
                className="input focus:ring-primary-400/20 focus:border-primary-500"
              >
                {CHANNELS.map(c => (
                  <option key={c} value={c}>{channelLabels[c]?.[isAr ? 'ar' : 'en'] || c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Arabic Body */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isAr ? 'نص الرسالة (عربي)' : 'Message Body (Arabic)'}
            </label>
            <textarea
              rows={3}
              value={formData.bodyAr}
              onChange={(e) => setFormData(prev => ({ ...prev, bodyAr: e.target.value }))}
              className="input focus:ring-primary-400/20 focus:border-primary-500"
              placeholder="مرحباً {patient_name}، موعدك يوم {date}..."
              dir="rtl"
            />
          </div>

          {/* English Body */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isAr ? 'نص الرسالة (إنجليزي)' : 'Message Body (English)'}
            </label>
            <textarea
              rows={3}
              value={formData.bodyEn}
              onChange={(e) => setFormData(prev => ({ ...prev, bodyEn: e.target.value }))}
              className="input focus:ring-primary-400/20 focus:border-primary-500"
              placeholder="Hello {patient_name}, your appointment is on {date}..."
              dir="ltr"
            />
          </div>

          {/* Variables */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isAr ? 'المتغيرات' : 'Variables'}
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newVariable}
                onChange={(e) => setNewVariable(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addVariable() } }}
                className="input flex-1 focus:ring-primary-400/20 focus:border-primary-500"
                placeholder={isAr ? 'اسم المتغير (مثل: patient_name)' : 'Variable name (e.g., patient_name)'}
                dir="ltr"
              />
              <button onClick={addVariable} className="btn-primary btn-sm px-4">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.variables.map(v => (
                <span key={v} className="inline-flex items-center gap-1 px-2 py-1 bg-primary-50 text-primary-700 rounded-md text-sm font-mono">
                  {`{${v}}`}
                  <button onClick={() => removeVariable(v)} className="hover:text-danger-500">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Active Toggle (edit only) */}
          {editTemplate && (
            <div className="flex items-center justify-between py-2">
              <label className="text-sm font-medium text-gray-700">
                {isAr ? 'مفعّل' : 'Active'}
              </label>
              <button
                onClick={() => setFormData(prev => ({ ...prev, isActive: !prev.isActive }))}
                className="flex items-center gap-2"
              >
                {formData.isActive ? (
                  <ToggleRight className="h-7 w-7 text-green-500" />
                ) : (
                  <ToggleLeft className="h-7 w-7 text-gray-300" />
                )}
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              onClick={() => { setShowCreateModal(false); setEditTemplate(null); resetForm() }}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              onClick={() => {
                if (editTemplate) {
                  updateMutation.mutate({
                    id: editTemplate.id,
                    data: {
                      name: formData.name,
                      trigger: formData.trigger,
                      bodyEn: formData.bodyEn,
                      bodyAr: formData.bodyAr,
                      variables: formData.variables,
                      channel: formData.channel,
                      isActive: formData.isActive,
                    },
                  })
                } else {
                  createMutation.mutate(formData)
                }
              }}
              disabled={!formData.name || !formData.bodyAr || !formData.bodyEn || createMutation.isPending || updateMutation.isPending}
              className="btn-primary"
            >
              {(createMutation.isPending || updateMutation.isPending)
                ? (isAr ? 'جاري الحفظ...' : 'Saving...')
                : editTemplate
                  ? (isAr ? 'حفظ التعديلات' : 'Save Changes')
                  : (isAr ? 'إنشاء القالب' : 'Create Template')
              }
            </button>
          </div>
        </div>
      </Modal>

      {/* Send Test Modal */}
      <Modal
        open={!!showSendTest}
        onClose={() => { setShowSendTest(null); setTestPhone('') }}
        title={isAr ? 'إرسال رسالة تجريبية' : 'Send Test Message'}
        size="md"
      >
        {showSendTest && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm font-medium text-gray-700 mb-1">{isAr ? 'القالب:' : 'Template:'}</p>
              <p className="text-sm text-healthcare-muted">{showSendTest.name}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {isAr ? 'رقم الهاتف' : 'Phone Number'}
              </label>
              <input
                type="tel"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                className="input focus:ring-primary-400/20 focus:border-primary-500"
                placeholder="+966XXXXXXXXX"
                dir="ltr"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isAr ? 'اللغة' : 'Language'}
                </label>
                <select
                  value={testLang}
                  onChange={(e) => setTestLang(e.target.value as 'ar' | 'en')}
                  className="input focus:ring-primary-400/20 focus:border-primary-500"
                >
                  <option value="ar">{isAr ? 'عربي' : 'Arabic'}</option>
                  <option value="en">{isAr ? 'إنجليزي' : 'English'}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isAr ? 'القناة' : 'Channel'}
                </label>
                <select
                  value={testChannel}
                  onChange={(e) => setTestChannel(e.target.value as 'sms' | 'whatsapp')}
                  className="input focus:ring-primary-400/20 focus:border-primary-500"
                >
                  <option value="sms">SMS</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>
            </div>

            {sendTestMutation.isError && (
              <div className="p-3 bg-danger-50 text-danger-600 rounded-lg text-sm">
                {isAr ? 'فشل إرسال الرسالة التجريبية' : 'Failed to send test message'}
              </div>
            )}
            {sendTestMutation.isSuccess && (
              <div className="p-3 bg-green-50 text-green-600 rounded-lg text-sm">
                {isAr ? 'تم إرسال الرسالة التجريبية بنجاح' : 'Test message sent successfully'}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                onClick={() => { setShowSendTest(null); setTestPhone('') }}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={() => sendTestMutation.mutate({
                  templateId: showSendTest.id,
                  phone: testPhone,
                  lang: testLang,
                  channel: testChannel,
                })}
                disabled={!testPhone || sendTestMutation.isPending}
                className="btn-primary"
              >
                <Send className="h-4 w-4" />
                {sendTestMutation.isPending ? (isAr ? 'جاري الإرسال...' : 'Sending...') : (isAr ? 'إرسال' : 'Send')}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Preview Modal with Phone Mockup */}
      <Modal
        open={!!showPreview}
        onClose={() => setShowPreview(null)}
        title={isAr ? 'معاينة القالب' : 'Template Preview'}
        size="lg"
      >
        {showPreview && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <Badge variant={showPreview.isActive ? 'success' : 'neutral'} dot>
                {showPreview.isActive ? (isAr ? 'مفعّل' : 'Active') : (isAr ? 'معطّل' : 'Inactive')}
              </Badge>
              <Badge variant="info">
                {triggerLabels[showPreview.trigger]?.[isAr ? 'ar' : 'en'] || showPreview.trigger}
              </Badge>
              <Badge variant="primary">
                {channelLabels[showPreview.channel]?.[isAr ? 'ar' : 'en'] || showPreview.channel}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
              {/* Phone Mockup - Arabic */}
              <div className="flex flex-col items-center">
                <p className="text-xs font-medium text-gray-500 mb-3">{isAr ? 'النص العربي' : 'Arabic Preview'}</p>
                <div className="w-64 rounded-[2rem] border-[6px] border-gray-800 bg-gray-100 shadow-lg overflow-hidden">
                  {/* Phone notch */}
                  <div className="bg-gray-800 h-6 flex items-center justify-center">
                    <div className="w-16 h-3 bg-gray-700 rounded-full" />
                  </div>
                  {/* Chat header */}
                  <div className={cn(
                    'px-3 py-2 text-white text-xs font-medium',
                    showPreview.channel === 'whatsapp' || showPreview.channel === 'both'
                      ? 'bg-green-600'
                      : 'bg-blue-600',
                  )}>
                    {showPreview.channel === 'whatsapp' || showPreview.channel === 'both' ? 'WhatsApp' : 'SMS'}
                  </div>
                  {/* Chat area */}
                  <div className="p-3 min-h-[200px] bg-[#ECE5DD]">
                    <div className="bg-white rounded-lg rounded-tl-none p-3 shadow-sm max-w-[90%]" dir="rtl">
                      <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
                        {showPreview.bodyAr.replace(/\{(\w+)\}/g, (_, v) => `[${v}]`)}
                      </p>
                      <p className="text-[10px] text-gray-400 text-end mt-1">12:00 PM</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Phone Mockup - English */}
              <div className="flex flex-col items-center">
                <p className="text-xs font-medium text-gray-500 mb-3">{isAr ? 'النص الإنجليزي' : 'English Preview'}</p>
                <div className="w-64 rounded-[2rem] border-[6px] border-gray-800 bg-gray-100 shadow-lg overflow-hidden">
                  {/* Phone notch */}
                  <div className="bg-gray-800 h-6 flex items-center justify-center">
                    <div className="w-16 h-3 bg-gray-700 rounded-full" />
                  </div>
                  {/* Chat header */}
                  <div className={cn(
                    'px-3 py-2 text-white text-xs font-medium',
                    showPreview.channel === 'whatsapp' || showPreview.channel === 'both'
                      ? 'bg-green-600'
                      : 'bg-blue-600',
                  )}>
                    {showPreview.channel === 'whatsapp' || showPreview.channel === 'both' ? 'WhatsApp' : 'SMS'}
                  </div>
                  {/* Chat area */}
                  <div className="p-3 min-h-[200px] bg-[#ECE5DD]">
                    <div className="bg-white rounded-lg rounded-tl-none p-3 shadow-sm max-w-[90%]" dir="ltr">
                      <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
                        {showPreview.bodyEn.replace(/\{(\w+)\}/g, (_, v) => `[${v}]`)}
                      </p>
                      <p className="text-[10px] text-gray-400 text-end mt-1">12:00 PM</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {(showPreview.variables || []).length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-500 mb-2">{isAr ? 'المتغيرات' : 'Variables'}</p>
                <div className="flex flex-wrap gap-2">
                  {showPreview.variables.map(v => (
                    <span key={v} className="px-2 py-1 bg-primary-50 text-primary-700 rounded-md text-sm font-mono">{`{${v}}`}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

// ─── WhatsApp Tab Component ────────────────────────────────────────────────────

interface Patient {
  patientId: string
  firstName: string
  lastName: string
  phone: string
}

function WhatsAppTab({ orgId, isAr, templates }: { orgId: string; isAr: boolean; templates: SmsTemplate[] }) {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [previewTemplate, setPreviewTemplate] = useState<SmsTemplate | null>(null)
  const [previewLang, setPreviewLang] = useState<'ar' | 'en'>('ar')

  // Composer state
  const [showComposer, setShowComposer] = useState(false)
  const [composeText, setComposeText] = useState('')
  const [composeImage, setComposeImage] = useState<string | null>(null) // base64
  const [composeImageName, setComposeImageName] = useState('')
  const [composeMimetype, setComposeMimetype] = useState('image/jpeg')
  const [recipientMode, setRecipientMode] = useState<'individual' | 'bulk'>('individual')
  const [selectedPhones, setSelectedPhones] = useState<string[]>([])
  const [phoneInput, setPhoneInput] = useState('')
  const [patientSearch, setPatientSearch] = useState('')

  // Baileys connection status
  const { data: waStatus, isLoading: statusLoading, refetch: refetchStatus } = useQuery<{
    success: boolean
    status: string
    phone?: string
    name?: string
    qr?: string
    qrDataUrl?: string
    connected?: boolean
  }>({
    queryKey: ['whatsapp-status', orgId],
    queryFn: async () => {
      const res = await api.get('/api/baileys-whatsapp/status')
      return res.data
    },
    enabled: !!orgId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      // Poll faster when waiting for QR scan
      if (status === 'qr' || status === 'connecting') return 3000
      return 15000
    },
  })

  // QR code
  const { data: qrData, refetch: refetchQr } = useQuery<{
    success: boolean
    connected: boolean
    qr?: string
    status?: string
    phone?: string
    name?: string
  }>({
    queryKey: ['whatsapp-qr', orgId],
    queryFn: async () => {
      const res = await api.get('/api/baileys-whatsapp/qr')
      return res.data
    },
    enabled: !!orgId && (waStatus?.status === 'qr' || waStatus?.status === 'disconnected'),
    refetchInterval: 5000,
  })

  // Connect mutation
  const connectMutation = useMutation({
    mutationFn: () => api.post('/api/baileys-whatsapp/connect'),
    onSuccess: () => {
      refetchStatus()
      refetchQr()
      addToast({ type: 'info', title: isAr ? 'جارٍ الاتصال... امسح رمز QR' : 'Connecting... scan the QR code' })
    },
    onError: () => {
      addToast({ type: 'error', title: isAr ? 'فشل الاتصال بواتساب' : 'Failed to connect WhatsApp' })
    },
  })

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: () => api.post('/api/baileys-whatsapp/disconnect'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] })
      addToast({ type: 'success', title: isAr ? 'تم قطع اتصال واتساب' : 'WhatsApp disconnected' })
    },
  })

  // Patients for recipient picker
  const { data: patients } = useQuery<Patient[]>({
    queryKey: ['patients-wa', orgId],
    queryFn: async () => {
      const res = await api.get('/api/patients?limit=200')
      const data = res.data?.data || res.data || []
      return Array.isArray(data) ? data : []
    },
    enabled: !!orgId && showComposer,
    staleTime: 120_000,
  })

  // Send mutation
  const sendMutation = useMutation({
    mutationFn: (payload: { phones: string[]; text?: string; caption?: string; image?: string; imageMimetype?: string }) =>
      api.post('/api/baileys-whatsapp/send', payload),
    onSuccess: (res) => {
      const d = res.data
      addToast({
        type: d.failed > 0 ? 'warning' : 'success',
        title: isAr
          ? `تم الإرسال: ${d.sent} نجح، ${d.failed} فشل`
          : `Sent: ${d.sent} succeeded, ${d.failed} failed`,
      })
      // Reset composer
      setComposeText('')
      setComposeImage(null)
      setComposeImageName('')
      setSelectedPhones([])
      setShowComposer(false)
    },
    onError: () => {
      addToast({ type: 'error', title: isAr ? 'فشل إرسال الرسالة' : 'Failed to send message' })
    },
  })

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      addToast({ type: 'error', title: isAr ? 'الحد الأقصى 5 ميجابايت' : 'Max file size is 5MB' })
      return
    }
    setComposeMimetype(file.type || 'image/jpeg')
    setComposeImageName(file.name)
    const reader = new FileReader()
    reader.onload = () => setComposeImage(reader.result as string)
    reader.readAsDataURL(file)
  }

  const addPhone = (phone: string) => {
    const cleaned = phone.replace(/[^0-9+]/g, '')
    if (cleaned && !selectedPhones.includes(cleaned)) {
      setSelectedPhones([...selectedPhones, cleaned])
    }
    setPhoneInput('')
    setPatientSearch('')
  }

  const removePhone = (phone: string) => {
    setSelectedPhones(selectedPhones.filter((p) => p !== phone))
  }

  const handleSend = () => {
    if (selectedPhones.length === 0) {
      addToast({ type: 'error', title: isAr ? 'اختر مستلم واحد على الأقل' : 'Select at least one recipient' })
      return
    }
    if (!composeText && !composeImage) {
      addToast({ type: 'error', title: isAr ? 'أضف نص أو صورة' : 'Add text or image' })
      return
    }
    sendMutation.mutate({
      phones: selectedPhones,
      text: !composeImage ? composeText : undefined,
      caption: composeImage ? composeText : undefined,
      image: composeImage || undefined,
      imageMimetype: composeMimetype,
    })
  }

  const filteredPatients = (patients || []).filter((p) =>
    !patientSearch || `${p.firstName} ${p.lastName} ${p.phone}`.toLowerCase().includes(patientSearch.toLowerCase()),
  ).slice(0, 8)

  const isConnected = waStatus?.status === 'connected'
  const isQr = waStatus?.status === 'qr' || qrData?.qr
  const qrImage = qrData?.qr || waStatus?.qrDataUrl

  // Filter WhatsApp templates
  const waTemplates = templates.filter((t) => t.channel === 'whatsapp' || t.channel === 'both')

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Connection Status Card */}
      <div className={cn(
        'card overflow-hidden',
        isConnected ? 'border-green-200' : 'border-gray-200',
      )}>
        {/* Status Header */}
        <div className={cn(
          'px-6 py-4 flex items-center justify-between',
          isConnected
            ? 'bg-gradient-to-r from-green-50 to-emerald-50'
            : 'bg-gradient-to-r from-gray-50 to-gray-100',
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              'p-2.5 rounded-xl',
              isConnected ? 'bg-green-100' : 'bg-gray-200',
            )}>
              {isConnected
                ? <Wifi className="h-5 w-5 text-green-600" />
                : <WifiOff className="h-5 w-5 text-gray-500" />}
            </div>
            <div>
              <h3 className="font-heading font-semibold text-healthcare-text">
                {isAr ? 'اتصال واتساب (Baileys)' : 'WhatsApp Connection (Baileys)'}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {isConnected
                  ? `${isAr ? 'متصل' : 'Connected'} — ${waStatus?.phone || ''} ${waStatus?.name ? `(${waStatus.name})` : ''}`
                  : isQr
                    ? (isAr ? 'في انتظار مسح رمز QR' : 'Waiting for QR code scan')
                    : (isAr ? 'غير متصل' : 'Not connected')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetchStatus()}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-white/50"
              title={isAr ? 'تحديث' : 'Refresh'}
            >
              <RefreshCw className={cn('h-4 w-4', statusLoading && 'animate-spin')} />
            </button>
            {isConnected ? (
              <button
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {isAr ? 'قطع الاتصال' : 'Disconnect'}
              </button>
            ) : (
              <button
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {connectMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {isAr ? 'اتصال' : 'Connect'}
              </button>
            )}
          </div>
        </div>

        {/* QR Code Section */}
        {!isConnected && isQr && qrImage && (
          <div className="px-6 py-8 flex flex-col items-center border-t bg-white">
            <QrCode className="h-6 w-6 text-gray-400 mb-3" />
            <p className="text-sm text-gray-600 mb-4 text-center">
              {isAr
                ? 'افتح واتساب على هاتفك → الإعدادات → الأجهزة المرتبطة → ربط جهاز'
                : 'Open WhatsApp on your phone → Settings → Linked Devices → Link a Device'}
            </p>
            <div className="bg-white p-3 rounded-2xl shadow-lg border">
              <img
                src={qrImage}
                alt="WhatsApp QR Code"
                className="w-56 h-56 object-contain"
              />
            </div>
            <p className="text-xs text-gray-400 mt-3 animate-pulse-soft">
              {isAr ? 'في انتظار المسح...' : 'Waiting for scan...'}
            </p>
          </div>
        )}
      </div>

      {/* Compose Message Section */}
      {isConnected && (
        <div>
          {!showComposer ? (
            <button
              onClick={() => setShowComposer(true)}
              className="w-full card p-4 flex items-center justify-center gap-2 text-green-600 hover:bg-green-50 transition-colors font-medium text-sm border-dashed border-2 border-green-200"
            >
              <Send className="h-4 w-4" />
              {isAr ? 'إنشاء رسالة واتساب' : 'Compose WhatsApp Message'}
            </button>
          ) : (
            <div className="card overflow-hidden">
              <div className="bg-gradient-to-r from-green-500 to-green-600 px-5 py-3 flex items-center justify-between">
                <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  {isAr ? 'إرسال رسالة واتساب' : 'Send WhatsApp Message'}
                </h3>
                <button onClick={() => setShowComposer(false)} className="text-white/70 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Editor */}
                <div className="space-y-4">
                  {/* Recipients */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      {isAr ? 'المستلمون' : 'Recipients'}
                    </label>
                    {/* Mode toggle */}
                    <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 mb-2 w-fit">
                      <button
                        type="button"
                        onClick={() => setRecipientMode('individual')}
                        className={cn('px-3 py-1 rounded-md text-xs font-medium transition-colors', recipientMode === 'individual' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500')}
                      >
                        {isAr ? 'فردي' : 'Individual'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecipientMode('bulk')}
                        className={cn('px-3 py-1 rounded-md text-xs font-medium transition-colors', recipientMode === 'bulk' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500')}
                      >
                        {isAr ? 'جماعي' : 'Bulk'}
                      </button>
                    </div>

                    {/* Selected pills */}
                    {selectedPhones.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {selectedPhones.map((ph) => {
                          const pat = (patients || []).find((p) => p.phone === ph)
                          return (
                            <span key={ph} className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-lg text-xs">
                              {pat ? `${pat.firstName} ${pat.lastName}` : ph}
                              <button onClick={() => removePhone(ph)} className="text-green-400 hover:text-red-500">
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          )
                        })}
                      </div>
                    )}

                    {recipientMode === 'individual' ? (
                      <div className="relative">
                        <input
                          type="text"
                          placeholder={isAr ? 'ابحث عن مريض أو أدخل رقم...' : 'Search patient or enter number...'}
                          value={patientSearch || phoneInput}
                          onChange={(e) => {
                            const v = e.target.value
                            if (/^[0-9+]/.test(v)) { setPhoneInput(v); setPatientSearch('') }
                            else { setPatientSearch(v); setPhoneInput('') }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && phoneInput) { addPhone(phoneInput) }
                          }}
                          className="input w-full text-sm"
                        />
                        {patientSearch && filteredPatients.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {filteredPatients.map((p) => (
                              <button
                                key={p.patientId}
                                type="button"
                                onClick={() => { addPhone(p.phone); setPatientSearch('') }}
                                className="w-full px-3 py-2 text-start hover:bg-gray-50 text-sm flex items-center justify-between"
                              >
                                <span>{p.firstName} {p.lastName}</span>
                                <span className="text-xs text-gray-400 font-mono">{p.phone}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const all = (patients || []).filter((p) => p.phone).map((p) => p.phone)
                              setSelectedPhones([...new Set([...selectedPhones, ...all])])
                            }}
                            className="text-xs px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100"
                          >
                            {isAr ? 'إضافة كل المرضى' : `Add all patients (${patients?.length || 0})`}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedPhones([])}
                            className="text-xs px-3 py-1.5 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100"
                          >
                            {isAr ? 'مسح الكل' : 'Clear all'}
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder={isAr ? 'ابحث لتصفية المرضى...' : 'Search to filter patients...'}
                          value={patientSearch}
                          onChange={(e) => setPatientSearch(e.target.value)}
                          className="input w-full text-sm"
                        />
                        <div className="max-h-32 overflow-y-auto border rounded-lg divide-y">
                          {filteredPatients.map((p) => {
                            const isSelected = selectedPhones.includes(p.phone)
                            return (
                              <button
                                key={p.patientId}
                                type="button"
                                onClick={() => isSelected ? removePhone(p.phone) : addPhone(p.phone)}
                                className={cn('w-full px-3 py-2 text-start text-sm flex items-center justify-between', isSelected && 'bg-green-50')}
                              >
                                <span>{p.firstName} {p.lastName}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-400 font-mono">{p.phone}</span>
                                  {isSelected && <CheckCircle className="h-3.5 w-3.5 text-green-500" />}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Image Upload */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      {isAr ? 'صورة (اختياري)' : 'Image (optional)'}
                    </label>
                    {composeImage ? (
                      <div className="relative inline-block">
                        <img src={composeImage} alt="Upload" className="w-32 h-32 object-cover rounded-xl border" />
                        <button
                          onClick={() => { setComposeImage(null); setComposeImageName('') }}
                          className="absolute -top-2 -end-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <p className="text-[10px] text-gray-400 mt-1 truncate max-w-[128px]">{composeImageName}</p>
                      </div>
                    ) : (
                      <label className="flex items-center justify-center w-32 h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-green-400 hover:bg-green-50/50 transition-colors">
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={handleImageUpload}
                        />
                        <div className="text-center">
                          <Plus className="h-6 w-6 text-gray-400 mx-auto mb-1" />
                          <span className="text-xs text-gray-500">{isAr ? 'رفع صورة' : 'Upload'}</span>
                        </div>
                      </label>
                    )}
                  </div>

                  {/* Message Text */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                      {composeImage ? (isAr ? 'تعليق الصورة' : 'Image Caption') : (isAr ? 'نص الرسالة' : 'Message Text')}
                    </label>
                    <textarea
                      rows={4}
                      value={composeText}
                      onChange={(e) => setComposeText(e.target.value)}
                      className="input w-full text-sm"
                      dir={isAr ? 'rtl' : 'ltr'}
                      placeholder={isAr ? 'اكتب رسالتك هنا...' : 'Type your message here...'}
                    />
                  </div>

                  {/* Send Button */}
                  <button
                    onClick={handleSend}
                    disabled={sendMutation.isPending || selectedPhones.length === 0 || (!composeText && !composeImage)}
                    className="w-full py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {sendMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {isAr
                      ? `إرسال إلى ${selectedPhones.length} مستلم`
                      : `Send to ${selectedPhones.length} recipient${selectedPhones.length !== 1 ? 's' : ''}`}
                  </button>
                </div>

                {/* Right: Phone Preview */}
                <div className="flex flex-col items-center">
                  <p className="text-xs font-medium text-gray-500 mb-3">{isAr ? 'معاينة' : 'Preview'}</p>
                  <div className="w-64 rounded-[2.2rem] border-[6px] border-gray-800 bg-gray-100 shadow-xl overflow-hidden">
                    {/* Notch */}
                    <div className="bg-gray-800 h-6 flex items-center justify-center">
                      <div className="w-16 h-2.5 bg-gray-700 rounded-full" />
                    </div>
                    {/* WhatsApp Header */}
                    <div className="bg-[#075E54] px-3 py-2 flex items-center gap-2">
                      <div className="w-7 h-7 bg-gray-300 rounded-full flex items-center justify-center text-[10px] font-bold text-gray-600">
                        {waStatus?.name?.[0] || 'N'}
                      </div>
                      <div>
                        <p className="text-white text-xs font-medium">{waStatus?.name || (isAr ? 'العيادة' : 'Clinic')}</p>
                        <p className="text-green-200 text-[9px]">{isAr ? 'متصل' : 'online'}</p>
                      </div>
                    </div>
                    {/* Chat */}
                    <div className="bg-[#ECE5DD] p-3 min-h-[240px]">
                      <div className="flex justify-center mb-2">
                        <span className="bg-white/80 text-gray-500 text-[9px] px-2 py-0.5 rounded-full">{isAr ? 'اليوم' : 'Today'}</span>
                      </div>
                      {(composeImage || composeText) ? (
                        <div className="max-w-[88%]">
                          <div className="bg-white rounded-xl rounded-tl-none shadow-sm overflow-hidden">
                            {composeImage && (
                              <img src={composeImage} alt="" className="w-full h-32 object-cover" />
                            )}
                            {composeText && (
                              <p className="text-[11px] text-gray-800 whitespace-pre-wrap leading-relaxed p-2.5" dir={isAr ? 'rtl' : 'ltr'}>
                                {composeText}
                              </p>
                            )}
                            <div className="flex items-center justify-end gap-1 px-2.5 pb-1.5">
                              <span className="text-[9px] text-gray-400">12:00 PM</span>
                              <CheckCircle className="h-2.5 w-2.5 text-blue-400" />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[10px] text-gray-400 text-center mt-20">
                          {isAr ? 'ابدأ بكتابة رسالتك...' : 'Start composing...'}
                        </p>
                      )}
                    </div>
                    {/* Input bar */}
                    <div className="bg-[#F0F0F0] px-2 py-2 flex items-center gap-1.5">
                      <div className="flex-1 bg-white rounded-full px-2.5 py-1 text-[10px] text-gray-400">
                        {isAr ? 'اكتب رسالة...' : 'Type a message...'}
                      </div>
                      <div className="w-7 h-7 bg-[#075E54] rounded-full flex items-center justify-center">
                        <Send className="h-3 w-3 text-white" />
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-3">
                    {selectedPhones.length > 0
                      ? (isAr ? `سيتم الإرسال إلى ${selectedPhones.length} شخص` : `Will send to ${selectedPhones.length} recipient(s)`)
                      : (isAr ? 'لم يتم اختيار مستلمين' : 'No recipients selected')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* WhatsApp Templates List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-heading font-semibold text-healthcare-text">
            {isAr ? 'قوالب واتساب' : 'WhatsApp Templates'}
          </h3>
          <span className="text-xs text-gray-500">
            {waTemplates.length} {isAr ? 'قالب' : 'templates'}
          </span>
        </div>

        {waTemplates.length === 0 ? (
          <div className="card p-8 text-center">
            <Smartphone className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">{isAr ? 'لا توجد قوالب واتساب' : 'No WhatsApp templates'}</p>
            <p className="text-xs text-gray-400 mt-1">
              {isAr
                ? 'أنشئ قالب جديد واختر "واتساب" أو "الكل" كقناة'
                : 'Create a new template and select "WhatsApp" or "Both" as the channel'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {waTemplates.map((tmpl) => (
              <div
                key={tmpl.id}
                className="card hover:shadow-card-hover transition-all cursor-pointer overflow-hidden"
                onClick={() => setPreviewTemplate(tmpl)}
              >
                {/* Card Header */}
                <div className="bg-gradient-to-r from-green-500 to-green-600 px-4 py-3 text-white">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm truncate">{tmpl.name}</span>
                    <div className={cn(
                      'w-2 h-2 rounded-full',
                      tmpl.isActive ? 'bg-green-200' : 'bg-red-300',
                    )} />
                  </div>
                  <span className="text-green-100 text-xs">
                    {triggerLabels[tmpl.trigger]?.[isAr ? 'ar' : 'en'] || tmpl.trigger}
                  </span>
                </div>

                {/* Card Body */}
                <div className="p-4">
                  {/* Mini preview */}
                  <div className="bg-[#ECE5DD] rounded-lg p-2.5 mb-3">
                    <div className="bg-white rounded-lg rounded-tl-none px-3 py-2 shadow-sm">
                      <p className="text-[11px] text-gray-700 line-clamp-3 whitespace-pre-wrap" dir={isAr ? 'rtl' : 'ltr'}>
                        {isAr ? tmpl.bodyAr : tmpl.bodyEn}
                      </p>
                    </div>
                  </div>

                  {/* Variables */}
                  {tmpl.variables.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {tmpl.variables.slice(0, 3).map((v) => (
                        <span key={v} className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-[10px] font-mono">
                          {`{${v}}`}
                        </span>
                      ))}
                      {tmpl.variables.length > 3 && (
                        <span className="text-[10px] text-gray-400">+{tmpl.variables.length - 3}</span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>{channelLabels[tmpl.channel]?.[isAr ? 'ar' : 'en']}</span>
                    <span>{tmpl.isActive ? (isAr ? 'مفعّل' : 'Active') : (isAr ? 'معطّل' : 'Inactive')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Template Preview Modal — Phone Mockup */}
      {previewTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setPreviewTemplate(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-healthcare-text">{previewTemplate.name}</h3>
                <button onClick={() => setPreviewTemplate(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Language Toggle */}
              <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 mb-4 w-fit mx-auto">
                <button
                  onClick={() => setPreviewLang('ar')}
                  className={cn(
                    'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                    previewLang === 'ar' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500',
                  )}
                >
                  عربي
                </button>
                <button
                  onClick={() => setPreviewLang('en')}
                  className={cn(
                    'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                    previewLang === 'en' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500',
                  )}
                >
                  English
                </button>
              </div>

              {/* Phone Mockup */}
              <div className="flex justify-center">
                <div className="w-72 rounded-[2.5rem] border-[7px] border-gray-800 bg-gray-100 shadow-xl overflow-hidden">
                  {/* Notch */}
                  <div className="bg-gray-800 h-7 flex items-center justify-center">
                    <div className="w-20 h-3.5 bg-gray-700 rounded-full" />
                  </div>
                  {/* WhatsApp Header */}
                  <div className="bg-[#075E54] px-4 py-2.5 flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center text-xs font-bold text-gray-600">
                      {waStatus?.name?.[0] || 'N'}
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{waStatus?.name || (isAr ? 'العيادة' : 'Clinic')}</p>
                      <p className="text-green-200 text-[10px]">{isAr ? 'متصل' : 'online'}</p>
                    </div>
                  </div>
                  {/* Chat Area */}
                  <div className="bg-[#ECE5DD] p-3 min-h-[280px] bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMCwwLDAsMC4wMykiLz48L3N2Zz4=')]">
                    {/* Date chip */}
                    <div className="flex justify-center mb-3">
                      <span className="bg-white/80 text-gray-500 text-[10px] px-3 py-1 rounded-full shadow-sm">
                        {isAr ? 'اليوم' : 'Today'}
                      </span>
                    </div>
                    {/* Message bubble */}
                    <div className="max-w-[85%]">
                      <div className="bg-white rounded-xl rounded-tl-none p-3 shadow-sm relative">
                        {/* Tail */}
                        <div className="absolute -start-2 top-0 w-0 h-0 border-t-[8px] border-t-white border-s-[8px] border-s-transparent" />
                        <p
                          className="text-[13px] text-gray-800 whitespace-pre-wrap leading-relaxed"
                          dir={previewLang === 'ar' ? 'rtl' : 'ltr'}
                        >
                          {(previewLang === 'ar' ? previewTemplate.bodyAr : previewTemplate.bodyEn)
                            .replace(/\{(\w+)\}/g, (_, v) => `\u200B*[${v}]*\u200B`)}
                        </p>
                        <div className="flex items-center justify-end gap-1 mt-1.5">
                          <span className="text-[10px] text-gray-400">12:00 PM</span>
                          <CheckCircle className="h-3 w-3 text-blue-400" />
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Input bar */}
                  <div className="bg-[#F0F0F0] px-3 py-2.5 flex items-center gap-2">
                    <div className="flex-1 bg-white rounded-full px-3 py-1.5 text-[11px] text-gray-400">
                      {isAr ? 'اكتب رسالة...' : 'Type a message...'}
                    </div>
                    <div className="w-8 h-8 bg-[#075E54] rounded-full flex items-center justify-center">
                      <Send className="h-3.5 w-3.5 text-white" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Template Info */}
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">{isAr ? 'المحفز' : 'Trigger'}</span>
                  <span className="font-medium">{triggerLabels[previewTemplate.trigger]?.[isAr ? 'ar' : 'en']}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">{isAr ? 'القناة' : 'Channel'}</span>
                  <span className="font-medium">{channelLabels[previewTemplate.channel]?.[isAr ? 'ar' : 'en']}</span>
                </div>
                {previewTemplate.variables.length > 0 && (
                  <div className="pt-1">
                    <span className="text-gray-500 text-xs">{isAr ? 'المتغيرات' : 'Variables'}</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {previewTemplate.variables.map((v) => (
                        <span key={v} className="px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs font-mono">{`{${v}}`}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
