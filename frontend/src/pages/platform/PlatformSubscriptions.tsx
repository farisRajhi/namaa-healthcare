import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
  active: 'bg-green-100 text-green-800',
  past_due: 'bg-amber-100 text-amber-800',
  cancelled: 'bg-orange-100 text-orange-800',
  expired: 'bg-slate-200 text-slate-600',
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
        <h1 className="text-2xl font-semibold text-slate-900">{t('platform.subscriptions.title')}</h1>
        <div className="text-sm text-slate-500">{data ? `${data.total} total` : '...'}</div>
      </div>

      <div className="flex gap-3">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
          className="border border-slate-300 rounded px-3 py-2 text-sm"
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
          className="border border-slate-300 rounded px-3 py-2 text-sm"
        >
          <option value="">{t('platform.subscriptions.allPlans')}</option>
          <option value="starter">starter</option>
          <option value="professional">professional</option>
          <option value="enterprise">enterprise</option>
        </select>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-widest">
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
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  {t('platform.orgs.loading')}
                </td>
              </tr>
            )}
            {data?.data.length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  {t('platform.subscriptions.noRows')}
                </td>
              </tr>
            )}
            {data?.data.map((s) => (
              <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  {s.org ? (
                    <Link to={`/platform/orgs/${s.org.orgId}`} className="text-slate-900 hover:underline">
                      {s.org.name}
                    </Link>
                  ) : (
                    <span className="text-slate-400">(unknown)</span>
                  )}
                </td>
                <td className="px-4 py-3 capitalize">{s.plan}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block text-xs font-medium rounded px-2 py-0.5 ${STATUS_BADGE[s.status]}`}>
                    {s.status}
                  </span>
                  {s.failedAttempts > 0 && (
                    <span className="ml-2 text-xs text-amber-700">{s.failedAttempts}× failed</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">{new Date(s.startDate).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-slate-500">{new Date(s.endDate).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-end space-x-2">
                  {s.status === 'past_due' && (
                    <button
                      onClick={() => retryMutation.mutate(s.id)}
                      disabled={retryMutation.isPending}
                      className="text-xs text-blue-700 hover:text-blue-900 disabled:opacity-50"
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
                      className="text-xs text-red-700 hover:text-red-900"
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
          className="px-3 py-1.5 text-sm border border-slate-300 rounded disabled:opacity-40"
        >
          {t('common.previous')}
        </button>
        <div className="text-sm text-slate-500">
          {t('platform.orgs.page', { page, total: totalPages })}
        </div>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className="px-3 py-1.5 text-sm border border-slate-300 rounded disabled:opacity-40"
        >
          {t('common.next')}
        </button>
      </div>

      {cancelTarget && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => !cancelMutation.isPending && setCancelTarget(null)}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-900">
              {t('platform.subscriptions.cancelTitle')}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {cancelTarget.org?.name} · {cancelTarget.plan}
            </p>
            <label className="block mt-4 text-sm font-medium text-slate-700">
              {t('platform.subscriptions.cancelReason')}
            </label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              className="mt-1 w-full border border-slate-300 rounded px-3 py-2 text-sm"
            />
            {cancelError && (
              <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                {cancelError}
              </div>
            )}
            <div className="mt-5 flex gap-2 justify-end">
              <button
                onClick={() => setCancelTarget(null)}
                disabled={cancelMutation.isPending}
                className="px-3 py-2 text-sm border border-slate-300 rounded hover:bg-slate-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  if (cancelReason.trim().length < 3) {
                    setCancelError(
                      'Reason must be at least 3 characters (audit-logged).',
                    )
                    return
                  }
                  cancelMutation.mutate({ id: cancelTarget.id, reason: cancelReason.trim() })
                }}
                disabled={cancelMutation.isPending}
                className="px-3 py-2 text-sm rounded bg-red-600 hover:bg-red-700 text-white disabled:opacity-60"
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
