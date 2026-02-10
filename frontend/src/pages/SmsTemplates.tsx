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
} from 'lucide-react'
import { cn, formatDateTime } from '../lib/utils'
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
  const [activeTab, setActiveTab] = useState<'templates' | 'logs'>('templates')
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

      {/* Preview Modal */}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-500 mb-2">{isAr ? 'النص العربي' : 'Arabic Body'}</p>
                <p className="text-sm text-healthcare-text whitespace-pre-wrap" dir="rtl">{showPreview.bodyAr}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-500 mb-2">{isAr ? 'النص الإنجليزي' : 'English Body'}</p>
                <p className="text-sm text-healthcare-text whitespace-pre-wrap" dir="ltr">{showPreview.bodyEn}</p>
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
