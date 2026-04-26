import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Building2, Users, CalendarCheck, MessageSquare, Wallet, TrendingUp } from 'lucide-react'
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
  return (
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' SAR'
  )
}

type AccentTone = 'primary' | 'secondary' | 'success' | 'warning' | 'danger'

const ACCENT: Record<AccentTone, { iconBg: string; iconText: string }> = {
  primary: { iconBg: 'bg-primary-50', iconText: 'text-primary-600' },
  secondary: { iconBg: 'bg-secondary-50', iconText: 'text-secondary-700' },
  success: { iconBg: 'bg-success-50', iconText: 'text-success-600' },
  warning: { iconBg: 'bg-warning-50', iconText: 'text-warning-700' },
  danger: { iconBg: 'bg-danger-50', iconText: 'text-danger-600' },
}

function Metric({
  title,
  value,
  subtitle,
  icon: Icon,
  tone = 'primary',
}: {
  title: string
  value: string | number
  subtitle?: string
  icon?: typeof Building2
  tone?: AccentTone
}) {
  const a = ACCENT[tone]
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-widest text-healthcare-muted font-semibold">
            {title}
          </div>
          <div className="mt-1.5 font-heading text-2xl md:text-3xl font-semibold text-healthcare-text tabular-nums">
            {value}
          </div>
          {subtitle && (
            <div className="mt-1 text-xs text-healthcare-muted">{subtitle}</div>
          )}
        </div>
        {Icon && (
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${a.iconBg} ${a.iconText}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  )
}

function SignupsBarChart({
  daily,
  label,
}: {
  daily: { date: string; count: number }[]
  label: string
}) {
  const max = Math.max(1, ...daily.map((d) => d.count))
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] uppercase tracking-widest text-healthcare-muted font-semibold">
          {label}
        </div>
        <TrendingUp className="w-4 h-4 text-primary-500" />
      </div>
      <div className="flex items-end gap-1 h-28">
        {daily.map((d) => (
          <div key={d.date} className="flex-1 group relative" title={`${d.date}: ${d.count}`}>
            <div
              className="bg-primary-500 rounded-t-md transition-colors group-hover:bg-primary-600"
              style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-healthcare-muted tabular-nums">
        <span>{daily[0]?.date}</span>
        <span>{daily[daily.length - 1]?.date}</span>
      </div>
    </div>
  )
}

const PLAN_TONE: Record<string, AccentTone> = {
  starter: 'primary',
  professional: 'secondary',
  enterprise: 'success',
}

export default function PlatformDashboard() {
  const { t } = useTranslation()
  const { data, isLoading, error } = useQuery<MetricsResponse>({
    queryKey: ['platform', 'metrics'],
    queryFn: async () => (await platformApi.get('/api/platform/metrics')).data,
    refetchInterval: 60_000,
  })

  if (isLoading) {
    return <div className="text-healthcare-muted text-sm">{t('platform.dashboard.loading')}</div>
  }
  if (error || !data) {
    return <div className="text-danger-600 text-sm">{t('platform.dashboard.loadFailed')}</div>
  }

  const { totals, mrr, subscriptionsByPlan, signups } = data

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-healthcare-text">
          {t('platform.dashboard.title')}
        </h1>
        <p className="text-sm text-healthcare-muted mt-1">{t('platform.dashboard.subtitle')}</p>
      </div>

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric
          title={t('platform.dashboard.totalOrgs')}
          value={totals.orgs}
          icon={Building2}
          tone="primary"
        />
        <Metric
          title={t('platform.dashboard.active')}
          value={totals.orgsByStatus.active ?? 0}
          icon={Building2}
          tone="success"
        />
        <Metric
          title={t('platform.dashboard.suspended')}
          value={totals.orgsByStatus.suspended ?? 0}
          icon={Building2}
          tone="warning"
        />
        <Metric
          title={t('platform.dashboard.mrr')}
          value={formatSAR(mrr.sar)}
          subtitle={t('platform.dashboard.activeSubs', { count: totals.activeSubscriptions })}
          icon={Wallet}
          tone="secondary"
        />
      </div>

      {/* Signups */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Metric title={t('platform.dashboard.signups7')} value={signups.last7d} />
        <Metric title={t('platform.dashboard.signups30')} value={signups.last30d} />
        <Metric title={t('platform.dashboard.signups90')} value={signups.last90d} />
      </div>

      <SignupsBarChart daily={signups.last30dDaily} label={t('platform.dashboard.signupsChart')} />

      {/* Operational metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Metric
          title={t('platform.dashboard.patients')}
          value={totals.patients.toLocaleString()}
          icon={Users}
          tone="primary"
        />
        <Metric
          title={t('platform.dashboard.appointments')}
          value={totals.appointments.toLocaleString()}
          icon={CalendarCheck}
          tone="secondary"
        />
        <Metric
          title={t('platform.dashboard.smsSent')}
          value={totals.smsMessages.toLocaleString()}
          icon={MessageSquare}
          tone="success"
        />
      </div>

      {/* Plan breakdown */}
      <div className="card p-5">
        <div className="text-[11px] uppercase tracking-widest text-healthcare-muted font-semibold mb-4">
          {t('platform.dashboard.subsByPlan')}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {(['starter', 'professional', 'enterprise'] as const).map((plan) => {
            const a = ACCENT[PLAN_TONE[plan]]
            return (
              <div
                key={plan}
                className={`rounded-xl border border-healthcare-border/40 p-4 ${a.iconBg}`}
              >
                <div className={`text-xs font-semibold capitalize ${a.iconText}`}>{plan}</div>
                <div className="font-heading text-2xl font-bold text-healthcare-text mt-1 tabular-nums">
                  {subscriptionsByPlan[plan] ?? 0}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
