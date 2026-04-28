import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  ArrowRight,
  Users,
  Building2,
  UserCheck,
  CalendarDays,
  MessageSquare,
  ShieldAlert,
  Power,
  UserCog,
  AlertTriangle,
  CheckCircle2,
  MinusCircle,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { platformApi } from '../../lib/platformApi'
import { getErrorMessage } from '../../lib/api'
import AuditLogList from '../../components/platform/AuditLogList'
import Modal from '../../components/ui/Modal'
import i18n from '../../i18n'

type OrgStatus = 'active' | 'suspended' | 'deleted'

interface OrgDetail {
  orgId: string
  name: string
  nameAr?: string | null
  status: OrgStatus
  suspendedAt: string | null
  suspendedReason: string | null
  defaultTimezone: string
  aiAutoReply: boolean
  createdAt: string
  isActivated: boolean
  activatedAt: string | null
  activatedBy: { name: string | null; email: string } | null
  counts: {
    users: number
    facilities: number
    patients: number
    appointments: number
    smsMessages: number
  }
  lastActivityAt: string | null
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

const TONE: Record<string, { iconBg: string; iconText: string }> = {
  primary: { iconBg: 'bg-primary-50', iconText: 'text-primary-600' },
  secondary: { iconBg: 'bg-secondary-50', iconText: 'text-secondary-700' },
  success: { iconBg: 'bg-success-50', iconText: 'text-success-600' },
}

function StatusPill({ status }: { status: OrgStatus }) {
  const { t } = useTranslation()
  const badge = STATUS_BADGE[status]
  const Icon = badge.icon
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold border rounded-full px-2.5 py-0.5 ${badge.cls}`}
      aria-label={`${t('platform.orgs.status')}: ${t(STATUS_KEY[status])}`}
    >
      <Icon className="w-3 h-3" aria-hidden="true" />
      {t(STATUS_KEY[status])}
    </span>
  )
}

function ActivationPill({ isActivated }: { isActivated: boolean }) {
  const { t } = useTranslation()
  return isActivated ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold border rounded-full px-2.5 py-0.5 bg-success-50 text-success-700 border-success-200">
      <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
      {t('platform.orgs.activationActivated', 'Activated')}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-semibold border rounded-full px-2.5 py-0.5 bg-warning-50 text-warning-700 border-warning-200">
      <Power className="w-3 h-3" aria-hidden="true" />
      {t('platform.orgs.activationNotActivated', 'Not activated')}
    </span>
  )
}

export default function PlatformOrgDetail() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const lang = i18n.language
  const isRTL = lang === 'ar'
  const qc = useQueryClient()

  const [statusReason, setStatusReason] = useState('')
  const [statusError, setStatusError] = useState<string | null>(null)
  const [statusConfirm, setStatusConfirm] = useState<null | OrgStatus>(null)

  const [activationReason, setActivationReason] = useState('')
  const [activationError, setActivationError] = useState<string | null>(null)
  const [activationConfirm, setActivationConfirm] = useState<null | boolean>(null)

  const [impError, setImpError] = useState<string | null>(null)
  const [showImpConfirm, setShowImpConfirm] = useState(false)

  const detailQuery = useQuery<OrgDetail>({
    queryKey: ['platform', 'org', id],
    queryFn: async () => (await platformApi.get(`/api/platform/orgs/${id}`)).data,
    enabled: !!id,
    staleTime: 30_000,
  })

  const statusMutation = useMutation({
    mutationFn: async ({ next, reason }: { next: OrgStatus; reason: string }) =>
      platformApi.patch(`/api/platform/orgs/${id}/status`, { status: next, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform', 'org', id] })
      qc.invalidateQueries({ queryKey: ['platform', 'orgs'] })
      setStatusReason('')
      setStatusError(null)
      setStatusConfirm(null)
    },
    onError: (err) => {
      const m = getErrorMessage(err)
      setStatusError(isRTL ? m.ar : m.en)
    },
  })

  const activationMutation = useMutation({
    mutationFn: async ({ isActivated, reason }: { isActivated: boolean; reason: string }) =>
      platformApi.patch(`/api/platform/orgs/${id}/activation`, {
        isActivated,
        reason: reason || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform', 'org', id] })
      qc.invalidateQueries({ queryKey: ['platform', 'orgs'] })
      setActivationReason('')
      setActivationError(null)
      setActivationConfirm(null)
    },
    onError: (err) => {
      const m = getErrorMessage(err)
      setActivationError(isRTL ? m.ar : m.en)
    },
  })

  const impMutation = useMutation({
    mutationFn: async () => platformApi.post(`/api/platform/orgs/${id}/impersonate`, {}),
    onSuccess: (resp) => {
      const { token, expiresAt, org } = resp.data
      const orgName = (isRTL ? org?.nameAr : org?.name) ?? org?.name ?? t('common.unknown')
      localStorage.setItem('token', token)
      sessionStorage.setItem('impersonating', JSON.stringify({ orgName, expiresAt }))
      window.location.href = '/dashboard'
    },
    onError: (err) => {
      const m = getErrorMessage(err)
      setImpError(isRTL ? m.ar : m.en)
    },
  })

  const counts = useMemo(() => {
    if (!detailQuery.data) return [] as const
    const c = detailQuery.data.counts
    return [
      { key: 'users', label: t('platform.orgDetail.users'), v: c.users, icon: Users, tone: 'primary' },
      { key: 'facilities', label: t('platform.orgDetail.facilities'), v: c.facilities, icon: Building2, tone: 'secondary' },
      { key: 'patients', label: t('platform.orgDetail.patients'), v: c.patients.toLocaleString(lang), icon: UserCheck, tone: 'success' },
      { key: 'appointments', label: t('platform.orgDetail.appointments'), v: c.appointments.toLocaleString(lang), icon: CalendarDays, tone: 'primary' },
      { key: 'smsSent', label: t('platform.orgDetail.smsSent'), v: c.smsMessages.toLocaleString(lang), icon: MessageSquare, tone: 'secondary' },
    ] as const
  }, [detailQuery.data, t, lang])

  if (detailQuery.isLoading) {
    return (
      <div role="status" aria-live="polite" className="text-healthcare-muted text-sm">
        {t('platform.orgDetail.loading')}
      </div>
    )
  }
  if (detailQuery.error || !detailQuery.data) {
    return (
      <div role="alert" className="text-danger-600 text-sm">
        {t('platform.orgDetail.loadFailed')}
      </div>
    )
  }

  const org = detailQuery.data
  const orgDisplayName = isRTL ? (org.nameAr ?? org.name) : org.name
  const canSuspend = org.status === 'active'
  const canReactivate = org.status === 'suspended'
  const BackArrow = isRTL ? ArrowRight : ArrowLeft

  return (
    <div className="space-y-6">
      <Link
        to="/platform/orgs"
        className="inline-flex items-center gap-1.5 text-sm text-healthcare-muted hover:text-primary-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 rounded"
      >
        <BackArrow className="w-4 h-4" aria-hidden="true" />
        {t('platform.orgDetail.back')}
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold text-healthcare-text">{orgDisplayName}</h1>
          <div className="mt-2 flex items-center gap-3 text-sm text-healthcare-muted flex-wrap">
            <StatusPill status={org.status} />
            <ActivationPill isActivated={org.isActivated} />
            <span>{t('platform.orgDetail.created', { date: new Date(org.createdAt).toLocaleDateString(lang) })}</span>
            <span className="text-healthcare-border">·</span>
            <span>{t('platform.orgDetail.timezone', { tz: org.defaultTimezone })}</span>
          </div>
          {org.activatedAt && (
            <div className="mt-2 text-xs text-healthcare-muted">
              {t('platform.orgDetail.activatedAt', 'Activated at')}:{' '}
              <span className="text-healthcare-text">{new Date(org.activatedAt).toLocaleString(lang)}</span>
              {org.activatedBy && (
                <>
                  {' · '}
                  {t('platform.orgDetail.activatedBy', 'by')}:{' '}
                  <span className="text-healthcare-text">{org.activatedBy.name ?? org.activatedBy.email}</span>
                </>
              )}
            </div>
          )}
          {org.status === 'suspended' && org.suspendedReason && (
            <div role="status" className="mt-3 text-sm text-warning-800 bg-warning-50 border border-warning-200 rounded-lg px-3 py-2">
              <strong>{t('platform.orgDetail.suspendedHeading')}</strong>{' '}
              {org.suspendedAt ? new Date(org.suspendedAt).toLocaleString(lang) : ''} —{' '}
              {org.suspendedReason}
            </div>
          )}
        </div>
      </div>

      {/* Counts */}
      <h2 className="sr-only">{t('platform.orgDetail.users')}</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {counts.map((c) => {
          const tone = TONE[c.tone]
          const Icon = c.icon
          return (
            <div key={c.key} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-widest text-healthcare-muted font-semibold">
                    {c.label}
                  </div>
                  <div className="mt-1 font-heading text-2xl font-semibold text-healthcare-text tabular-nums">
                    {c.v}
                  </div>
                </div>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tone.iconBg} ${tone.iconText}`}>
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status controls */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-warning-50 text-warning-600 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" aria-hidden="true" />
            </div>
            <h2 className="font-heading text-base font-semibold text-healthcare-text">
              {t('platform.orgDetail.statusSection')}
            </h2>
          </div>
          <label htmlFor="status-reason" className="sr-only">
            {t('platform.orgDetail.statusReason')}
          </label>
          <textarea
            id="status-reason"
            value={statusReason}
            onChange={(e) => setStatusReason(e.target.value)}
            rows={2}
            placeholder={t('platform.orgDetail.statusReason')}
            className="w-full bg-white border border-healthcare-border rounded-lg px-3 py-2 text-sm text-healthcare-text focus:outline-none focus:ring-[3px] focus:ring-primary-400 focus:border-primary-500 resize-none"
          />
          {statusError && (
            <div role="alert" className="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">
              {statusError}
            </div>
          )}
          <div className="flex gap-2">
            <button
              disabled={!canSuspend || statusMutation.isPending}
              onClick={() => setStatusConfirm('suspended')}
              className="btn-warning btn-sm focus-visible:ring-2 focus-visible:ring-warning-400"
            >
              {t('platform.orgs.suspend')}
            </button>
            <button
              disabled={!canReactivate || statusMutation.isPending}
              onClick={() => setStatusConfirm('active')}
              className="btn-success btn-sm focus-visible:ring-2 focus-visible:ring-success-400"
            >
              {t('platform.orgs.reactivate')}
            </button>
          </div>
        </div>

        {/* Activation toggle */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
              <Power className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-heading text-base font-semibold text-healthcare-text">
                {t('platform.orgDetail.activationSection', 'Activation')}
              </h2>
              <p className="text-sm text-healthcare-muted mt-0.5">
                {t(
                  'platform.orgDetail.activationBlurb',
                  'Activate to unlock all clinic features. Deactivate to lock the dashboard while keeping the account.',
                )}
              </p>
            </div>
          </div>
          <label htmlFor="activation-reason" className="sr-only">
            {t('platform.orgDetail.activationReason', 'Reason')}
          </label>
          <textarea
            id="activation-reason"
            value={activationReason}
            onChange={(e) => setActivationReason(e.target.value)}
            rows={2}
            placeholder={t('platform.orgDetail.activationReason', 'Reason (optional, ≥3 chars)')}
            className="w-full bg-white border border-healthcare-border rounded-lg px-3 py-2 text-sm text-healthcare-text focus:outline-none focus:ring-[3px] focus:ring-primary-400 focus:border-primary-500 resize-none"
          />
          {activationError && (
            <div role="alert" className="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">
              {activationError}
            </div>
          )}
          <div className="flex gap-2">
            {org.isActivated ? (
              <button
                disabled={activationMutation.isPending}
                onClick={() => setActivationConfirm(false)}
                className="btn-warning btn-sm focus-visible:ring-2 focus-visible:ring-warning-400"
              >
                {t('platform.orgs.deactivate', 'Deactivate')}
              </button>
            ) : (
              <button
                disabled={activationMutation.isPending}
                onClick={() => setActivationConfirm(true)}
                className="btn-primary btn-sm focus-visible:ring-2 focus-visible:ring-primary-400"
              >
                {t('platform.orgs.activate', 'Activate')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Impersonate */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-danger-50 text-danger-600 flex items-center justify-center">
            <UserCog className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-heading text-base font-semibold text-healthcare-text">
              {t('platform.orgDetail.impersonateSection')}
            </h2>
            <p className="text-sm text-healthcare-muted mt-0.5">
              {t('platform.orgDetail.impersonateBlurb')}
            </p>
          </div>
        </div>
        {impError && (
          <div role="alert" className="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">
            {impError}
          </div>
        )}
        <button
          onClick={() => setShowImpConfirm(true)}
          disabled={org.status !== 'active'}
          className="btn-primary btn-sm focus-visible:ring-2 focus-visible:ring-primary-400"
        >
          {t('platform.orgDetail.impersonateBtn')}
        </button>
      </div>

      {/* Audit log */}
      <div className="card p-5 space-y-3">
        <div>
          <h2 className="font-heading text-base font-semibold text-healthcare-text">
            {t('platform.orgDetail.auditSection')}
          </h2>
          <p className="text-sm text-healthcare-muted mt-0.5">
            {t('platform.orgDetail.auditDescription')}
          </p>
        </div>
        {id && <AuditLogList orgId={id} limit={25} />}
      </div>

      {org.lastActivityAt && (
        <div className="text-xs text-healthcare-muted">
          {t('platform.orgDetail.lastActivity', { when: new Date(org.lastActivityAt).toLocaleString(lang) })}
        </div>
      )}

      <div>
        <Link
          to="/platform/orgs"
          className="inline-flex items-center gap-1 text-sm text-healthcare-muted hover:text-primary-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 rounded"
        >
          <BackArrow className="w-4 h-4" aria-hidden="true" />
          {t('platform.orgDetail.backShort')}
        </Link>
      </div>

      {/* Status confirmation modal */}
      <Modal
        open={!!statusConfirm}
        onClose={() => !statusMutation.isPending && setStatusConfirm(null)}
        title={statusConfirm === 'suspended' ? t('platform.orgs.suspend') : t('platform.orgs.reactivate')}
      >
        <p className="text-sm text-healthcare-muted">
          {statusConfirm === 'suspended' ? t('platform.orgs.suspend') : t('platform.orgs.reactivate')} — {orgDisplayName}
        </p>
        <div className="mt-5 flex gap-2 justify-end">
          <button
            onClick={() => setStatusConfirm(null)}
            disabled={statusMutation.isPending}
            className="btn-outline btn-sm"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={() => statusConfirm && statusMutation.mutate({ next: statusConfirm, reason: statusReason.trim() })}
            disabled={statusMutation.isPending}
            aria-busy={statusMutation.isPending}
            className={statusConfirm === 'suspended' ? 'btn-warning btn-sm' : 'btn-success btn-sm'}
          >
            {statusMutation.isPending
              ? t('platform.orgDetail.saving')
              : statusConfirm === 'suspended'
                ? t('platform.orgs.suspend')
                : t('platform.orgs.reactivate')}
          </button>
        </div>
      </Modal>

      {/* Activation confirmation modal */}
      <Modal
        open={activationConfirm !== null}
        onClose={() => !activationMutation.isPending && setActivationConfirm(null)}
        title={activationConfirm ? t('platform.orgs.activate', 'Activate') : t('platform.orgs.deactivate', 'Deactivate')}
      >
        <p className="text-sm text-healthcare-muted">
          {activationConfirm
            ? t('platform.orgs.activate', 'Activate')
            : t('platform.orgs.deactivate', 'Deactivate')}{' '}
          — {orgDisplayName}
        </p>
        <div className="mt-5 flex gap-2 justify-end">
          <button
            onClick={() => setActivationConfirm(null)}
            disabled={activationMutation.isPending}
            className="btn-outline btn-sm"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={() =>
              activationConfirm !== null &&
              activationMutation.mutate({ isActivated: activationConfirm, reason: activationReason.trim() })
            }
            disabled={activationMutation.isPending}
            aria-busy={activationMutation.isPending}
            className={activationConfirm ? 'btn-primary btn-sm' : 'btn-warning btn-sm'}
          >
            {activationMutation.isPending
              ? t('platform.orgDetail.saving')
              : activationConfirm
                ? t('platform.orgs.activate', 'Activate')
                : t('platform.orgs.deactivate', 'Deactivate')}
          </button>
        </div>
      </Modal>

      {/* Impersonate confirmation modal */}
      <Modal
        open={showImpConfirm}
        onClose={() => !impMutation.isPending && setShowImpConfirm(false)}
        title={t('platform.orgDetail.impersonateBtn')}
      >
        <p className="text-sm text-healthcare-muted">{t('platform.orgDetail.impersonateBlurb')}</p>
        <div className="mt-5 flex gap-2 justify-end">
          <button
            onClick={() => setShowImpConfirm(false)}
            disabled={impMutation.isPending}
            className="btn-outline btn-sm"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={() => {
              setShowImpConfirm(false)
              impMutation.mutate()
            }}
            disabled={impMutation.isPending}
            aria-busy={impMutation.isPending}
            className="btn-danger btn-sm"
          >
            {impMutation.isPending
              ? t('platform.orgDetail.impersonateStarting')
              : t('platform.orgDetail.impersonateConfirm')}
          </button>
        </div>
      </Modal>
    </div>
  )
}
