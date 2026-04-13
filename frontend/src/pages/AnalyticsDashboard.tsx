import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import {
  Phone,
  CheckCircle,
  Calendar,
  Clock,
  Star,
  DollarSign,
  Plus,
} from 'lucide-react'
import ComingSoonOverlay from '../components/ui/ComingSoonOverlay'
import { cn } from '../lib/utils'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

const COLORS = ['#4A7C6F', '#C4956A', '#8BB8AA', '#D97706', '#8B5CF6', '#B07D52']

type TimeRange = 'hourly' | 'daily' | 'weekly'

export default function AnalyticsDashboard() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const [timeRange, setTimeRange] = useState<TimeRange>('daily')

  // Backend: GET /api/analytics-v2/overview
  const { data: overview } = useQuery({
    queryKey: ['analytics-dashboard', 'overview'],
    queryFn: async () => {
      try {
        const res = await api.get('/api/analytics-v2/overview')
        return res.data
      } catch {
        return { totalCalls: 0, aiResolutionRate: 0, appointmentsBooked: 0, avgWaitTime: 0, satisfaction: 0 }
      }
    },
    placeholderData: {
      totalCalls: 0,
      aiResolutionRate: 0,
      appointmentsBooked: 0,
      avgWaitTime: 0,
      satisfaction: 0,
    },
  })

  // Backend: GET /api/analytics-v2/trends?period=hourly|daily|weekly
  const { data: callVolume } = useQuery({
    queryKey: ['analytics-dashboard', 'call-volume', timeRange],
    queryFn: async () => {
      try {
        const res = await api.get(`/api/analytics-v2/trends?period=${timeRange}`)
        return res.data?.data || res.data || []
      } catch {
        return []
      }
    },
    placeholderData: [],
  })

  // Backend: GET /api/analytics-v2/call-drivers
  const { data: callDrivers } = useQuery({
    queryKey: ['analytics-dashboard', 'call-drivers'],
    queryFn: async () => {
      try {
        const res = await api.get('/api/analytics-v2/call-drivers')
        // Backend returns { breakdown, trending, gaps, recommendations }
        const breakdown = res.data?.breakdown || []
        return Array.isArray(breakdown) ? breakdown : []
      } catch {
        return []
      }
    },
    placeholderData: [],
  })

  // Backend: GET /api/analytics-v2/patient-journey
  const { data: funnelData } = useQuery({
    queryKey: ['analytics-dashboard', 'resolution-funnel'],
    queryFn: async () => {
      try {
        const res = await api.get('/api/analytics-v2/patient-journey')
        return res.data?.data || res.data || []
      } catch {
        return []
      }
    },
    placeholderData: [],
  })

  // Backend: GET /api/analytics-v2/knowledge-gaps
  const { data: knowledgeGaps } = useQuery({
    queryKey: ['analytics-dashboard', 'knowledge-gaps'],
    queryFn: async () => {
      try {
        const res = await api.get('/api/analytics-v2/knowledge-gaps')
        return res.data?.data || res.data || []
      } catch {
        return []
      }
    },
    placeholderData: [],
  })

  // Backend: GET /api/analytics-v2/facility-comparison
  const { data: facilityComparison } = useQuery({
    queryKey: ['analytics-dashboard', 'facility-comparison'],
    queryFn: async () => {
      try {
        const res = await api.get('/api/analytics-v2/facility-comparison')
        return res.data?.data || res.data || []
      } catch {
        return []
      }
    },
    placeholderData: [],
  })

  // Backend: GET /api/analytics-v2/revenue-impact
  const { data: revenueImpact } = useQuery({
    queryKey: ['analytics-dashboard', 'revenue-impact'],
    queryFn: async () => {
      try {
        const res = await api.get('/api/analytics-v2/revenue-impact')
        return res.data
      } catch {
        return { additionalRevenue: 0, costSavings: 0, noShowReduction: 0 }
      }
    },
    placeholderData: { additionalRevenue: 0, costSavings: 0, noShowReduction: 0 },
  })

  const statCards = [
    {
      label: isAr ? 'إجمالي المكالمات' : 'Total Calls',
      value: overview?.totalCalls || overview?.totalConversations || 0,
      icon: Phone,
      color: 'bg-blue-500',
      change: '+12%',
    },
    {
      label: isAr ? 'نسبة حل الذكاء الاصطناعي' : 'AI Resolution Rate',
      value: `${overview?.aiResolutionRate || overview?.resolutionRate || 0}%`,
      icon: CheckCircle,
      color: 'bg-green-500',
      change: '+5%',
    },
    {
      label: isAr ? 'المواعيد المحجوزة' : 'Appointments Booked',
      value: overview?.appointmentsBooked || overview?.totalAppointments || 0,
      icon: Calendar,
      color: 'bg-purple-500',
      change: '+8%',
    },
    {
      label: isAr ? 'متوسط وقت الانتظار' : 'Avg Wait Time',
      value: `${overview?.avgWaitTime || overview?.avgDurationSec || 0}${isAr ? ' ث' : 's'}`,
      icon: Clock,
      color: 'bg-orange-500',
      change: '-15%',
    },
    {
      label: isAr ? 'رضا المرضى' : 'Satisfaction',
      value: `${overview?.satisfaction || overview?.avgSatisfaction || 0}/5`,
      icon: Star,
      color: 'bg-yellow-500',
      change: '+0.3',
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="page-title">
          {isAr ? 'لوحة التحليلات' : 'Analytics Dashboard'}
        </h1>
        <p className="text-healthcare-muted">
          {isAr ? 'تحليلات شاملة لأداء مركز الاتصال' : 'Comprehensive call center performance analytics'}
        </p>
      </div>

      {/* Coming Soon Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
        <Phone className="h-5 w-5 text-amber-600 flex-shrink-0" />
        <p className="text-sm text-amber-800 font-medium">
          {isAr ? 'تحليلات المكالمات قيد التطوير وستتوفر قريباً' : 'Call analytics are under development and coming soon'}
        </p>
        <span className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-full text-xs font-semibold ms-auto">
          {isAr ? 'قريباً' : 'Coming Soon'}
        </span>
      </div>

      {/* Stat Cards */}
      <ComingSoonOverlay>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {statCards.map((stat) => (
            <div key={stat.label} className="card p-4">
              <div className="flex items-center gap-3">
                <div className={cn(stat.color, 'p-2 rounded-lg')}>
                  <stat.icon className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 truncate">{stat.label}</p>
                  <div className="flex items-center gap-1">
                    <p className="text-xl font-bold text-healthcare-text">{stat.value}</p>
                    <span className={cn(
                      'text-xs font-medium',
                      stat.change.startsWith('+') ? 'text-green-600' : 'text-red-600'
                    )}>
                      {stat.change}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ComingSoonOverlay>

      {/* Call Volume Chart */}
      <ComingSoonOverlay>
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-heading font-semibold text-healthcare-text">{isAr ? 'حجم المكالمات' : 'Call Volume'}</h3>
          <div className="flex gap-1 bg-primary-50/50 rounded-lg p-1">
            {(['hourly', 'daily', 'weekly'] as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={cn(
                  'px-3 py-1 rounded text-sm transition-colors',
                  timeRange === range ? 'bg-white shadow text-healthcare-text' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {range === 'hourly' ? (isAr ? 'ساعة' : 'Hour') :
                 range === 'daily' ? (isAr ? 'يوم' : 'Day') :
                 (isAr ? 'أسبوع' : 'Week')}
              </button>
            ))}
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={Array.isArray(callVolume) ? callVolume : []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              <Area type="monotone" dataKey="calls" stroke="#3b82f6" fill="#dbeafe" name={isAr ? 'مكالمات' : 'Calls'} />
              <Area type="monotone" dataKey="resolved" stroke="#22c55e" fill="#dcfce7" name={isAr ? 'تم حلها' : 'Resolved'} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      </ComingSoonOverlay>

      <ComingSoonOverlay>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Call Drivers Pie Chart */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-4">{isAr ? 'أسباب المكالمات' : 'Call Drivers'}</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={Array.isArray(callDrivers) ? callDrivers : []}
                  dataKey="count"
                  nameKey="driver"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  innerRadius={40}
                  label={({ driver, percent }) => `${driver} ${(percent * 100).toFixed(0)}%`}
                >
                  {(Array.isArray(callDrivers) ? callDrivers : []).map((_: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Resolution Funnel */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-4">{isAr ? 'مسار الحل' : 'Resolution Funnel'}</h3>
          {(!Array.isArray(funnelData) || funnelData.length === 0) ? (
            <div className="flex items-center justify-center h-64 text-gray-500">
              <p>{isAr ? 'لا توجد بيانات' : 'No data available'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(funnelData as any[]).map((step: any, idx: number) => {
                const width = step.count > 0 ? Math.max(20, (step.count / (funnelData as any[])[0].count) * 100) : 0
                return (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 w-24 text-end">{step.stage}</span>
                    <div className="flex-1">
                      <div
                        className="h-8 rounded-md flex items-center px-3 transition-all"
                        style={{
                          width: `${width}%`,
                          backgroundColor: COLORS[idx % COLORS.length],
                        }}
                      >
                        <span className="text-white text-sm font-medium">{step.count}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      </ComingSoonOverlay>

      {/* Knowledge Gaps */}
      <div className="table-container overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-heading font-semibold text-healthcare-text">{isAr ? 'فجوات المعرفة' : 'Knowledge Gaps'}</h3>
          <p className="text-sm text-gray-500">
            {isAr ? 'أسئلة متكررة لم تتم الإجابة عليها' : 'Frequently unanswered questions'}
          </p>
        </div>
        {(!Array.isArray(knowledgeGaps) || knowledgeGaps.length === 0) ? (
          <div className="p-6 text-center text-gray-500">
            {isAr ? 'لا توجد فجوات معرفية' : 'No knowledge gaps detected'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-healthcare-bg">
                <tr>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{isAr ? 'السؤال' : 'Question'}</th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{isAr ? 'التكرار' : 'Frequency'}</th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{isAr ? 'إجراء' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {(knowledgeGaps as any[]).map((gap: any, idx: number) => (
                  <tr key={idx} className="hover:bg-healthcare-bg">
                    <td className="px-6 py-4 text-healthcare-text">{gap.question}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-sm font-medium">
                        {gap.count}x
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button className="flex items-center gap-1 px-3 py-1.5 bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 text-sm">
                        <Plus className="h-4 w-4" />
                        {isAr ? 'أضف للأسئلة الشائعة' : 'Add to FAQ'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Revenue Impact + Facility Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Impact */}
        <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-6 text-white shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="h-6 w-6" />
            <h3 className="text-lg font-heading font-semibold">{isAr ? 'الأثر المالي' : 'Revenue Impact'}</h3>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-green-100 text-sm">{isAr ? 'إيرادات إضافية' : 'Additional Revenue'}</p>
              <p className="text-3xl font-bold">${(revenueImpact?.additionalRevenue || 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-green-100 text-sm">{isAr ? 'وفورات التكاليف' : 'Cost Savings'}</p>
              <p className="text-2xl font-bold">${(revenueImpact?.costSavings || 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-green-100 text-sm">{isAr ? 'تقليل عدم الحضور' : 'No-Show Reduction'}</p>
              <p className="text-2xl font-bold">{revenueImpact?.noShowReduction || 0}%</p>
            </div>
          </div>
        </div>

        {/* Facility Comparison */}
        <div className="lg:col-span-2 card p-6">
          <h3 className="text-lg font-semibold mb-4">{isAr ? 'مقارنة المنشآت' : 'Facility Comparison'}</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={Array.isArray(facilityComparison) ? facilityComparison : []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} />
                <Tooltip />
                <Bar dataKey="resolutionRate" fill="#3b82f6" name={isAr ? 'نسبة الحل' : 'Resolution %'} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

    </div>
  )
}
