import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
// utils
import SegmentCard from '../components/campaigns/SegmentCard'
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import {
  Activity,
  TrendingUp,
  CalendarDays,
  Users,
  Megaphone,
} from 'lucide-react'
import StatCard from '../components/ui/StatCard'

import type { TopService, TopPatient } from '../components/campaigns/SegmentCard'

interface Segment {
  key: string
  labelAr: string
  labelEn: string
  description: string
  descriptionAr: string
  icon: string
  color: string
  count: number
  rank: number
  avgScore: number
  topServices: TopService[]
  topPatients: TopPatient[]
}

interface BehaviorPatterns {
  totalPatients: number
  engagementDistribution: { bucket: string; min: number; max: number; count: number }[]
  returnLikelihoodDistribution: { bucket: string; min: number; max: number; count: number }[]
  dayOfWeekDistribution: { day: number; label: string; labelAr: string; count: number }[]
  timeSlotDistribution: { slot: string; labelAr: string; count: number }[]
  channelPreferenceDistribution: { channel: string; labelAr: string; count: number }[]
  averages: {
    engagementScore: number
    returnLikelihood: number
    lifetimeValue: number
    visitIntervalDays: number
  }
}

const CHART_COLORS = ['#0891B2', '#14B8A6', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4']

export default function PatientInsights() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { user } = useAuth()
  const navigate = useNavigate()
  const orgId = user?.org?.id || ''

  // Fetch segments
  const { data: segmentsData, isLoading: segLoading } = useQuery<{ segments: Segment[] }>({
    queryKey: ['audience-segments', orgId],
    queryFn: async () => {
      const { data } = await api.get(`/api/audience/${orgId}/segments`)
      return data
    },
    enabled: !!orgId,
    staleTime: 60_000,
  })

  // Fetch behavior patterns
  const { data: patterns, isLoading: patLoading } = useQuery<BehaviorPatterns>({
    queryKey: ['behavior-patterns', orgId],
    queryFn: async () => {
      const { data } = await api.get(`/api/audience/${orgId}/behavior-patterns`)
      return data
    },
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const segments = segmentsData?.segments || []
  const isLoading = segLoading || patLoading

  const fmt = (n: number) => n.toLocaleString(isAr ? 'ar-SA' : 'en-US')

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="page-title">
          {isAr ? 'تحليلات المرضى' : 'Patient Insights'}
        </h1>
        <p className="text-healthcare-muted">
          {isAr
            ? 'نظرة شاملة على سلوك المرضى وأنماط التفاعل في عيادتك'
            : 'Overview of patient behavior and engagement patterns in your clinic'}
        </p>
      </div>

      {/* Summary Stats */}
      {patterns && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            icon={Users}
            label={isAr ? 'إجمالي المرضى' : 'Total Patients'}
            value={fmt(patterns.totalPatients)}
            iconBg="bg-primary-100"
            iconColor="text-primary-600"
          />
          <StatCard
            icon={Activity}
            label={isAr ? 'متوسط التفاعل' : 'Avg Engagement'}
            value={`${patterns.averages.engagementScore}/100`}
            iconBg="bg-green-100"
            iconColor="text-green-600"
          />
          <StatCard
            icon={TrendingUp}
            label={isAr ? 'احتمال العودة' : 'Avg Return Likelihood'}
            value={`${patterns.averages.returnLikelihood}/100`}
            iconBg="bg-blue-100"
            iconColor="text-blue-600"
          />
          <StatCard
            icon={CalendarDays}
            label={isAr ? 'متوسط فترة الزيارة' : 'Avg Visit Interval'}
            value={`${patterns.averages.visitIntervalDays || '—'} ${isAr ? 'يوم' : 'days'}`}
            iconBg="bg-amber-100"
            iconColor="text-amber-600"
          />
        </div>
      )}

      {/* Segment Overview — Ranked */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-heading font-semibold text-healthcare-text">
              {isAr ? 'شرائح المرضى — مرتبة حسب الأولوية' : 'Patient Segments — Ranked by Priority'}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              {isAr
                ? 'كلما زاد الرقم، زادت احتمالية عودة المرضى. الخدمات المقترحة تظهر داخل كل شريحة'
                : 'Higher score = more likely to convert. Suggested services shown inside each segment card'}
            </p>
          </div>
          <button
            onClick={() => navigate('/dashboard/campaigns')}
            className="text-sm text-primary-600 hover:underline flex items-center gap-1 shrink-0"
          >
            <Megaphone className="h-4 w-4" />
            {isAr ? 'إنشاء حملة' : 'Create Campaign'}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...segments]
            .sort((a, b) => (a.rank || 99) - (b.rank || 99))
            .map((seg) => (
              <SegmentCard
                key={seg.key}
                label={seg.labelEn}
                labelAr={seg.labelAr}
                description={seg.description}
                descriptionAr={seg.descriptionAr}
                icon={seg.icon}
                color={seg.color}
                count={seg.count}
                rank={seg.rank}
                avgScore={seg.avgScore}
                topServices={seg.topServices}
                topPatients={seg.topPatients}
                isAr={isAr}
                isLoading={segLoading}
                expanded={true}
                onClick={() => navigate('/dashboard/campaigns')}
                onCreateCampaign={() => navigate('/dashboard/campaigns')}
                onSendOffer={() => navigate('/dashboard/offers')}
              />
            ))}
        </div>
      </section>

      {/* Charts Grid */}
      {patterns && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Engagement Distribution */}
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">
              {isAr ? 'توزيع معدل التفاعل' : 'Engagement Score Distribution'}
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={patterns.engagementDistribution}>
                  <defs>
                    <linearGradient id="engageGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0891B2" stopOpacity={1} />
                      <stop offset="100%" stopColor="#0891B2" stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number) => [value, isAr ? 'مرضى' : 'Patients']}
                  />
                  <Bar dataKey="count" fill="url(#engageGradient)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Return Likelihood Distribution — Area Chart */}
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">
              {isAr ? 'توزيع احتمال العودة' : 'Return Likelihood Distribution'}
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={patterns.returnLikelihoodDistribution}>
                  <defs>
                    <linearGradient id="returnGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#14B8A6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#14B8A6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number) => [value, isAr ? 'مرضى' : 'Patients']}
                  />
                  <Area type="monotone" dataKey="count" stroke="#14B8A6" fill="url(#returnGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Day of Week Preference — Radar Chart */}
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">
              {isAr ? 'تفضيل أيام الأسبوع' : 'Day of Week Preference'}
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart
                  data={patterns.dayOfWeekDistribution.map((d) => ({
                    ...d,
                    name: isAr ? d.labelAr : d.label.substring(0, 3),
                  }))}
                >
                  <PolarGrid stroke="#E5E7EB" />
                  <PolarAngleAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => [value, isAr ? 'مرضى' : 'Patients']} />
                  <Radar dataKey="count" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.3} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Channel Preference */}
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">
              {isAr ? 'تفضيل القنوات' : 'Channel Preference'}
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={patterns.channelPreferenceDistribution.map((d) => ({
                      name: isAr ? d.labelAr : d.channel,
                      value: d.count,
                    }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {patterns.channelPreferenceDistribution.map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Time Slot Preference */}
          <div className="card p-6 lg:col-span-2">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">
              {isAr ? 'تفضيل الأوقات' : 'Time Slot Preference'}
            </h3>
            <div className="grid grid-cols-3 gap-4">
              {patterns.timeSlotDistribution.map((slot) => {
                const maxCount = Math.max(...patterns.timeSlotDistribution.map((s) => s.count), 1)
                const pct = Math.round((slot.count / maxCount) * 100)
                const slotEmoji = slot.slot === 'morning' ? '🌅' : slot.slot === 'afternoon' ? '☀️' : '🌙'
                const slotLabel = slot.slot === 'morning'
                  ? (isAr ? 'صباحي' : 'Morning')
                  : slot.slot === 'afternoon'
                    ? (isAr ? 'بعد الظهر' : 'Afternoon')
                    : (isAr ? 'مسائي' : 'Evening')

                return (
                  <div
                    key={slot.slot}
                    className="text-center p-4 bg-gray-50 rounded-xl"
                  >
                    <span className="text-3xl mb-2 block">{slotEmoji}</span>
                    <p className="font-semibold text-gray-800">{slotLabel}</p>
                    <p className="text-2xl font-bold text-primary-700 mt-1">{slot.count}</p>
                    <div className="mt-2 h-2 bg-gray-200 rounded-full">
                      <div
                        className="h-full bg-primary-400 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center h-64">
          <div className="loading-spinner" />
        </div>
      )}
    </div>
  )
}

