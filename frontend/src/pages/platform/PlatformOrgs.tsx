import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Search, AlertTriangle, CheckCircle2, MinusCircle } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { platformApi } from '../../lib/platformApi'
import { getErrorMessage } from '../../lib/api'
import Modal from '../../components/ui/Modal'
import i18n from '../../i18n'

type OrgStatus = 'active' | 'suspended' | 'deleted'

interface OrgRow {
  orgId: string
  name: string
  nameAr?: string | null
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

const STATUS_BADGE: Record<OrgStatus, { cls: string; icon: typeof AlertTriangle }> = {
  active: { cls: 'bg-success-50 text-success-700 border-success-200', icon: CheckCircle2 },
  suspended: { cls: 'bg-warning-50 text-warning-700 border-warning-200', icon: AlertTriangle },
  deleted: { cls: 'bg-healthcare-bg text-healthcare-muted border-healthcare-border', icon: MinusCircle },
}

const STATUS_KEY: Record<OrgStatus, string> = {
  active: 'platform.orgs.statusActive',
  suspended: 'platform.orgs.statusSuspended',
  deleted: 'platform.orgs.statusDeleted',
}

export default function PlatformOrgs() {
  const { t } = useTranslation()
  const lang = i18n.language
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
    staleTime: 30_000,
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
      const m = getErrorMessage(err)
      setModalError(lang === 'ar' ? m.ar : m.en)
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

  const orgName = (o: OrgRow) => (lang === 'ar' ? (o.nameAr ?? o.name) : o.name)

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
            <label htmlFor="orgs-search" className="sr-only">
              {t('platform.orgs.search')}
            </label>
            <Search className="w-4 h-4 text-healthcare-muted absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
            <input
              id="orgs-search"
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
        <label htmlFor="orgs-status" className="sr-only">
          {t('platform.orgs.status')}
        </label>
        <select
          id="orgs-status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as OrgStatus | '')
            setPage(1)
          }}
          className="bg-white border border-healthcare-border rounded-lg px-3 py-2 text-sm text-healthcare-text focus:outline-none focus:ring-[3px] focus:ring-primary-400 focus:border-primary-500"
        >
          <option value="">{t('platform.orgs.allStatuses')}</option>
          <option value="active">{t('platform.orgs.statusActive')}</option>
          <option value="suspended">{t('platform.orgs.statusSuspended')}</option>
          <option value="deleted">{t('platform.orgs.statusDeleted')}</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm" aria-label={t('platform.orgs.title')}>
          <caption className="sr-only">{t('platform.orgs.title')}</caption>
          <thead className="bg-healthcare-bg text-healthcare-muted text-[11px] uppercase tracking-widest font-semibold">
            <tr>
              <th scope="col" className="text-start px-4 py-3">{t('platform.orgs.name')}</th>
              <th scope="col" className="text-start px-4 py-3">{t('platform.orgs.status')}</th>
              <th scope="col" className="text-start px-4 py-3">{t('platform.orgs.plan')}</th>
              <th scope="col" className="text-start px-4 py-3">{t('platform.orgs.users')}</th>
              <th scope="col" className="text-start px-4 py-3">{t('platform.orgs.createdAt')}</th>
              <th scope="col" className="text-end px-4 py-3">{t('platform.orgs.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {listQuery.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-healthcare-muted">
                  <span role="status" aria-live="polite">
                    {t('platform.orgs.loading')}
                  </span>
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
            {data?.data.map((o) => {
              const badge = STATUS_BADGE[o.status]
              const StatusIcon = badge.icon
              const planLabel = o.subscription?.plan ? t(`plans.${o.subscription.plan}`, { defaultValue: o.subscription.plan }) : '—'
              return (
                <tr
                  key={o.orgId}
                  className="border-t border-healthcare-border/40 hover:bg-healthcare-bg/60 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      to={`/platform/orgs/${o.orgId}`}
                      className="text-healthcare-text hover:text-primary-600 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 rounded"
                    >
                      {orgName(o)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold border rounded-full px-2.5 py-0.5 ${badge.cls}`}
                      aria-label={`${t('platform.orgs.status')}: ${t(STATUS_KEY[o.status])}`}
                    >
                      <StatusIcon className="w-3 h-3" aria-hidden="true" />
                      {t(STATUS_KEY[o.status])}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-healthcare-muted">
                    {planLabel}
                  </td>
                  <td className="px-4 py-3 text-healthcare-text tabular-nums">{o.userCount}</td>
                  <td className="px-4 py-3 text-healthcare-muted tabular-nums">
                    {new Date(o.createdAt).toLocaleDateString(lang)}
                  </td>
                  <td className="px-4 py-3 text-end">
                    {o.status === 'active' ? (
                      <button
                        onClick={() => openModal(o, 'suspend')}
                        className="btn-outline btn-sm text-warning-700 hover:bg-warning-50 focus-visible:ring-2 focus-visible:ring-warning-400"
                      >
                        {t('platform.orgs.suspend')}
                      </button>
                    ) : o.status === 'suspended' ? (
                      <button
                        onClick={() => openModal(o, 'reactivate')}
                        className="btn-outline btn-sm text-success-700 hover:bg-success-50 focus-visible:ring-2 focus-visible:ring-success-400"
                      >
                        {t('platform.orgs.reactivate')}
                      </button>
                    ) : null}
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
        open={!!modalOrg}
        onClose={() => setModalOrg(null)}
        title={
          modalOrg
            ? `${
                modalAction === 'suspend'
                  ? t('platform.orgs.suspend')
                  : t('platform.orgs.reactivate')
              } — ${orgName(modalOrg)}`
            : ''
        }
      >
        <label htmlFor="modal-reason" className="block text-sm font-medium text-healthcare-text">
          {t('platform.orgDetail.statusReason')}
        </label>
        <textarea
          id="modal-reason"
          value={modalReason}
          onChange={(e) => setModalReason(e.target.value)}
          rows={3}
          className="mt-1 w-full bg-white border border-healthcare-border rounded-lg px-3 py-2 text-sm text-healthcare-text focus:outline-none focus:ring-[3px] focus:ring-primary-400 focus:border-primary-500 resize-none"
        />
        {modalError && (
          <div role="alert" className="mt-3 text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">
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
            aria-busy={statusMutation.isPending}
            className={modalAction === 'suspend' ? 'btn-warning btn-sm' : 'btn-success btn-sm'}
          >
            {statusMutation.isPending
              ? t('platform.orgDetail.saving')
              : modalAction === 'suspend'
                ? t('platform.orgs.suspend')
                : t('platform.orgs.reactivate')}
          </button>
        </div>
      </Modal>
    </div>
  )
}
