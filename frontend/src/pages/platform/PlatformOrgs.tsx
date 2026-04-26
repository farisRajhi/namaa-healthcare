import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Search, X } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { platformApi } from '../../lib/platformApi'
import { getErrorMessage } from '../../lib/api'

type OrgStatus = 'active' | 'suspended' | 'deleted'

interface OrgRow {
  orgId: string
  name: string
  status: OrgStatus
  suspendedAt: string | null
  suspendedReason: string | null
  defaultTimezone: string
  createdAt: string
  userCount: number
  subscription: { plan: string | null; status: string; endDate: string | null } | null
}

interface ListResponse {
  data: OrgRow[]
  total: number
  page: number
  pageSize: number
}

const STATUS_BADGE: Record<OrgStatus, string> = {
  active: 'bg-success-50 text-success-700 border-success-200',
  suspended: 'bg-warning-50 text-warning-700 border-warning-200',
  deleted: 'bg-healthcare-bg text-healthcare-muted border-healthcare-border',
}

export default function PlatformOrgs() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [pageSize] = useState(25)
  const [status, setStatus] = useState<OrgStatus | ''>('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const [modalOrg, setModalOrg] = useState<OrgRow | null>(null)
  const [modalAction, setModalAction] = useState<'suspend' | 'reactivate'>('suspend')
  const [modalReason, setModalReason] = useState('')
  const [modalError, setModalError] = useState<string | null>(null)

  const qc = useQueryClient()

  const listQuery = useQuery<ListResponse>({
    queryKey: ['platform', 'orgs', { page, pageSize, status, search }],
    queryFn: async () => {
      const res = await platformApi.get('/api/platform/orgs', {
        params: { page, pageSize, status: status || undefined, search: search || undefined },
      })
      return res.data
    },
  })

  const statusMutation = useMutation({
    mutationFn: async ({ orgId, next, reason }: { orgId: string; next: OrgStatus; reason: string }) => {
      return platformApi.patch(`/api/platform/orgs/${orgId}/status`, { status: next, reason })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform', 'orgs'] })
      qc.invalidateQueries({ queryKey: ['platform', 'metrics'] })
      setModalOrg(null)
      setModalReason('')
      setModalError(null)
    },
    onError: (err) => {
      setModalError(getErrorMessage(err).en)
    },
  })

  const openModal = (org: OrgRow, action: 'suspend' | 'reactivate') => {
    setModalOrg(org)
    setModalAction(action)
    setModalReason('')
    setModalError(null)
  }

  const confirmModal = () => {
    if (!modalOrg) return
    statusMutation.mutate({
      orgId: modalOrg.orgId,
      next: modalAction === 'suspend' ? 'suspended' : 'active',
      reason: modalReason.trim(),
    })
  }

  const data = listQuery.data
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold text-healthcare-text">
          {t('platform.orgs.title')}
        </h1>
        <div className="text-sm text-healthcare-muted">
          {data ? t('platform.orgs.total', { n: data.total }) : '...'}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setSearch(searchInput.trim())
            setPage(1)
          }}
          className="flex-1 flex gap-2 min-w-[240px]"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-healthcare-muted absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('platform.orgs.search')}
              className="w-full bg-white border border-healthcare-border rounded-lg ps-9 pe-3 py-2 text-sm text-healthcare-text focus:outline-none focus:ring-[3px] focus:ring-primary-400 focus:border-primary-500 transition-colors"
            />
          </div>
          <button type="submit" className="btn-primary btn-sm">
            {t('platform.orgs.searchBtn')}
          </button>
        </form>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as OrgStatus | '')
            setPage(1)
          }}
          className="bg-white border border-healthcare-border rounded-lg px-3 py-2 text-sm text-healthcare-text focus:outline-none focus:ring-[3px] focus:ring-primary-400 focus:border-primary-500"
        >
          <option value="">{t('platform.orgs.allStatuses')}</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="deleted">Deleted</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-healthcare-bg text-healthcare-muted text-[11px] uppercase tracking-widest font-semibold">
            <tr>
              <th className="text-start px-4 py-3">{t('platform.orgs.name')}</th>
              <th className="text-start px-4 py-3">{t('platform.orgs.status')}</th>
              <th className="text-start px-4 py-3">{t('platform.orgs.plan')}</th>
              <th className="text-start px-4 py-3">{t('platform.orgs.users')}</th>
              <th className="text-start px-4 py-3">{t('platform.orgs.createdAt')}</th>
              <th className="text-end px-4 py-3">{t('platform.orgs.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {listQuery.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-healthcare-muted">
                  {t('platform.orgs.loading')}
                </td>
              </tr>
            )}
            {!listQuery.isLoading && data?.data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-healthcare-muted">
                  {t('platform.orgs.noMatch')}
                </td>
              </tr>
            )}
            {data?.data.map((o) => (
              <tr
                key={o.orgId}
                className="border-t border-healthcare-border/40 hover:bg-healthcare-bg/60 transition-colors"
              >
                <td className="px-4 py-3">
                  <Link
                    to={`/platform/orgs/${o.orgId}`}
                    className="text-healthcare-text hover:text-primary-600 font-medium transition-colors"
                  >
                    {o.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block text-xs font-semibold border rounded-full px-2.5 py-0.5 ${STATUS_BADGE[o.status]}`}
                  >
                    {o.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-healthcare-muted capitalize">
                  {o.subscription?.plan ?? '—'}
                </td>
                <td className="px-4 py-3 text-healthcare-text tabular-nums">{o.userCount}</td>
                <td className="px-4 py-3 text-healthcare-muted tabular-nums">
                  {new Date(o.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-end">
                  {o.status === 'active' ? (
                    <button
                      onClick={() => openModal(o, 'suspend')}
                      className="text-xs font-semibold text-warning-700 hover:text-warning-800 transition-colors"
                    >
                      {t('platform.orgs.suspend')}
                    </button>
                  ) : o.status === 'suspended' ? (
                    <button
                      onClick={() => openModal(o, 'reactivate')}
                      className="text-xs font-semibold text-success-700 hover:text-success-800 transition-colors"
                    >
                      {t('platform.orgs.reactivate')}
                    </button>
                  ) : null}
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

      {modalOrg && (
        <div
          className="fixed inset-0 bg-healthcare-text/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
          onClick={() => setModalOrg(null)}
        >
          <div
            className="bg-white rounded-2xl border border-healthcare-border/40 shadow-modal p-6 max-w-md w-full animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <h2 className="font-heading text-lg font-semibold text-healthcare-text">
                {modalAction === 'suspend'
                  ? t('platform.orgs.suspend')
                  : t('platform.orgs.reactivate')}{' '}
                — {modalOrg.name}
              </h2>
              <button
                onClick={() => setModalOrg(null)}
                className="text-healthcare-muted hover:text-healthcare-text p-1 rounded-md hover:bg-healthcare-bg transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <label className="block mt-3 text-sm font-medium text-healthcare-text">
              {t('platform.orgDetail.statusReason')}
            </label>
            <textarea
              value={modalReason}
              onChange={(e) => setModalReason(e.target.value)}
              rows={3}
              className="mt-1 w-full bg-white border border-healthcare-border rounded-lg px-3 py-2 text-sm text-healthcare-text focus:outline-none focus:ring-[3px] focus:ring-primary-400 focus:border-primary-500 resize-none"
            />
            {modalError && (
              <div className="mt-3 text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">
                {modalError}
              </div>
            )}
            <div className="mt-5 flex gap-2 justify-end">
              <button onClick={() => setModalOrg(null)} className="btn-outline btn-sm">
                {t('common.cancel')}
              </button>
              <button
                onClick={confirmModal}
                disabled={statusMutation.isPending}
                className={modalAction === 'suspend' ? 'btn-warning btn-sm' : 'btn-success btn-sm'}
              >
                {statusMutation.isPending
                  ? t('platform.orgDetail.saving')
                  : modalAction === 'suspend'
                    ? t('platform.orgs.suspend')
                    : t('platform.orgs.reactivate')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
