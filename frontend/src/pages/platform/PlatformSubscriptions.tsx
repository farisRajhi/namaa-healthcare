import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, Clock, MinusCircle } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { platformApi } from '../../lib/platformApi'
import { getErrorMessage } from '../../lib/api'
import Modal from '../../components/ui/Modal'
import i18n from '../../i18n'

interface SubRow {
  id: string
  orgId: string
  plan: string
  status: 'active' | 'past_due' | 'cancelled' | 'expired'
  startDate: string
  endDate: string
  cancelledAt: string | null
  failedAttempts: number
  createdAt: string
  org: { orgId: string; name: string; nameAr?: string | null; status: string } | null
}

interface ListResponse {
  data: SubRow[]
  total: number
  page: number
  pageSize: number
}

const STATUS_BADGE: Record<SubRow['status'], { cls: string; icon: typeof AlertTriangle }> = {
  active: { cls: 'bg-success-50 text-success-700 border-success-200', icon: CheckCircle2 },
  past_due: { cls: 'bg-warning-50 text-warning-700 border-warning-200', icon: Clock },
  cancelled: { cls: 'bg-secondary-50 text-secondary-700 border-secondary-200', icon: AlertTriangle },
  expired: { cls: 'bg-healthcare-bg text-healthcare-muted border-healthcare-border', icon: MinusCircle },
}

const STATUS_KEY: Record<SubRow['status'], string> = {
  active: 'platform.subscriptions.active',
  past_due: 'platform.subscriptions.pastDue',
  cancelled: 'platform.subscriptions.cancelled',
  expired: 'platform.subscriptions.expired',
}

export default function PlatformSubscriptions() {
  const { t } = useTranslation()
  const lang = i18n.language
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [plan, setPlan] = useState('')
  const pageSize = 25

  const [cancelTarget, setCancelTarget] = useState<SubRow | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [retryError, setRetryError] = useState<string | null>(null)

  const { data, isLoading } = useQuery<ListResponse>({
    queryKey: ['platform', 'subscriptions', { page, status, plan }],
    queryFn: async () =>
      (await platformApi.get('/api/platform/subscriptions', {
        params: { page, pageSize, status: status || undefined, plan: plan || undefined },
      })).data,
    staleTime: 30_000,
  })

  const cancelMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      platformApi.patch(`/api/platform/subscriptions/${id}/cancel`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform', 'subscriptions'] })
      qc.invalidateQueries({ queryKey: ['platform', 'metrics'] })
      setCancelTarget(null)
      setCancelReason('')
      setCancelError(null)
    },
    onError: (err) => {
      const m = getErrorMessage(err)
      setCancelError(lang === 'ar' ? m.ar : m.en)
    },
  })

  const retryMutation = useMutation({
    mutationFn: async (id: string) => platformApi.post(`/api/platform/subscriptions/${id}/retry-renewal`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform', 'subscriptions'] })
      setRetryError(null)
    },
    onError: (err) => {
      const m = getErrorMessage(err)
      setRetryError(lang === 'ar' ? m.ar : m.en)
    },
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1
  const orgName = (sub: SubRow) =>
    sub.org ? (lang === 'ar' ? (sub.org.nameAr ?? sub.org.name) : sub.org.name) : t('common.unknown')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold text-healthcare-text">
          {t('platform.subscriptions.title')}
        </h1>
        <div className="text-sm text-healthcare-muted">
          {data ? t('platform.subscriptions.total', { n: data.total }) : '...'}
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <label htmlFor="subs-status" className="sr-only">
          {t('platform.subscriptions.status')}
        </label>
        <select
          id="subs-status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
          className="bg-white border border-healthcare-border rounded-lg px-3 py-2 text-sm text-healthcare-text focus:outline-none focus:ring-[3px] focus:ring-primary-400 focus:border-primary-500"
        >
          <option value="">{t('platform.subscriptions.allStatuses')}</option>
          <option value="active">{t('platform.subscriptions.active')}</option>
          <option value="past_due">{t('platform.subscriptions.pastDue')}</option>
          <option value="cancelled">{t('platform.subscriptions.cancelled')}</option>
          <option value="expired">{t('platform.subscriptions.expired')}</option>
        </select>
        <label htmlFor="subs-plan" className="sr-only">
          {t('platform.subscriptions.plan')}
        </label>
        <select
          id="subs-plan"
          value={plan}
          onChange={(e) => {
            setPlan(e.target.value)
            setPage(1)
          }}
          className="bg-white border border-healthcare-border rounded-lg px-3 py-2 text-sm text-healthcare-text focus:outline-none focus:ring-[3px] focus:ring-primary-400 focus:border-primary-500"
        >
          <option value="">{t('platform.subscriptions.allPlans')}</option>
          <option value="starter">{t('plans.starter')}</option>
          <option value="professional">{t('plans.professional')}</option>
          <option value="enterprise">{t('plans.enterprise')}</option>
        </select>
      </div>

      {retryError && (
        <div role="alert" className="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">
          {retryError}
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm" aria-label={t('platform.subscriptions.title')}>
          <caption className="sr-only">{t('platform.subscriptions.title')}</caption>
          <thead className="bg-healthcare-bg text-healthcare-muted text-[11px] uppercase tracking-widest font-semibold">
            <tr>
              <th scope="col" className="text-start px-4 py-3">{t('platform.subscriptions.org')}</th>
              <th scope="col" className="text-start px-4 py-3">{t('platform.subscriptions.plan')}</th>
              <th scope="col" className="text-start px-4 py-3">{t('platform.subscriptions.status')}</th>
              <th scope="col" className="text-start px-4 py-3">{t('platform.subscriptions.start')}</th>
              <th scope="col" className="text-start px-4 py-3">{t('platform.subscriptions.end')}</th>
              <th scope="col" className="text-end px-4 py-3">{t('platform.orgs.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-healthcare-muted">
                  <span role="status" aria-live="polite">
                    {t('platform.orgs.loading')}
                  </span>
                </td>
              </tr>
            )}
            {data?.data.length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-healthcare-muted">
                  {t('platform.subscriptions.noRows')}
                </td>
              </tr>
            )}
            {data?.data.map((s) => {
              const badge = STATUS_BADGE[s.status]
              const StatusIcon = badge.icon
              return (
                <tr
                  key={s.id}
                  className="border-t border-healthcare-border/40 hover:bg-healthcare-bg/60 transition-colors"
                >
                  <td className="px-4 py-3">
                    {s.org ? (
                      <Link
                        to={`/platform/orgs/${s.org.orgId}`}
                        className="text-healthcare-text hover:text-primary-600 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 rounded"
                      >
                        {orgName(s)}
                      </Link>
                    ) : (
                      <span className="text-healthcare-muted">{t('common.unknown')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-healthcare-text">
                    {t(`plans.${s.plan}`, { defaultValue: s.plan })}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold border rounded-full px-2.5 py-0.5 ${badge.cls}`}
                      aria-label={`${t('platform.subscriptions.status')}: ${t(STATUS_KEY[s.status])}`}
                    >
                      <StatusIcon className="w-3 h-3" aria-hidden="true" />
                      {t(STATUS_KEY[s.status])}
                    </span>
                    {s.failedAttempts > 0 && (
                      <span className="ms-2 text-xs text-warning-700 font-medium">
                        {t('platform.subscriptions.failedAttempts', { n: s.failedAttempts })}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-healthcare-muted tabular-nums">
                    {new Date(s.startDate).toLocaleDateString(lang)}
                  </td>
                  <td className="px-4 py-3 text-healthcare-muted tabular-nums">
                    {new Date(s.endDate).toLocaleDateString(lang)}
                  </td>
                  <td className="px-4 py-3 text-end space-x-2 rtl:space-x-reverse">
                    {s.status === 'past_due' && (
                      <button
                        onClick={() => retryMutation.mutate(s.id)}
                        disabled={retryMutation.isPending}
                        aria-busy={retryMutation.isPending}
                        className="btn-outline btn-sm text-primary-600 hover:bg-primary-50 focus-visible:ring-2 focus-visible:ring-primary-400 disabled:opacity-50"
                      >
                        {t('platform.subscriptions.retryRenewal')}
                      </button>
                    )}
                    {(s.status === 'active' || s.status === 'past_due') && (
                      <button
                        onClick={() => {
                          setCancelTarget(s)
                          setCancelReason('')
                          setCancelError(null)
                        }}
                        className="btn-outline btn-sm text-danger-600 hover:bg-danger-50 focus-visible:ring-2 focus-visible:ring-danger-400"
                      >
                        {t('platform.subscriptions.cancelBtn')}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="btn-outline btn-sm"
        >
          {t('common.previous')}
        </button>
        <div className="text-sm text-healthcare-muted tabular-nums">
          {t('platform.orgs.page', { page, total: totalPages })}
        </div>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className="btn-outline btn-sm"
        >
          {t('common.next')}
        </button>
      </div>

      <Modal
        open={!!cancelTarget}
        onClose={() => !cancelMutation.isPending && setCancelTarget(null)}
        title={t('platform.subscriptions.cancelTitle')}
      >
        {cancelTarget && (
          <p className="text-sm text-healthcare-muted mb-3">
            {orgName(cancelTarget)} · {t(`plans.${cancelTarget.plan}`, { defaultValue: cancelTarget.plan })}
          </p>
        )}
        <label htmlFor="cancel-reason" className="block text-sm font-medium text-healthcare-text">
          {t('platform.subscriptions.cancelReason')}
        </label>
        <textarea
          id="cancel-reason"
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          rows={3}
          className="mt-1 w-full bg-white border border-healthcare-border rounded-lg px-3 py-2 text-sm text-healthcare-text focus:outline-none focus:ring-[3px] focus:ring-primary-400 focus:border-primary-500 resize-none"
        />
        {cancelError && (
          <div role="alert" className="mt-3 text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">
            {cancelError}
          </div>
        )}
        <div className="mt-5 flex gap-2 justify-end">
          <button
            onClick={() => setCancelTarget(null)}
            disabled={cancelMutation.isPending}
            className="btn-outline btn-sm"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={() => {
              if (cancelReason.trim().length < 3) {
                setCancelError(t('platform.subscriptions.cancelReasonTooShort'))
                return
              }
              if (!cancelTarget) return
              cancelMutation.mutate({ id: cancelTarget.id, reason: cancelReason.trim() })
            }}
            disabled={cancelMutation.isPending}
            aria-busy={cancelMutation.isPending}
            className="btn-danger btn-sm"
          >
            {cancelMutation.isPending
              ? t('platform.orgDetail.saving')
              : t('platform.subscriptions.confirmCancel')}
          </button>
        </div>
      </Modal>
    </div>
  )
}
