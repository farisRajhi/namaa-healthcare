import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  Brain,
  Search,
  Tag,
  TrendingUp,
  Users,
  Sparkles,
  Activity,
  Star,
  Eye,
  Loader2,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { api } from '../lib/api'
import StatCard from '../components/ui/StatCard'

export default function KnowledgeBase() {
  const navigate = useNavigate()
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [selectedInterest, setSelectedInterest] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['knowledge-base', { page, search: searchQuery, tag: selectedTag, serviceInterest: selectedInterest }],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '50' })
      if (searchQuery) params.set('search', searchQuery)
      if (selectedTag) params.set('tag', selectedTag)
      if (selectedInterest) params.set('serviceInterest', selectedInterest)
      const res = await api.get(`/api/patients/knowledge-summary?${params}`)
      return res.data
    },
  })

  const patients: any[] = data?.data || []
  const pagination = data?.pagination
  const allTags: string[] = data?.filters?.allTags || []
  const allInterests: string[] = data?.filters?.allServiceInterests || []

  // Helper extractors
  const getPhone = (p: any) => p.contacts?.find((c: any) => c.contactType === 'phone')?.contactValue || ''
  const getScore = (p: any) => p.insight?.engagementScore ?? 0
  const getTags = (p: any) => (p.tags || []).map((t: any) => t.tag)
  const getInterests = (p: any) => (p.memories || []).filter((m: any) => m.memoryType === 'service_interest').map((m: any) => m.memoryKey)
  const getChannel = (p: any) => p.insight?.channelPreference || '—'
  const getVisits = (p: any) => p.insight?.lifetimeValue ?? 0
  const getCompletion = (p: any) => p.insight?.completionRate ?? 0

  // Stats
  const totalPatients = pagination?.total ?? patients.length
  const avgEngagement = patients.length ? Math.round(patients.reduce((s, p) => s + getScore(p), 0) / patients.length) : 0

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-healthcare-text flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-400 to-primary-600 rounded-xl flex items-center justify-center shadow-lg">
              <Brain className="h-5 w-5 text-white" />
            </div>
            {isAr ? 'قاعدة معرفة المرضى' : 'Patient Knowledge Base'}
          </h1>
          <p className="text-sm text-healthcare-muted mt-1">
            {isAr ? 'رؤى وتحليلات سلوكية لجميع المرضى — للاستهداف الذكي في العروض والحملات' : 'Behavioral insights for all patients — smart targeting for offers & campaigns'}
          </p>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          value={totalPatients}
          label={isAr ? 'إجمالي المرضى' : 'Total Patients'}
          iconBg="bg-primary-100"
          iconColor="text-primary-600"
        />
        <StatCard
          icon={TrendingUp}
          value={avgEngagement}
          label={isAr ? 'متوسط التفاعل' : 'Avg Engagement'}
          iconBg="bg-green-100"
          iconColor="text-green-600"
        />
        <StatCard
          icon={Sparkles}
          value={allInterests.length}
          label={isAr ? 'اهتمامات مكتشفة' : 'Interests Found'}
          iconBg="bg-purple-100"
          iconColor="text-purple-600"
        />
        <StatCard
          icon={Tag}
          value={allTags.length}
          label={isAr ? 'تصنيفات نشطة' : 'Active Tags'}
          iconBg="bg-yellow-100"
          iconColor="text-yellow-600"
        />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-healthcare-border/30 shadow-sm p-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-healthcare-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setPage(1) }}
            placeholder={isAr ? 'بحث بالاسم أو رقم الهاتف...' : 'Search by name or phone...'}
            className="input ps-10 w-full"
          />
        </div>

        {/* Tag Filters */}
        {allTags.length > 0 && (
          <div>
            <p className="text-xs font-medium text-healthcare-muted mb-2">{isAr ? 'تصفية بالتصنيف:' : 'Filter by tag:'}</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setSelectedTag(null); setPage(1) }}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
                  !selectedTag
                    ? 'bg-primary-500 text-white border-primary-500'
                    : 'bg-white text-healthcare-muted border-healthcare-border hover:border-primary-300'
                )}
              >
                {isAr ? 'الكل' : 'All'}
              </button>
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => { setSelectedTag(selectedTag === tag ? null : tag); setPage(1) }}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
                    selectedTag === tag
                      ? 'bg-primary-500 text-white border-primary-500'
                      : 'bg-white text-healthcare-muted border-healthcare-border hover:border-primary-300'
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Interest Filters */}
        {allInterests.length > 0 && (
          <div>
            <p className="text-xs font-medium text-healthcare-muted mb-2">{isAr ? 'تصفية بالاهتمام:' : 'Filter by interest:'}</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setSelectedInterest(null); setPage(1) }}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
                  !selectedInterest
                    ? 'bg-green-500 text-white border-green-500'
                    : 'bg-white text-healthcare-muted border-healthcare-border hover:border-green-300'
                )}
              >
                {isAr ? 'الكل' : 'All'}
              </button>
              {allInterests.map(interest => (
                <button
                  key={interest}
                  onClick={() => { setSelectedInterest(selectedInterest === interest ? null : interest); setPage(1) }}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
                    selectedInterest === interest
                      ? 'bg-green-500 text-white border-green-500'
                      : 'bg-white text-healthcare-muted border-healthcare-border hover:border-green-300'
                  )}
                >
                  {interest}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-healthcare-muted">
          {isAr
            ? `عرض ${patients.length} من ${totalPatients} مريض`
            : `Showing ${patients.length} of ${totalPatients} patients`
          }
        </p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && patients.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-healthcare-muted">
          <Users className="h-12 w-12 mb-3 opacity-40" />
          <p>{isAr ? 'لا يوجد مرضى' : 'No patients found'}</p>
        </div>
      )}

      {/* Patient Cards */}
      {!isLoading && patients.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {patients.map(p => {
            const phone = getPhone(p)
            const score = getScore(p)
            const tags = getTags(p)
            const interests = getInterests(p)

            return (
              <div
                key={p.patientId}
                className="bg-white rounded-2xl border border-healthcare-border/30 shadow-sm hover:shadow-md transition-all hover:border-primary-200 cursor-pointer group"
                onClick={() => navigate(`/dashboard/patients/${p.patientId}`)}
              >
                <div className="p-5">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-md">
                        <span className="text-white font-bold text-sm">
                          {p.firstName.charAt(0)}{p.lastName.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-healthcare-text">{p.firstName} {p.lastName}</h3>
                        {phone && <p className="text-xs text-healthcare-muted dir-ltr">{phone}</p>}
                      </div>
                    </div>
                    {/* Engagement Score */}
                    <div className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2',
                      score >= 70
                        ? 'bg-green-50 text-green-600 border-green-200'
                        : score >= 40
                        ? 'bg-yellow-50 text-yellow-600 border-yellow-200'
                        : 'bg-red-50 text-red-500 border-red-200'
                    )}>
                      {score}
                    </div>
                  </div>

                  {/* Tags */}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {tags.map((tag: string) => (
                        <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary-50 text-primary-700 border border-primary-200">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Service Interests */}
                  {interests.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] font-medium text-healthcare-muted uppercase tracking-wide mb-1.5 flex items-center gap-1">
                        <Sparkles className="h-3 w-3 text-green-500" />
                        {isAr ? 'اهتمامات' : 'Interests'}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {interests.map((si: string) => (
                          <span key={si} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">
                            {si}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bottom Stats */}
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-healthcare-border/20 text-xs text-healthcare-muted">
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3" />
                      {getVisits(p)} {isAr ? 'زيارة' : 'visits'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Activity className="h-3 w-3" />
                      {Math.round(getCompletion(p) * 100)}% {isAr ? 'إتمام' : 'completion'}
                    </span>
                    <span className="flex items-center gap-1 capitalize">
                      {getChannel(p)}
                    </span>
                    <span className="text-primary-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                      <Eye className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg text-sm border border-healthcare-border disabled:opacity-40 hover:bg-healthcare-surface transition-colors"
          >
            {isAr ? 'السابق' : 'Previous'}
          </button>
          <span className="text-sm text-healthcare-muted">
            {isAr ? `صفحة ${page} من ${pagination.totalPages}` : `Page ${page} of ${pagination.totalPages}`}
          </span>
          <button
            onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
            disabled={page >= pagination.totalPages}
            className="px-3 py-1.5 rounded-lg text-sm border border-healthcare-border disabled:opacity-40 hover:bg-healthcare-surface transition-colors"
          >
            {isAr ? 'التالي' : 'Next'}
          </button>
        </div>
      )}
    </div>
  )
}
