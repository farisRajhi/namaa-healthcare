import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import {
  Plus,
  Search,
  Megaphone,
  Users,
  ArrowRight,
  ArrowLeft,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn, formatDate } from '../lib/utils'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface Campaign {
  campaignId: string
  name: string
  nameAr?: string
  type: string
  status: string
  targetsCount: number
  sentCount: number
  respondedCount: number
  conversionRate: number
  createdAt: string
  channelSequence?: string[]
  scriptEn?: string
  scriptAr?: string
  targetFilter?: Record<string, any>
  results?: { label: string; value: number }[]
  targets?: CampaignTarget[]
}

interface CampaignTarget {
  targetId: string
  patientName?: string
  phone?: string
  status: string
  lastContactAt?: string
}

const statusConfig: Record<string, { ar: string; en: string; color: string }> = {
  draft: { ar: 'مسودة', en: 'Draft', color: 'bg-primary-50/50 text-gray-800' },
  active: { ar: 'نشط', en: 'Active', color: 'bg-green-100 text-green-800' },
  paused: { ar: 'متوقف', en: 'Paused', color: 'bg-yellow-100 text-yellow-800' },
  completed: { ar: 'مكتمل', en: 'Completed', color: 'bg-blue-100 text-blue-800' },
}

const typeLabels: Record<string, { ar: string; en: string }> = {
  recall: { ar: 'استدعاء', en: 'Recall' },
  preventive: { ar: 'وقائي', en: 'Preventive' },
  follow_up: { ar: 'متابعة', en: 'Follow-up' },
  satisfaction: { ar: 'رضا', en: 'Satisfaction' },
  announcement: { ar: 'إعلان', en: 'Announcement' },
  reminder: { ar: 'تذكير', en: 'Reminder' },
  outreach: { ar: 'تواصل', en: 'Outreach' },
  survey: { ar: 'استبيان', en: 'Survey' },
}

export default function Campaigns() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const orgId = user?.org?.id || ''

  const [search, setSearch] = useState('')
  const [showWizard, setShowWizard] = useState(false)
  const [wizardStep, setWizardStep] = useState(0)
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)

  const [wizardData, setWizardData] = useState({
    name: '',
    type: 'recall' as string,
    targetFilter: { minAge: '', maxAge: '', lastVisitDaysAgo: '' } as Record<string, any>,
    channelSequence: ['sms'] as string[],
    scriptEn: '',
    scriptAr: '',
  })

  // Backend: GET /api/outbound/campaigns/org/:orgId
  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ['campaigns', { search, orgId }],
    queryFn: async () => {
      try {
        if (!orgId) return []
        const params = new URLSearchParams()
        if (search) params.set('search', search)
        const res = await api.get(`/api/outbound/campaigns/org/${orgId}?${params}`)
        // Backend returns { data: [...], pagination } or direct array
        const data = res.data?.data || res.data || []
        return Array.isArray(data) ? data : []
      } catch {
        return []
      }
    },
    enabled: !!orgId,
  })

  // Backend: POST /api/outbound/campaigns
  const createMutation = useMutation({
    mutationFn: (data: typeof wizardData) => api.post('/api/outbound/campaigns', {
      name: data.name,
      type: data.type,
      targetFilter: {
        ...(data.targetFilter.minAge ? { minAge: Number(data.targetFilter.minAge) } : {}),
        ...(data.targetFilter.maxAge ? { maxAge: Number(data.targetFilter.maxAge) } : {}),
        ...(data.targetFilter.lastVisitDaysAgo ? { lastVisitDaysAgo: Number(data.targetFilter.lastVisitDaysAgo) } : {}),
      },
      channelSequence: data.channelSequence,
      scriptEn: data.scriptEn || undefined,
      scriptAr: data.scriptAr || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      setShowWizard(false)
      setWizardStep(0)
      setWizardData({ name: '', type: 'recall', targetFilter: { minAge: '', maxAge: '', lastVisitDaysAgo: '' }, channelSequence: ['sms'], scriptEn: '', scriptAr: '' })
    },
  })

  // Backend: GET /api/outbound/campaigns/:id
  const { data: campaignDetail } = useQuery<Campaign>({
    queryKey: ['campaigns', selectedCampaign?.campaignId],
    queryFn: async () => {
      try {
        const res = await api.get(`/api/outbound/campaigns/${selectedCampaign!.campaignId}`)
        return res.data
      } catch {
        return selectedCampaign
      }
    },
    enabled: !!selectedCampaign,
  })

  const wizardSteps = [
    { ar: 'الاسم والنوع', en: 'Name & Type' },
    { ar: 'الجمهور المستهدف', en: 'Audience' },
    { ar: 'القنوات', en: 'Channels' },
    { ar: 'النص', en: 'Script' },
    { ar: 'مراجعة', en: 'Review' },
  ]

  const toggleChannel = (ch: string) => {
    setWizardData(prev => ({
      ...prev,
      channelSequence: prev.channelSequence.includes(ch)
        ? prev.channelSequence.filter(c => c !== ch)
        : [...prev.channelSequence, ch],
    }))
  }

  if (selectedCampaign) {
    const detail = campaignDetail || selectedCampaign
    const status = statusConfig[detail.status] || statusConfig.draft
    const progress = detail.targetsCount > 0 ? Math.round((detail.sentCount / detail.targetsCount) * 100) : 0

    return (
      <div className="space-y-6 animate-fade-in">
        <button
          onClick={() => setSelectedCampaign(null)}
          className="flex items-center gap-2 text-primary-600 hover:underline"
        >
          {isAr ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          {isAr ? 'العودة للحملات' : 'Back to Campaigns'}
        </button>

        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="page-title">{isAr ? (detail.nameAr || detail.name) : detail.name}</h1>
            <div className="flex items-center gap-3 mt-2">
              <span className={cn('px-2 py-1 rounded text-xs font-medium', status.color)}>
                {isAr ? status.ar : status.en}
              </span>
              <span className="text-sm text-gray-500">
                {isAr ? typeLabels[detail.type]?.ar : typeLabels[detail.type]?.en}
              </span>
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">{isAr ? 'التقدم' : 'Progress'}</span>
            <span className="text-sm page-subtitle">{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-primary-600 h-3 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="text-center">
              <p className="page-title">{detail.targetsCount || 0}</p>
              <p className="text-xs page-subtitle">{isAr ? 'المستهدفين' : 'Targets'}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{detail.sentCount || 0}</p>
              <p className="text-xs page-subtitle">{isAr ? 'تم الإرسال' : 'Sent'}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{detail.respondedCount || 0}</p>
              <p className="text-xs page-subtitle">{isAr ? 'استجابوا' : 'Responded'}</p>
            </div>
          </div>
        </div>

        {/* Results Chart */}
        {detail.results && detail.results.length > 0 && (
          <div className="card p-6">
            <h3 className="text-lg font-semibold mb-4">{isAr ? 'النتائج' : 'Results'}</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={detail.results}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Target List */}
        {detail.targets && detail.targets.length > 0 && (
          <div className="table-container overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-heading font-semibold text-healthcare-text">{isAr ? 'قائمة المستهدفين' : 'Target List'}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-healthcare-bg">
                  <tr>
                    <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{isAr ? 'المريض' : 'Patient'}</th>
                    <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{isAr ? 'الهاتف' : 'Phone'}</th>
                    <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{isAr ? 'الحالة' : 'Status'}</th>
                    <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{isAr ? 'آخر تواصل' : 'Last Contact'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {detail.targets.map((target) => (
                    <tr key={target.targetId} className="hover:bg-healthcare-bg">
                      <td className="px-6 py-4 font-medium text-healthcare-text">{target.patientName || target.targetId?.substring(0, 8)}</td>
                      <td className="px-6 py-4 text-sm text-gray-500 dir-ltr">{target.phone || '-'}</td>
                      <td className="px-6 py-4">
                        <span className={cn('px-2 py-1 rounded text-xs font-medium capitalize',
                          target.status === 'converted' ? 'bg-green-100 text-green-800' :
                          target.status === 'failed' ? 'bg-red-100 text-red-800' :
                          target.status === 'responded' ? 'bg-blue-100 text-blue-800' :
                          target.status === 'contacted' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-primary-50/50 text-gray-800'
                        )}>
                          {target.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {target.lastContactAt ? formatDate(target.lastContactAt) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">
            {isAr ? 'إدارة الحملات' : 'Campaign Management'}
          </h1>
          <p className="text-healthcare-muted">
            {isAr ? 'إنشاء وإدارة حملات التواصل مع المرضى' : 'Create and manage patient outreach campaigns'}
          </p>
        </div>
        <button
          onClick={() => setShowWizard(true)}
          className="btn-primary"
        >
          <Plus className="h-5 w-5" />
          {isAr ? 'حملة جديدة' : 'New Campaign'}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          placeholder={isAr ? 'بحث في الحملات...' : 'Search campaigns...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full ps-10 pe-4 py-2 border border-gray-300 rounded-lg focus:ring-primary-400/20 focus:border-primary-500"
        />
      </div>

      {/* Campaigns List */}
      <div className="table-container overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="loading-spinner"></div>
          </div>
        ) : (campaigns || []).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Megaphone className="h-12 w-12 mb-3 text-gray-300" />
            <p>{isAr ? 'لا توجد حملات' : 'No campaigns found'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-healthcare-bg">
                <tr>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{isAr ? 'الحملة' : 'Campaign'}</th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{isAr ? 'النوع' : 'Type'}</th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{isAr ? 'المستهدفين' : 'Targets'}</th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{isAr ? 'معدل التحويل' : 'Conversion'}</th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{isAr ? 'التاريخ' : 'Created'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {(campaigns || []).map((campaign) => {
                  const status = statusConfig[campaign.status] || statusConfig.draft
                  const type = typeLabels[campaign.type] || { ar: campaign.type, en: campaign.type }
                  return (
                    <tr
                      key={campaign.campaignId}
                      className="hover:bg-primary-50/30 cursor-pointer"
                      onClick={() => setSelectedCampaign(campaign)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Megaphone className="h-5 w-5 text-primary-500" />
                          <span className="font-medium text-healthcare-text">{isAr ? (campaign.nameAr || campaign.name) : campaign.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {isAr ? type.ar : type.en}
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn('px-2 py-1 rounded text-xs font-medium', status.color)}>
                          {isAr ? status.ar : status.en}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-700">{campaign.targetsCount || 0}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-gray-700">
                          {campaign.conversionRate || 0}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {campaign.createdAt ? formatDate(campaign.createdAt) : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Campaign Wizard */}
      {showWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-heading font-semibold text-healthcare-text">
                {isAr ? 'إنشاء حملة جديدة' : 'Create New Campaign'}
              </h2>
              <button onClick={() => { setShowWizard(false); setWizardStep(0) }} className="p-1 hover:bg-primary-50 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Steps indicator */}
            <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
              {wizardSteps.map((step, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
                    idx <= wizardStep ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-500'
                  )}>
                    {idx + 1}
                  </div>
                  <span className={cn('text-sm whitespace-nowrap', idx <= wizardStep ? 'text-primary-600' : 'text-gray-400')}>
                    {isAr ? step.ar : step.en}
                  </span>
                  {idx < wizardSteps.length - 1 && <div className="w-8 h-0.5 bg-gray-200" />}
                </div>
              ))}
            </div>

            {/* Step Content */}
            <div className="min-h-[200px]">
              {wizardStep === 0 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{isAr ? 'اسم الحملة' : 'Campaign Name'}</label>
                    <input
                      type="text"
                      value={wizardData.name}
                      onChange={(e) => setWizardData({ ...wizardData, name: e.target.value })}
                      className="input focus:ring-primary-400/20 focus:border-primary-500"
                      placeholder={isAr ? 'مثال: تذكير الفحص السنوي' : 'e.g., Annual Checkup Reminder'}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{isAr ? 'النوع' : 'Type'}</label>
                    <select
                      value={wizardData.type}
                      onChange={(e) => setWizardData({ ...wizardData, type: e.target.value })}
                      className="input focus:ring-primary-400/20 focus:border-primary-500"
                    >
                      {Object.entries(typeLabels).map(([key, label]) => (
                        <option key={key} value={key}>{isAr ? label.ar : label.en}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {wizardStep === 1 && (
                <div className="space-y-4">
                  <p className="text-sm page-subtitle">{isAr ? 'تحديد الجمهور المستهدف' : 'Define target audience filters'}</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{isAr ? 'العمر (من)' : 'Min Age'}</label>
                      <input
                        type="number"
                        value={wizardData.targetFilter.minAge}
                        onChange={(e) => setWizardData({ ...wizardData, targetFilter: { ...wizardData.targetFilter, minAge: e.target.value } })}
                        className="input focus:ring-primary-400/20 focus:border-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{isAr ? 'العمر (إلى)' : 'Max Age'}</label>
                      <input
                        type="number"
                        value={wizardData.targetFilter.maxAge}
                        onChange={(e) => setWizardData({ ...wizardData, targetFilter: { ...wizardData.targetFilter, maxAge: e.target.value } })}
                        className="input focus:ring-primary-400/20 focus:border-primary-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{isAr ? 'آخر زيارة (أيام)' : 'Last Visit (days ago)'}</label>
                    <input
                      type="number"
                      value={wizardData.targetFilter.lastVisitDaysAgo}
                      onChange={(e) => setWizardData({ ...wizardData, targetFilter: { ...wizardData.targetFilter, lastVisitDaysAgo: e.target.value } })}
                      className="input focus:ring-primary-400/20 focus:border-primary-500"
                      placeholder={isAr ? 'مثال: 90' : 'e.g., 90'}
                    />
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="space-y-4">
                  <p className="text-sm page-subtitle">{isAr ? 'اختر قنوات التواصل' : 'Select communication channels'}</p>
                  <div className="grid grid-cols-3 gap-3">
                    {['sms', 'whatsapp', 'voice'].map((ch) => (
                      <button
                        key={ch}
                        onClick={() => toggleChannel(ch)}
                        className={cn(
                          'p-4 rounded-lg border-2 text-start transition-colors',
                          wizardData.channelSequence.includes(ch)
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-healthcare-border/20 hover:border-gray-300'
                        )}
                      >
                        <p className="font-medium capitalize">{ch === 'whatsapp' ? 'WhatsApp' : ch.toUpperCase()}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {wizardStep === 3 && (
                <div className="space-y-4">
                  <p className="text-sm page-subtitle">{isAr ? 'اكتب نص الرسالة' : 'Write the campaign script'}</p>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{isAr ? 'النص العربي' : 'Arabic Script'}</label>
                    <textarea
                      rows={3}
                      value={wizardData.scriptAr}
                      onChange={(e) => setWizardData({ ...wizardData, scriptAr: e.target.value })}
                      className="input focus:ring-primary-400/20 focus:border-primary-500"
                      placeholder="مرحباً {اسم_المريض}، حان وقت فحصك السنوي..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{isAr ? 'النص الإنجليزي' : 'English Script'}</label>
                    <textarea
                      rows={3}
                      value={wizardData.scriptEn}
                      onChange={(e) => setWizardData({ ...wizardData, scriptEn: e.target.value })}
                      className="input focus:ring-primary-400/20 focus:border-primary-500"
                      placeholder="Hello {patient_name}, it's time for your annual checkup..."
                    />
                  </div>
                </div>
              )}

              {wizardStep === 4 && (
                <div className="space-y-4">
                  <h3 className="font-semibold">{isAr ? 'مراجعة الحملة' : 'Campaign Review'}</h3>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm page-subtitle">{isAr ? 'الاسم' : 'Name'}</span>
                      <span className="font-medium">{wizardData.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm page-subtitle">{isAr ? 'النوع' : 'Type'}</span>
                      <span className="font-medium">{isAr ? typeLabels[wizardData.type]?.ar : typeLabels[wizardData.type]?.en}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm page-subtitle">{isAr ? 'القنوات' : 'Channels'}</span>
                      <span className="font-medium">{wizardData.channelSequence.join(', ')}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex justify-between mt-6 pt-4 border-t">
              <button
                onClick={() => wizardStep > 0 ? setWizardStep(wizardStep - 1) : setShowWizard(false)}
                className="px-4 py-2 border rounded-lg hover:bg-primary-50/30"
              >
                {wizardStep === 0 ? (isAr ? 'إلغاء' : 'Cancel') : (isAr ? 'السابق' : 'Previous')}
              </button>
              {wizardStep < wizardSteps.length - 1 ? (
                <button
                  onClick={() => setWizardStep(wizardStep + 1)}
                  className="btn-primary"
                >
                  {isAr ? 'التالي' : 'Next'}
                  {isAr ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                </button>
              ) : (
                <button
                  onClick={() => createMutation.mutate(wizardData)}
                  disabled={createMutation.isPending || !wizardData.name}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? (isAr ? 'جاري الإنشاء...' : 'Creating...') : (isAr ? 'إنشاء الحملة' : 'Create Campaign')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
