import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Brain,
  Search,
  Tag,
  TrendingUp,
  Users,
  Sparkles,
  Shield,
  Activity,
  Star,
  Eye,
} from 'lucide-react'
import { cn } from '../lib/utils'
import StatCard from '../components/ui/StatCard'

// ─── Mock data (TODO: replace with real API) ───────────────────────────────

interface MockPatient {
  patientId: string
  firstName: string
  lastName: string
  phone: string
  engagementScore: number
  lifetimeValue: number
  completionRate: number
  tags: string[]
  serviceInterests: string[]
  conditions: string[]
  channelPreference: string
  preferredTimeSlot: string | null
  lastInteractionAt: string
  satisfaction: string
}

const MOCK_PATIENTS: MockPatient[] = [
  {
    patientId: 'mock-1',
    firstName: 'محمد',
    lastName: 'العمري',
    phone: '+966512345678',
    engagementScore: 72,
    lifetimeValue: 9,
    completionRate: 0.75,
    tags: ['VIP', 'مرضى السكري', 'عميل دائم'],
    serviceInterests: ['تنظيف أسنان', 'فحص شامل', 'فحص نظر'],
    conditions: ['سكري نوع ثاني', 'ارتفاع ضغط الدم'],
    channelPreference: 'whatsapp',
    preferredTimeSlot: 'morning',
    lastInteractionAt: '2026-03-28T10:30:00Z',
    satisfaction: 'positive',
  },
  {
    patientId: 'mock-2',
    firstName: 'نورة',
    lastName: 'الحربي',
    phone: '+966555123456',
    engagementScore: 91,
    lifetimeValue: 15,
    completionRate: 0.93,
    tags: ['VIP', 'تأمين طبي', 'عميل دائم'],
    serviceInterests: ['جلدية', 'ليزر', 'تجميل'],
    conditions: [],
    channelPreference: 'phone',
    preferredTimeSlot: 'afternoon',
    lastInteractionAt: '2026-04-01T14:20:00Z',
    satisfaction: 'positive',
  },
  {
    patientId: 'mock-3',
    firstName: 'عبدالله',
    lastName: 'السعيد',
    phone: '+966501234567',
    engagementScore: 45,
    lifetimeValue: 3,
    completionRate: 0.5,
    tags: ['مرضى الضغط'],
    serviceInterests: ['أشعة', 'مختبر'],
    conditions: ['ارتفاع ضغط الدم'],
    channelPreference: 'web',
    preferredTimeSlot: 'evening',
    lastInteractionAt: '2026-03-15T09:00:00Z',
    satisfaction: 'neutral',
  },
  {
    patientId: 'mock-4',
    firstName: 'فاطمة',
    lastName: 'الزهراني',
    phone: '+966544567890',
    engagementScore: 83,
    lifetimeValue: 11,
    completionRate: 0.85,
    tags: ['حمل', 'تأمين طبي'],
    serviceInterests: ['نساء وولادة', 'سونار', 'تحاليل'],
    conditions: ['حمل — الشهر السابع'],
    channelPreference: 'whatsapp',
    preferredTimeSlot: 'morning',
    lastInteractionAt: '2026-04-02T08:15:00Z',
    satisfaction: 'positive',
  },
  {
    patientId: 'mock-5',
    firstName: 'خالد',
    lastName: 'المالكي',
    phone: '+966577890123',
    engagementScore: 28,
    lifetimeValue: 1,
    completionRate: 0.33,
    tags: [],
    serviceInterests: ['أسنان'],
    conditions: [],
    channelPreference: 'phone',
    preferredTimeSlot: null,
    lastInteractionAt: '2026-02-20T11:00:00Z',
    satisfaction: 'negative',
  },
  {
    patientId: 'mock-6',
    firstName: 'سارة',
    lastName: 'القحطاني',
    phone: '+966533456789',
    engagementScore: 67,
    lifetimeValue: 7,
    completionRate: 0.7,
    tags: ['عميل دائم', 'مرضى السكري'],
    serviceInterests: ['عيون', 'فحص شامل', 'تغذية'],
    conditions: ['سكري نوع أول'],
    channelPreference: 'whatsapp',
    preferredTimeSlot: 'morning',
    lastInteractionAt: '2026-03-30T10:00:00Z',
    satisfaction: 'positive',
  },
]

// All unique tags from mock data
const ALL_TAGS = ['VIP', 'مرضى السكري', 'عميل دائم', 'تأمين طبي', 'مرضى الضغط', 'حمل']
const ALL_INTERESTS = ['تنظيف أسنان', 'فحص شامل', 'فحص نظر', 'جلدية', 'ليزر', 'تجميل', 'أشعة', 'مختبر', 'نساء وولادة', 'سونار', 'تحاليل', 'أسنان', 'عيون', 'تغذية']

// ─── Component ──────────────────────────────────────────────────────────────

export default function KnowledgeBase() {
  const navigate = useNavigate()
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [selectedInterest, setSelectedInterest] = useState<string | null>(null)

  // TODO: replace with real API call
  const patients = MOCK_PATIENTS

  // Filter patients
  const filteredPatients = patients.filter(p => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!`${p.firstName} ${p.lastName}`.toLowerCase().includes(q) && !p.phone.includes(q)) return false
    }
    if (selectedTag && !p.tags.includes(selectedTag)) return false
    if (selectedInterest && !p.serviceInterests.includes(selectedInterest)) return false
    return true
  })

  // Compute overview stats
  const avgEngagement = Math.round(patients.reduce((s, p) => s + p.engagementScore, 0) / patients.length)
  const totalInterests = new Set(patients.flatMap(p => p.serviceInterests)).size
  const totalTags = new Set(patients.flatMap(p => p.tags)).size

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
          value={patients.length}
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
          value={totalInterests}
          label={isAr ? 'اهتمامات مكتشفة' : 'Interests Found'}
          iconBg="bg-purple-100"
          iconColor="text-purple-600"
        />
        <StatCard
          icon={Tag}
          value={totalTags}
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
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={isAr ? 'بحث بالاسم أو رقم الهاتف...' : 'Search by name or phone...'}
            className="input ps-10 w-full"
          />
        </div>

        {/* Tag Filters */}
        <div>
          <p className="text-xs font-medium text-healthcare-muted mb-2">{isAr ? 'تصفية بالتصنيف:' : 'Filter by tag:'}</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedTag(null)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
                !selectedTag
                  ? 'bg-primary-500 text-white border-primary-500'
                  : 'bg-white text-healthcare-muted border-healthcare-border hover:border-primary-300'
              )}
            >
              {isAr ? 'الكل' : 'All'}
            </button>
            {ALL_TAGS.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
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

        {/* Interest Filters */}
        <div>
          <p className="text-xs font-medium text-healthcare-muted mb-2">{isAr ? 'تصفية بالاهتمام:' : 'Filter by interest:'}</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedInterest(null)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
                !selectedInterest
                  ? 'bg-green-500 text-white border-green-500'
                  : 'bg-white text-healthcare-muted border-healthcare-border hover:border-green-300'
              )}
            >
              {isAr ? 'الكل' : 'All'}
            </button>
            {ALL_INTERESTS.map(interest => (
              <button
                key={interest}
                onClick={() => setSelectedInterest(selectedInterest === interest ? null : interest)}
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
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-healthcare-muted">
          {isAr
            ? `عرض ${filteredPatients.length} من ${patients.length} مريض`
            : `Showing ${filteredPatients.length} of ${patients.length} patients`
          }
        </p>
      </div>

      {/* Patient Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredPatients.map(p => (
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
                    <p className="text-xs text-healthcare-muted dir-ltr">{p.phone}</p>
                  </div>
                </div>
                {/* Engagement Score */}
                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2',
                  p.engagementScore >= 70
                    ? 'bg-green-50 text-green-600 border-green-200'
                    : p.engagementScore >= 40
                    ? 'bg-yellow-50 text-yellow-600 border-yellow-200'
                    : 'bg-red-50 text-red-500 border-red-200'
                )}>
                  {p.engagementScore}
                </div>
              </div>

              {/* Tags */}
              {p.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {p.tags.map(tag => (
                    <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary-50 text-primary-700 border border-primary-200">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Service Interests */}
              {p.serviceInterests.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] font-medium text-healthcare-muted uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-green-500" />
                    {isAr ? 'اهتمامات' : 'Interests'}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {p.serviceInterests.map(si => (
                      <span key={si} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">
                        {si}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Conditions */}
              {p.conditions.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] font-medium text-healthcare-muted uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <Shield className="h-3 w-3 text-blue-500" />
                    {isAr ? 'حالات صحية' : 'Conditions'}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {p.conditions.map(c => (
                      <span key={c} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Bottom Stats */}
              <div className="flex items-center justify-between pt-3 mt-3 border-t border-healthcare-border/20 text-xs text-healthcare-muted">
                <span className="flex items-center gap-1">
                  <Star className="h-3 w-3" />
                  {p.lifetimeValue} {isAr ? 'زيارة' : 'visits'}
                </span>
                <span className="flex items-center gap-1">
                  <Activity className="h-3 w-3" />
                  {Math.round(p.completionRate * 100)}% {isAr ? 'إتمام' : 'completion'}
                </span>
                <span className="flex items-center gap-1 capitalize">
                  {p.channelPreference}
                </span>
                <span className="text-primary-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                  <Eye className="h-3 w-3" />
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
