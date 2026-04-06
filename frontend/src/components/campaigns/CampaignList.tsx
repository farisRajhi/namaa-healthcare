import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import { cn, formatDate } from '../../lib/utils'
import {
  Plus,
  Search,
  Megaphone,
  Users,
  PhoneCall,
  Shield,
  UserCheck,
  Smile,
  Bell,
  Gift,
  Send,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react'

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
  _count?: { targets: number }
}

const statusConfig: Record<string, { ar: string; en: string; color: string }> = {
  draft: { ar: 'مسودة', en: 'Draft', color: 'bg-gray-100 text-gray-700' },
  active: { ar: 'نشط', en: 'Active', color: 'bg-green-100 text-green-800' },
  paused: { ar: 'متوقف', en: 'Paused', color: 'bg-yellow-100 text-yellow-800' },
  completed: { ar: 'مكتمل', en: 'Completed', color: 'bg-blue-100 text-blue-800' },
}

const typeLabels: Record<string, { ar: string; en: string }> = {
  recall: { ar: 'استدعاء', en: 'Recall' },
  follow_up: { ar: 'متابعة', en: 'Follow-up' },
  reminder: { ar: 'تذكير', en: 'Reminder' },
  promotional: { ar: 'ترويجي', en: 'Promotional' },
  announcement: { ar: 'إعلان', en: 'Announcement' },
  preventive: { ar: 'وقائي', en: 'Preventive' },
  satisfaction: { ar: 'رضا', en: 'Satisfaction' },
  outreach: { ar: 'تواصل', en: 'Outreach' },
  survey: { ar: 'استبيان', en: 'Survey' },
}

const typeIconConfig: Record<string, { icon: LucideIcon; bg: string; color: string }> = {
  recall: { icon: PhoneCall, bg: 'bg-amber-50', color: 'text-amber-600' },
  preventive: { icon: Shield, bg: 'bg-green-50', color: 'text-green-600' },
  follow_up: { icon: UserCheck, bg: 'bg-blue-50', color: 'text-blue-600' },
  satisfaction: { icon: Smile, bg: 'bg-pink-50', color: 'text-pink-600' },
  announcement: { icon: Megaphone, bg: 'bg-indigo-50', color: 'text-indigo-600' },
  promotional: { icon: Gift, bg: 'bg-purple-50', color: 'text-purple-600' },
  reminder: { icon: Bell, bg: 'bg-cyan-50', color: 'text-cyan-600' },
  outreach: { icon: Send, bg: 'bg-teal-50', color: 'text-teal-600' },
  survey: { icon: ClipboardList, bg: 'bg-orange-50', color: 'text-orange-600' },
}

const statusBorderMap: Record<string, string> = {
  draft: 'border-s-4 border-s-gray-300',
  active: 'border-s-4 border-s-green-400',
  paused: 'border-s-4 border-s-amber-400',
  completed: 'border-s-4 border-s-blue-400',
}

interface CampaignListProps {
  onSelect: (campaign: Campaign) => void
  onCreateNew: () => void
}

export default function CampaignList({ onSelect, onCreateNew }: CampaignListProps) {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { user } = useAuth()
  const orgId = user?.org?.id || ''

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const { data: campaigns, isLoading } = useQuery<Campaign[]>({

    queryKey: ['campaigns', { search, orgId, statusFilter }],
    queryFn: async () => {
      if (!orgId) return []
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const res = await api.get(`/api/outbound/campaigns/org/${orgId}?${params}`)
      const data = res.data?.data || res.data || []
      return Array.isArray(data) ? data : []
    },
    enabled: !!orgId,
  })

  const statusFilters = [
    { key: 'all', ar: 'الكل', en: 'All' },
    { key: 'draft', ar: 'مسودة', en: 'Draft' },
    { key: 'active', ar: 'نشط', en: 'Active' },
    { key: 'completed', ar: 'مكتمل', en: 'Completed' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">
            {isAr ? 'الحملات' : 'Campaigns'}
          </h1>
          <p className="text-healthcare-muted">
            {isAr ? 'إنشاء وإدارة حملات التواصل مع المرضى' : 'Create and manage patient outreach campaigns'}
          </p>
        </div>
        <button onClick={onCreateNew} className="btn-primary">
          <Plus className="h-5 w-5" />
          {isAr ? 'حملة جديدة' : 'New Campaign'}
        </button>
      </div>

      {/* Search + Status Tabs */}
      <div className="space-y-3">
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
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {statusFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                statusFilter === f.key
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {isAr ? f.ar : f.en}
            </button>
          ))}
        </div>
      </div>

      {/* Campaign Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="loading-spinner" />
        </div>
      ) : (campaigns || []).length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
          <Megaphone className="h-12 w-12 mb-3 text-gray-300" />
          <p className="font-medium">{isAr ? 'لا توجد حملات' : 'No campaigns found'}</p>
          <p className="text-sm text-gray-400 mt-1">
            {isAr ? 'أنشئ حملة جديدة للبدء' : 'Create a new campaign to get started'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {(campaigns || []).map((campaign) => {
            const status = statusConfig[campaign.status] || statusConfig.draft
            const type = typeLabels[campaign.type] || { ar: campaign.type, en: campaign.type }
            const targets = campaign._count?.targets || campaign.targetsCount || 0
            const typeIcon = typeIconConfig[campaign.type] || typeIconConfig.outreach
            const TypeIcon = typeIcon.icon
            const borderClass = statusBorderMap[campaign.status] || statusBorderMap.draft

            return (
              <button
                key={campaign.campaignId}
                type="button"
                onClick={() => onSelect(campaign)}
                className={cn(
                  'card p-4 w-full text-start hover:shadow-md hover:border-primary-200 transition-all group',
                  borderClass,
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn('p-2 rounded-lg shrink-0', typeIcon.bg)}>
                      <TypeIcon className={cn('h-5 w-5', typeIcon.color)} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-healthcare-text truncate group-hover:text-primary-700 transition-colors">
                        {isAr ? (campaign.nameAr || campaign.name) : campaign.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-500">
                          {isAr ? type.ar : type.en}
                        </span>
                        <span className="text-gray-300">|</span>
                        <span className="text-xs text-gray-400">
                          {campaign.createdAt ? formatDate(campaign.createdAt) : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-end">
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <Users className="h-3.5 w-3.5 text-gray-400" />
                        {targets}
                      </div>
                      {campaign.conversionRate > 0 && (
                        <span className="text-xs text-green-600 font-medium">
                          {campaign.conversionRate}% {isAr ? 'تحويل' : 'conv.'}
                        </span>
                      )}
                    </div>
                    <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium', status.color)}>
                      {isAr ? status.ar : status.en}
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export { typeLabels, statusConfig }
export type { Campaign }
