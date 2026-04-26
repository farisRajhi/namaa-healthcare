import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { platformApi } from '../../lib/platformApi'
import { getErrorMessage } from '../../lib/api'

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
  org: { orgId: string; name: string; status: string } | null
}

interface ListResponse {
  data: SubRow[]
  total: number
  page: number
  pageSize: number
}

const STATUS_BADGE: Record<SubRow['status'], string> = {
  active: 'bg-success-50 text-success-700 border-success-200',
  past_due: 'bg-warning-50 text-warning-700 border-warning-200',
  cancelled: 'bg-secondary-50 text-secondary-700 border-secondary-200',
  expired: 'bg-healthcare-bg text-healthcare-muted border-healthcare-border',
}

export default function PlatformSubscriptions() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [plan, setPlan] = useState('')
  const pageSize = 25

  const [cancelTarget, setCancelTarget] = useState<SubRow | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelError, setCancelError] = useState<string | null>(null)

  const { data, isLoading } = useQuery<ListResponse>({
    queryKey: ['platform', 'subscriptions', { page, status, plan }],
    queryFn: async () =>
      (await platformApi.get('/api/platform/subscriptions', {
        params: { page, pageSize, status: status || undefined, plan: plan || undefined },
      })).data,
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
    onError: (err) => setCancelError(getErrorMessage(err).en),
  })

  const retryMutation = useMutation({
    mutationFn: async (id: string) => platformApi.post(`/api/platform/subscriptions/${id}/retry-renewal`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform', 'subscriptions'] }),
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold text-healthcare-text">
          {t('platform.subscriptions.title')}
        </h1>
        <div className="text-sm text-healthcare-muted">
          {data ? `${data.total} total` : '...'}
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <select
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
        <select
          value={plan}
          onChange={(e) => {
            setPlan(e.target.value)
            setPage(1)
          }}
          className="bg-white border border-healthcare-border rounded-lg px-3 py-2 text-sm text-healthcare-text focus:outline-none focus:ring-[3px] focus:ring-primary-400 focus:border-primary-500"
        >
          <option value="">{t('platform.subscriptions.allPlans')}</option>
          <option value="starter">starter</option>
          <option value="professional">professional</option>
          <option value="enterprise">enterprise</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-healthcare-bg text-healthcare-muted text-[11px] uppercase tracking-widest font-semibold">
            <tr>
              <th className="text-start px-4 py-3">{t('platform.subscriptions.org')}</th>
              <th className="text-start px-4 py-3">{t('platform.subscriptions.plan')}</th>
              <th className="text-start px-4 py-3">{t('platform.subscriptions.status')}</th>
              <th className="text-start px-4 py-3">{t('platform.subscriptions.start')}</th>
              <th className="text-start px-4 py-3">{t('platform.subscriptions.end')}</th>
              <th className="text-end px-4 py-3">{t('platform.orgs.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-healthcare-muted">
                  {t('platform.orgs.loading')}
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
            {data?.data.map((s) => (
              <tr
                key={s.id}
                className="border-t border-healthcare-border/40 hover:bg-healthcare-bg/60 transition-colors"
              >
                <td className="px-4 py-3">
                  {s.org ? (
                    <Link
                      to={`/platform/orgs/${s.org.orgId}`}
                      className="text-healthcare-text hover:text-primary-600 font-medium transition-colors"
                    >
                      {s.org.name}
                    </Link>
                  ) : (
                    <span className="text-healthcare-muted">(unknown)</span>
                  )}
                </td>
                <td className="px-4 py-3 capitalize text-healthcare-text">{s.plan}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block text-xs font-semibold border rounded-full px-2.5 py-0.5 ${STATUS_BADGE[s.status]}`}
                  >
                    {s.status}
                  </span>
                  {s.failedAttempts > 0 && (
                    <span className="ms-2 text-xs text-warning-700 font-medium">
                      {s.failedAttempts}× failed
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-healthcare-muted tabular-nums">
                  {new Date(s.startDate).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-healthcare-muted tabular-nums">
                  {new Date(s.endDate).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-end space-x-2 rtl:space-x-reverse">
                  {s.status === 'past_due' && (
                    <button
                      onClick={() => retryMutation.mutate(s.id)}
                      disabled={retryMutation.isPending}
                      className="text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors disabled:opacity-50"
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
                      className="text-xs font-semibold text-danger-600 hover:text-danger-700 transition-colors"
                    >
                      {t('platform.subscriptions.cancelBtn')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
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

      {cancelTarget && (
        <div
          className="fixed inset-0 bg-healthcare-text/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
          onClick={() => !cancelMutation.isPending && setCancelTarget(null)}
        >
          <div
            className="bg-white rounded-2xl border border-healthcare-border/40 shadow-modal p-6 max-w-md w-full animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h2 className="font-heading text-lg font-semibold text-healthcare-text">
                  {t('platform.subscriptions.cancelTitle')}
                </h2>
                <p className="text-sm text-healthcare-muted mt-0.5">
                  {cancelTarget.org?.name} · {cancelTarget.plan}
                </p>
              </div>
              <button
                onClick={() => setCancelTarget(null)}
                className="text-healthcare-muted hover:text-healthcare-text p-1 rounded-md hover:bg-healthcare-bg transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <label className="block mt-3 text-sm font-medium text-healthcare-text">
              {t('platform.subscriptions.cancelReason')}
            </label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              className="mt-1 w-full bg-white border border-healthcare-border rounded-lg px-3 py-2 text-sm text-healthcare-text focus:outline-none focus:ring-[3px] focus:ring-primary-400 focus:border-primary-500 resize-none"
            />
            {cancelError && (
              <div className="mt-3 text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">
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
                    setCancelError('Reason must be at least 3 characters (audit-logged).')
                    return
                  }
                  cancelMutation.mutate({ id: cancelTarget.id, reason: cancelReason.trim() })
                }}
                disabled={cancelMutation.isPending}
                className="btn-danger btn-sm"
              >
                {cancelMutation.isPending
                  ? t('platform.orgDetail.saving')
                  : t('platform.subscriptions.confirmCancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
