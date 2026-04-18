import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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

const STATUS_STYLES: Record<OrgStatus, string> = {
  active: 'bg-green-100 text-green-800',
  suspended: 'bg-amber-100 text-amber-800',
  deleted: 'bg-slate-200 text-slate-600',
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
        <h1 className="text-2xl font-semibold text-slate-900">{t('platform.orgs.title')}</h1>
        <div className="text-sm text-slate-500">
          {data ? t('platform.orgs.total', { n: data.total }) : '...'}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setSearch(searchInput.trim())
            setPage(1)
          }}
          className="flex-1 flex gap-2"
        >
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('platform.orgs.search')}
            className="flex-1 border border-slate-300 rounded px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="px-3 py-2 bg-slate-900 text-white text-sm rounded hover:bg-slate-800"
          >
            {t('platform.orgs.searchBtn')}
          </button>
        </form>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as OrgStatus | '')
            setPage(1)
          }}
          className="border border-slate-300 rounded px-3 py-2 text-sm"
        >
          <option value="">{t('platform.orgs.allStatuses')}</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="deleted">Deleted</option>
        </select>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-widest">
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
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  {t('platform.orgs.loading')}
                </td>
              </tr>
            )}
            {!listQuery.isLoading && data?.data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  {t('platform.orgs.noMatch')}
                </td>
              </tr>
            )}
            {data?.data.map((o) => (
              <tr key={o.orgId} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link to={`/platform/orgs/${o.orgId}`} className="text-slate-900 hover:underline">
                    {o.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block text-xs font-medium rounded px-2 py-0.5 ${STATUS_STYLES[o.status]}`}>
                    {o.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600 capitalize">{o.subscription?.plan ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{o.userCount}</td>
                <td className="px-4 py-3 text-slate-500">{new Date(o.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-end">
                  {o.status === 'active' ? (
                    <button
                      onClick={() => openModal(o, 'suspend')}
                      className="text-xs text-amber-700 hover:text-amber-900"
                    >
                      {t('platform.orgs.suspend')}
                    </button>
                  ) : o.status === 'suspended' ? (
                    <button
                      onClick={() => openModal(o, 'reactivate')}
                      className="text-xs text-green-700 hover:text-green-900"
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

      {modalOrg && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setModalOrg(null)}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-900">
              {modalAction === 'suspend' ? t('platform.orgs.suspend') : t('platform.orgs.reactivate')} {modalOrg.name}
            </h2>
            <label className="block mt-4 text-sm font-medium text-slate-700">
              {t('platform.orgDetail.statusReason')}
            </label>
            <textarea
              value={modalReason}
              onChange={(e) => setModalReason(e.target.value)}
              rows={3}
              className="mt-1 w-full border border-slate-300 rounded px-3 py-2 text-sm"
            />
            {modalError && (
              <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                {modalError}
              </div>
            )}
            <div className="mt-5 flex gap-2 justify-end">
              <button
                onClick={() => setModalOrg(null)}
                className="px-3 py-2 text-sm border border-slate-300 rounded hover:bg-slate-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={confirmModal}
                disabled={statusMutation.isPending}
                className={`px-3 py-2 text-sm text-white rounded disabled:opacity-60 ${
                  modalAction === 'suspend'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-green-700 hover:bg-green-800'
                }`}
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
