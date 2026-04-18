import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { platformApi } from '../../lib/platformApi'

interface MetricsResponse {
  totals: {
    orgs: number
    orgsByStatus: Record<string, number>
    patients: number
    appointments: number
    smsMessages: number
    activeSubscriptions: number
  }
  mrr: { sar: number }
  subscriptionsByPlan: Record<string, number>
  signups: {
    last7d: number
    last30d: number
    last90d: number
    last30dDaily: { date: string; count: number }[]
  }
  generatedAt: string
}

function formatSAR(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' SAR'
}

function Card({ title, value, subtitle }: { title: string; value: string | number; subtitle?: string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <div className="text-xs uppercase tracking-widest text-slate-500">{title}</div>
      <div className="mt-2 text-3xl font-semibold text-slate-900">{value}</div>
      {subtitle && <div className="mt-1 text-xs text-slate-500">{subtitle}</div>}
    </div>
  )
}

function SignupsBarChart({ daily, label }: { daily: { date: string; count: number }[]; label: string }) {
  const max = Math.max(1, ...daily.map((d) => d.count))
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <div className="text-xs uppercase tracking-widest text-slate-500 mb-3">{label}</div>
      <div className="flex items-end gap-1 h-24">
        {daily.map((d) => (
          <div key={d.date} className="flex-1" title={`${d.date}: ${d.count}`}>
            <div
              className="bg-slate-800 rounded-t"
              style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-400">
        <span>{daily[0]?.date}</span>
        <span>{daily[daily.length - 1]?.date}</span>
      </div>
    </div>
  )
}

export default function PlatformDashboard() {
  const { t } = useTranslation()
  const { data, isLoading, error } = useQuery<MetricsResponse>({
    queryKey: ['platform', 'metrics'],
    queryFn: async () => (await platformApi.get('/api/platform/metrics')).data,
    refetchInterval: 60_000,
  })

  if (isLoading) {
    return <div className="text-slate-500">{t('platform.dashboard.loading')}</div>
  }
  if (error || !data) {
    return <div className="text-red-600">{t('platform.dashboard.loadFailed')}</div>
  }

  const { totals, mrr, subscriptionsByPlan, signups } = data

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{t('platform.dashboard.title')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('platform.dashboard.subtitle')}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card title={t('platform.dashboard.totalOrgs')} value={totals.orgs} />
        <Card title={t('platform.dashboard.active')} value={totals.orgsByStatus.active ?? 0} />
        <Card title={t('platform.dashboard.suspended')} value={totals.orgsByStatus.suspended ?? 0} />
        <Card
          title={t('platform.dashboard.mrr')}
          value={formatSAR(mrr.sar)}
          subtitle={t('platform.dashboard.activeSubs', { count: totals.activeSubscriptions })}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title={t('platform.dashboard.signups7')} value={signups.last7d} />
        <Card title={t('platform.dashboard.signups30')} value={signups.last30d} />
        <Card title={t('platform.dashboard.signups90')} value={signups.last90d} />
      </div>

      <SignupsBarChart daily={signups.last30dDaily} label={t('platform.dashboard.signupsChart')} />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card title={t('platform.dashboard.patients')} value={totals.patients.toLocaleString()} />
        <Card title={t('platform.dashboard.appointments')} value={totals.appointments.toLocaleString()} />
        <Card title={t('platform.dashboard.smsSent')} value={totals.smsMessages.toLocaleString()} />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <div className="text-xs uppercase tracking-widest text-slate-500 mb-3">
          {t('platform.dashboard.subsByPlan')}
        </div>
        <div className="flex gap-6">
          {['starter', 'professional', 'enterprise'].map((plan) => (
            <div key={plan}>
              <div className="text-xs text-slate-500 capitalize">{plan}</div>
              <div className="text-xl font-semibold text-slate-900">{subscriptionsByPlan[plan] ?? 0}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
