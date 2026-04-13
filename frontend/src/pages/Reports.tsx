import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import {
  FileDown,
  Calendar,
  Users,
  Phone,
  Megaphone,
  TrendingUp,
  Building2,
  UserCog,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import StatCard from '../components/ui/StatCard'
import ComingSoonOverlay from '../components/ui/ComingSoonOverlay'
import LoadingSpinner from '../components/ui/LoadingSpinner'

const COLORS = ['#4A7C6F', '#C4956A', '#8BB8AA', '#D97706', '#8B5CF6', '#B07D52']

type ExportType = 'appointments' | 'patients' | 'calls' | 'campaigns'

export default function Reports() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [exporting, setExporting] = useState<ExportType | null>(null)

  // Summary data
  const { data: summaryData, isLoading } = useQuery({
    queryKey: ['reports-summary', dateFrom, dateTo],
    queryFn: async () => (await api.get(`/api/reports/summary?from=${dateFrom}&to=${dateTo}`)).data,
  })

  // Provider breakdown
  const { data: providerData } = useQuery({
    queryKey: ['reports-by-provider', dateFrom, dateTo],
    queryFn: async () => (await api.get(`/api/reports/by-provider?from=${dateFrom}&to=${dateTo}`)).data,
  })

  // Department breakdown
  const { data: deptData } = useQuery({
    queryKey: ['reports-by-department', dateFrom, dateTo],
    queryFn: async () => (await api.get(`/api/reports/by-department?from=${dateFrom}&to=${dateTo}`)).data,
  })

  // Daily trend
  const { data: trendData } = useQuery({
    queryKey: ['reports-daily-trend', dateFrom, dateTo],
    queryFn: async () => (await api.get(`/api/reports/daily-trend?from=${dateFrom}&to=${dateTo}`)).data,
  })

  const summary = summaryData?.data
  const providers = providerData?.data || []
  const departments = deptData?.data || []
  const trend = trendData?.data || []

  const handleExport = async (type: ExportType) => {
    setExporting(type)
    try {
      const response = await api.get(
        `/api/reports/export?type=${type}&from=${dateFrom}&to=${dateTo}&format=csv`,
        { responseType: 'blob' }
      )
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${type}_${dateFrom}_${dateTo}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(null)
    }
  }

  const exportButtons: { type: ExportType; icon: React.ElementType; labelAr: string; labelEn: string; comingSoon?: boolean }[] = [
    { type: 'appointments', icon: Calendar, labelAr: 'المواعيد', labelEn: 'Appointments' },
    { type: 'patients', icon: Users, labelAr: 'المرضى', labelEn: 'Patients' },
    { type: 'calls', icon: Phone, labelAr: 'المكالمات', labelEn: 'Calls', comingSoon: true },
    { type: 'campaigns', icon: Megaphone, labelAr: 'الحملات', labelEn: 'Campaigns' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{isAr ? 'التقارير' : 'Reports'}</h1>
          <p className="page-subtitle">{isAr ? 'تقارير شاملة مع إمكانية التصدير' : 'Comprehensive reports with export capabilities'}</p>
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-healthcare-text">{isAr ? 'من' : 'From'}</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input max-w-[180px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-healthcare-text">{isAr ? 'إلى' : 'To'}</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="input max-w-[180px]"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => { const d = new Date(); d.setDate(d.getDate() - 7); setDateFrom(d.toISOString().slice(0, 10)); setDateTo(new Date().toISOString().slice(0, 10)) }}
              className="btn-ghost btn-sm text-xs">{isAr ? 'آخر 7 أيام' : 'Last 7 days'}</button>
            <button onClick={() => { const d = new Date(); d.setDate(d.getDate() - 30); setDateFrom(d.toISOString().slice(0, 10)); setDateTo(new Date().toISOString().slice(0, 10)) }}
              className="btn-ghost btn-sm text-xs">{isAr ? 'آخر 30 يوم' : 'Last 30 days'}</button>
            <button onClick={() => { const d = new Date(); d.setDate(d.getDate() - 90); setDateFrom(d.toISOString().slice(0, 10)); setDateTo(new Date().toISOString().slice(0, 10)) }}
              className="btn-ghost btn-sm text-xs">{isAr ? 'آخر 90 يوم' : 'Last 90 days'}</button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64"><LoadingSpinner size="lg" /></div>
      ) : (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={Users}
              value={summary?.patients?.new || 0}
              label={isAr ? 'مرضى جدد' : 'New Patients'}
              iconBg="bg-primary-100"
              iconColor="text-primary-600"
            />
            <StatCard
              icon={Calendar}
              value={summary?.appointments?.total || 0}
              label={isAr ? 'إجمالي المواعيد' : 'Total Appointments'}
              iconBg="bg-success-100"
              iconColor="text-success-600"
            />
            <StatCard
              icon={TrendingUp}
              value={`${summary?.appointments?.completionRate || 0}%`}
              label={isAr ? 'نسبة الإكمال' : 'Completion Rate'}
              iconBg="bg-secondary-100"
              iconColor="text-secondary-600"
            />
            <ComingSoonOverlay>
              <StatCard
                icon={Phone}
                value={summary?.calls?.total || 0}
                label={isAr ? 'المكالمات' : 'Voice Calls'}
                iconBg="bg-warning-100"
                iconColor="text-warning-600"
              />
            </ComingSoonOverlay>
          </div>

          {/* Appointment Status Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="card p-4 text-center">
              <p className="text-2xl font-bold text-success-600">{summary?.appointments?.completed || 0}</p>
              <p className="text-xs text-healthcare-muted">{isAr ? 'مكتملة' : 'Completed'}</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-2xl font-bold text-danger-600">{summary?.appointments?.cancelled || 0}</p>
              <p className="text-xs text-healthcare-muted">{isAr ? 'ملغاة' : 'Cancelled'}</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-2xl font-bold text-warning-600">{summary?.appointments?.noShow || 0}</p>
              <p className="text-xs text-healthcare-muted">{isAr ? 'لم يحضر' : 'No Show'}</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-2xl font-bold text-danger-500">{summary?.appointments?.noShowRate || 0}%</p>
              <p className="text-xs text-healthcare-muted">{isAr ? 'نسبة عدم الحضور' : 'No Show Rate'}</p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Daily Trend */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold font-heading text-healthcare-text mb-4">
                {isAr ? 'اتجاه المواعيد اليومي' : 'Daily Appointment Trend'}
              </h3>
              <div className="h-64">
                {trend.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(v) => new Date(v).toLocaleDateString(isAr ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric' })}
                        tick={{ fontSize: 10, fill: '#6B7280' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        labelFormatter={(v) => new Date(v).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')}
                        contentStyle={{ background: 'white', border: '1px solid #D6D3CC', borderRadius: '10px', fontSize: '12px' }}
                      />
                      <Bar dataKey="completed" stackId="a" fill="#059669" name={isAr ? 'مكتملة' : 'Completed'} radius={[0, 0, 0, 0]} />
                      <Bar dataKey="cancelled" stackId="a" fill="#EF4444" name={isAr ? 'ملغاة' : 'Cancelled'} radius={[0, 0, 0, 0]} />
                      <Bar dataKey="noShow" stackId="a" fill="#F59E0B" name={isAr ? 'لم يحضر' : 'No Show'} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-healthcare-muted text-sm">{isAr ? 'لا توجد بيانات' : 'No data'}</div>
                )}
              </div>
            </div>

            {/* Department Breakdown */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold font-heading text-healthcare-text mb-4">
                <Building2 className="inline h-5 w-5 me-2 text-primary-500" />
                {isAr ? 'المواعيد حسب القسم' : 'Appointments by Department'}
              </h3>
              <div className="h-64">
                {departments.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={departments}
                        dataKey="totalAppointments"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={45}
                        strokeWidth={0}
                        label={({ name, totalAppointments }) => `${name}: ${totalAppointments}`}
                      >
                        {departments.map((_: any, i: number) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'white', border: '1px solid #D6D3CC', borderRadius: '10px', fontSize: '12px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-healthcare-muted text-sm">{isAr ? 'لا توجد بيانات' : 'No data'}</div>
                )}
              </div>
            </div>
          </div>

          {/* Provider Performance */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold font-heading text-healthcare-text mb-4">
              <UserCog className="inline h-5 w-5 me-2 text-primary-500" />
              {isAr ? 'أداء الأطباء' : 'Provider Performance'}
            </h3>
            {providers.length > 0 ? (
              <div className="table-container">
                <table className="min-w-full">
                  <thead className="table-header">
                    <tr>
                      <th>{isAr ? 'الطبيب' : 'Provider'}</th>
                      <th>{isAr ? 'إجمالي المواعيد' : 'Total'}</th>
                      <th>{isAr ? 'مكتملة' : 'Completed'}</th>
                      <th>{isAr ? 'لم يحضر' : 'No Show'}</th>
                      <th>{isAr ? 'ملغاة' : 'Cancelled'}</th>
                      <th>{isAr ? 'نسبة الإكمال' : 'Completion %'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providers.map((p: any) => (
                      <tr key={p.providerId} className="table-row">
                        <td className="font-semibold text-healthcare-text">{p.displayName}</td>
                        <td>{p.totalAppointments}</td>
                        <td className="text-success-600 font-medium">{p.completed}</td>
                        <td className="text-warning-600 font-medium">{p.noShow}</td>
                        <td className="text-danger-600 font-medium">{p.cancelled}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-primary-50 rounded-full overflow-hidden max-w-[80px]">
                              <div className="h-full bg-success-500 rounded-full" style={{ width: `${p.completionRate}%` }} />
                            </div>
                            <span className="text-sm font-bold text-healthcare-text">{p.completionRate}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-healthcare-muted text-sm">{isAr ? 'لا توجد بيانات' : 'No data'}</div>
            )}
          </div>

          {/* Export Section */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold font-heading text-healthcare-text mb-2">
              <FileDown className="inline h-5 w-5 me-2 text-primary-500" />
              {isAr ? 'تصدير البيانات' : 'Export Data'}
            </h3>
            <p className="text-sm text-healthcare-muted mb-4">
              {isAr ? 'تصدير البيانات بتنسيق CSV للفترة المحددة' : 'Export data in CSV format for the selected period'}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {exportButtons.map(({ type, icon: Icon, labelAr, labelEn, comingSoon }) => {
                const button = (
                  <button
                    key={type}
                    onClick={() => !comingSoon && handleExport(type)}
                    disabled={exporting !== null || comingSoon}
                    className="card-interactive p-4 text-center group border border-healthcare-border/30 hover:border-primary-300"
                  >
                    <div className="w-10 h-10 mx-auto rounded-xl bg-primary-50 flex items-center justify-center mb-2 group-hover:bg-primary-100 transition-colors">
                      {exporting === type ? <LoadingSpinner size="sm" /> : <Icon className="h-5 w-5 text-primary-500" />}
                    </div>
                    <p className="text-sm font-medium text-healthcare-text">{isAr ? labelAr : labelEn}</p>
                    <p className="text-[10px] text-healthcare-muted mt-0.5">CSV</p>
                  </button>
                )
                return comingSoon ? (
                  <ComingSoonOverlay key={type}>{button}</ComingSoonOverlay>
                ) : (
                  <div key={type}>{button}</div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
