import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import StatCard from '../components/ui/StatCard'
import ConsentDashboard from '../components/marketing/ConsentDashboard'
import MarketingOnboarding from '../components/marketing/MarketingOnboarding'
import {
  Megaphone,
  Target,
  MessageSquare,
  ShieldCheck,
  Brain,
  Tag,
  Users,
  Bell,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'

const CHART_COLORS = ['#22c55e', '#3b82f6', '#ef4444', '#9ca3af']

interface CampaignSummary {
  campaignId: string
  name: string
  nameAr?: string
  status: string
  type: string
  targetsCount: number
  sentCount: number
  conversionRate: number
  createdAt: string
}

export default function MarketingHub() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { user } = useAuth()
  const navigate = useNavigate()
  const orgId = user?.org?.id || ''
  const Arrow = isAr ? ArrowLeft : ArrowRight

  const { data: campaigns } = useQuery<CampaignSummary[]>({
    queryKey: ['campaigns-hub', orgId],
    queryFn: async () => {
      const res = await api.get(`/api/outbound/campaigns/org/${orgId}?limit=50`)
      const data = res.data?.data || res.data || []
      return Array.isArray(data) ? data : []
    },
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const { data: reminderStats } = useQuery({
    queryKey: ['reminders-hub', orgId],
    queryFn: async () => {
      const res = await api.get(`/api/reminders/stats/${orgId}`)
      return res.data
    },
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const { data: smsLogs } = useQuery({
    queryKey: ['sms-stats-hub', orgId],
    queryFn: async () => {
      const res = await api.get(`/api/sms-logs/${orgId}?limit=1`)
      return res.data
    },
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const { data: templates } = useQuery({
    queryKey: ['templates-hub', orgId],
    queryFn: async () => {
      const res = await api.get(`/api/sms-templates/${orgId}`)
      return res.data?.data || res.data || []
    },
    enabled: !!orgId,
    staleTime: 120_000,
  })

  // Compute KPIs
  const activeCampaigns = campaigns?.filter((c) => c.status === 'active').length || 0
  const totalReach = campaigns?.reduce((s, c) => s + (c.sentCount || 0), 0) || 0
  const smsDelivered = smsLogs?.total || smsLogs?.count || 0
  const reminderConfirmRate = reminderStats
    ? reminderStats.totalSent > 0
      ? Math.round(((reminderStats.confirmed || 0) / reminderStats.totalSent) * 100)
      : 0
    : 0

  // Reminder pie data
  const reminderPieData = reminderStats
    ? [
        { name: isAr ? 'تأكيد' : 'Confirmed', value: reminderStats.confirmed || 0 },
        { name: isAr ? 'معلق' : 'Pending', value: reminderStats.pending || reminderStats.noResponse || 0 },
        { name: isAr ? 'ملغي' : 'Cancelled', value: reminderStats.cancelled || 0 },
        { name: isAr ? 'بلا رد' : 'No response', value: reminderStats.noResponse || 0 },
      ].filter((d) => d.value > 0)
    : []

  // Recent campaigns for mini trend
  const recentCampaigns = (campaigns || [])
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 7)
    .reverse()
    .map((c) => ({
      name: c.name.slice(0, 10),
      sent: c.sentCount || 0,
      targets: c.targetsCount || 0,
    }))

  const quickLinks = [
    { label: isAr ? 'الحملات' : 'Campaigns', labelSub: isAr ? 'إنشاء وإدارة الحملات' : 'Create & manage campaigns', icon: Megaphone, href: '/dashboard/campaigns', color: 'bg-primary-100 text-primary-600' },
    { label: isAr ? 'العروض' : 'Offers', labelSub: isAr ? 'عروض ترويجية وأكواد خصم' : 'Promos & discount codes', icon: Tag, href: '/dashboard/offers', color: 'bg-purple-100 text-purple-600' },
    { label: isAr ? 'تحليلات المرضى' : 'Patient Insights', labelSub: isAr ? 'شرائح وسلوك المرضى' : 'Segments & behavior', icon: Users, href: '/dashboard/patient-insights', color: 'bg-blue-100 text-blue-600' },
    { label: isAr ? 'التذكيرات' : 'Reminders', labelSub: isAr ? 'تذكيرات المواعيد التلقائية' : 'Auto appointment reminders', icon: Bell, href: '/dashboard/reminders', color: 'bg-amber-100 text-amber-600' },
    { label: isAr ? 'قوالب الرسائل' : 'SMS Templates', labelSub: isAr ? 'قوالب الرسائل النصية' : 'Message templates', icon: MessageSquare, href: '/dashboard/sms-templates', color: 'bg-teal-100 text-teal-600' },
    { label: isAr ? 'قاعدة المعرفة' : 'Knowledge Base', labelSub: isAr ? 'إدارة الأسئلة الشائعة' : 'FAQ management', icon: Brain, href: '/dashboard/knowledge-base', color: 'bg-green-100 text-green-600' },
  ]

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="page-title">{isAr ? 'مركز التسويق' : 'Marketing Hub'}</h1>
        <p className="text-healthcare-muted">
          {isAr ? 'نظرة شاملة على حملاتك وأداء التسويق' : 'Overview of your campaigns and marketing performance'}
        </p>
      </div>

      {/* Onboarding Guide */}
      <MarketingOnboarding
        isAr={isAr}
        hasTemplates={Array.isArray(templates) && templates.length > 0}
        hasReminders={!!(reminderStats && (reminderStats.totalSent || reminderStats.sent))}
        hasCampaigns={(campaigns?.length || 0) > 0}
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          icon={Target}
          value={activeCampaigns}
          label={isAr ? 'حملات نشطة' : 'Active Campaigns'}
          iconBg="bg-green-100"
          iconColor="text-green-600"
        />
        <StatCard
          icon={Megaphone}
          value={totalReach.toLocaleString()}
          label={isAr ? 'إجمالي الوصول' : 'Total Reach'}
          iconBg="bg-primary-100"
          iconColor="text-primary-600"
        />
        <StatCard
          icon={MessageSquare}
          value={smsDelivered.toLocaleString()}
          label={isAr ? 'رسائل مُرسلة' : 'Messages Sent'}
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
        />
        <StatCard
          icon={ShieldCheck}
          value={`${reminderConfirmRate}%`}
          label={isAr ? 'معدل تأكيد التذكيرات' : 'Reminder Confirm Rate'}
          iconBg="bg-amber-100"
          iconColor="text-amber-600"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Campaign Trend */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            {isAr ? 'أداء الحملات الأخيرة' : 'Recent Campaign Performance'}
          </h3>
          {recentCampaigns.length > 0 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={recentCampaigns}>
                  <defs>
                    <linearGradient id="sentGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0891B2" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0891B2" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="sent" stroke="#0891B2" fill="url(#sentGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-56 flex items-center justify-center text-gray-400 text-sm">
              {isAr ? 'لا توجد بيانات حملات بعد' : 'No campaign data yet'}
            </div>
          )}
        </div>

        {/* Reminder Outcomes */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            {isAr ? 'نتائج التذكيرات' : 'Reminder Outcomes'}
          </h3>
          {reminderPieData.length > 0 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={reminderPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {reminderPieData.map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-56 flex items-center justify-center text-gray-400 text-sm">
              {isAr ? 'لا توجد بيانات تذكيرات بعد' : 'No reminder data yet'}
            </div>
          )}
        </div>
      </div>

      {/* Consent Dashboard */}
      <ConsentDashboard orgId={orgId} isAr={isAr} />

      {/* Quick Links */}
      <section>
        <h2 className="text-lg font-heading font-semibold text-healthcare-text mb-4">
          {isAr ? 'أدوات التسويق' : 'Marketing Tools'}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickLinks.map((link) => (
            <button
              key={link.href}
              onClick={() => navigate(link.href)}
              className="card p-5 text-start hover:shadow-card-hover transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-xl ${link.color.split(' ')[0]}`}>
                  <link.icon className={`h-6 w-6 ${link.color.split(' ')[1]}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-healthcare-text group-hover:text-primary-700 transition-colors">
                    {link.label}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">{link.labelSub}</p>
                </div>
                <Arrow className="h-4 w-4 text-gray-300 group-hover:text-primary-500 transition-colors mt-1" />
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
