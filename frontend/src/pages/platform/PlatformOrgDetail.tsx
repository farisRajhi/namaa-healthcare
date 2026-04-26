import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Users,
  Building2,
  UserCheck,
  CalendarDays,
  MessageSquare,
  ShieldAlert,
  Wallet,
  UserCog,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { platformApi } from '../../lib/platformApi'
import { getErrorMessage } from '../../lib/api'
import AuditLogList from '../../components/platform/AuditLogList'

type OrgStatus = 'active' | 'suspended' | 'deleted'

interface OrgDetail {
  orgId: string
  name: string
  status: OrgStatus
  suspendedAt: string | null
  suspendedReason: string | null
  defaultTimezone: string
  aiAutoReply: boolean
  createdAt: string
  counts: {
    users: number
    facilities: number
    patients: number
    appointments: number
    smsMessages: number
  }
  subscription: null | {
    id: string
    plan: string
    status: string
    startDate: string
    endDate: string
  }
  lastActivityAt: string | null
}

const STATUS_BADGE: Record<OrgStatus, string> = {
  active: 'bg-success-50 text-success-700 border-success-200',
  suspended: 'bg-warning-50 text-warning-700 border-warning-200',
  deleted: 'bg-healthcare-bg text-healthcare-muted border-healthcare-border',
}

function StatusPill({ status }: { status: OrgStatus }) {
  return (
    <span
      className={`inline-block text-xs font-semibold border rounded-full px-2.5 py-0.5 ${STATUS_BADGE[status]}`}
    >
      {status}
    </span>
  )
}

export default function PlatformOrgDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [statusReason, setStatusReason] = useState('')
  const [statusError, setStatusError] = useState<string | null>(null)

  const [subPlan, setSubPlan] = useState<'starter' | 'professional' | 'enterprise' | ''>('')
  const [subEnd, setSubEnd] = useState('')
  const [subReason, setSubReason] = useState('')
  const [subError, setSubError] = useState<string | null>(null)
  const [subSaved, setSubSaved] = useState(false)

  const [impError, setImpError] = useState<string | null>(null)
  const [showImpConfirm, setShowImpConfirm] = useState(false)

  const detailQuery = useQuery<OrgDetail>({
    queryKey: ['platform', 'org', id],
    queryFn: async () => (await platformApi.get(`/api/platform/orgs/${id}`)).data,
    enabled: !!id,
  })

  const statusMutation = useMutation({
    mutationFn: async ({ next, reason }: { next: OrgStatus; reason: string }) =>
      platformApi.patch(`/api/platform/orgs/${id}/status`, { status: next, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform', 'org', id] })
      qc.invalidateQueries({ queryKey: ['platform', 'orgs'] })
      setStatusReason('')
      setStatusError(null)
    },
    onError: (err) => setStatusError(getErrorMessage(err).en),
  })

  const subMutation = useMutation({
    mutationFn: async () =>
      platformApi.patch(`/api/platform/orgs/${id}/subscription`, {
        plan: subPlan || undefined,
        endDate: subEnd ? new Date(subEnd).toISOString() : undefined,
        reason: subReason,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform', 'org', id] })
      qc.invalidateQueries({ queryKey: ['platform', 'subscriptions'] })
      setSubError(null)
      setSubSaved(true)
      setTimeout(() => setSubSaved(false), 2000)
    },
    onError: (err) => setSubError(getErrorMessage(err).en),
  })

  const impMutation = useMutation({
    mutationFn: async () => platformApi.post(`/api/platform/orgs/${id}/impersonate`, {}),
    onSuccess: (resp) => {
      const { token, expiresAt, org } = resp.data
      localStorage.setItem('token', token)
      sessionStorage.setItem(
        'impersonating',
        JSON.stringify({ orgName: org?.name ?? 'Unknown', expiresAt }),
      )
      window.location.href = '/dashboard'
    },
    onError: (err) => setImpError(getErrorMessage(err).en),
  })

  if (detailQuery.isLoading) {
    return <div className="text-healthcare-muted text-sm">Loading…</div>
  }
  if (detailQuery.error || !detailQuery.data) {
    return <div className="text-danger-600 text-sm">Failed to load org.</div>
  }

  const org = detailQuery.data
  const canSuspend = org.status === 'active'
  const canReactivate = org.status === 'suspended'

  const counts = [
    { label: 'Users', v: org.counts.users, icon: Users, tone: 'primary' },
    { label: 'Facilities', v: org.counts.facilities, icon: Building2, tone: 'secondary' },
    { label: 'Patients', v: org.counts.patients.toLocaleString(), icon: UserCheck, tone: 'success' },
    {
      label: 'Appointments',
      v: org.counts.appointments.toLocaleString(),
      icon: CalendarDays,
      tone: 'primary',
    },
    {
      label: 'SMS sent',
      v: org.counts.smsMessages.toLocaleString(),
      icon: MessageSquare,
      tone: 'secondary',
    },
  ] as const

  const TONE: Record<string, { iconBg: string; iconText: string }> = {
    primary: { iconBg: 'bg-primary-50', iconText: 'text-primary-600' },
    secondary: { iconBg: 'bg-secondary-50', iconText: 'text-secondary-700' },
    success: { iconBg: 'bg-success-50', iconText: 'text-success-600' },
  }

  return (
    <div className="space-y-6">
      <Link
        to="/platform/orgs"
        className="inline-flex items-center gap-1.5 text-sm text-healthcare-muted hover:text-primary-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        All organizations
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold text-healthcare-text">{org.name}</h1>
          <div className="mt-2 flex items-center gap-3 text-sm text-healthcare-muted flex-wrap">
            <StatusPill status={org.status} />
            <span>Created {new Date(org.createdAt).toLocaleDateString()}</span>
            <span className="text-healthcare-border">·</span>
            <span>Timezone {org.defaultTimezone}</span>
          </div>
          {org.status === 'suspended' && org.suspendedReason && (
            <div className="mt-3 text-sm text-warning-800 bg-warning-50 border border-warning-200 rounded-lg px-3 py-2">
              <strong>Suspended</strong>{' '}
              {org.suspendedAt ? new Date(org.suspendedAt).toLocaleString() : ''} —{' '}
              {org.suspendedReason}
            </div>
          )}
        </div>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {counts.map((c) => {
          const t = TONE[c.tone]
          const Icon = c.icon
          return (
            <div key={c.label} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-widest text-healthcare-muted font-semibold">
                    {c.label}
                  </div>
                  <div className="mt-1 font-heading text-2xl font-semibold text-healthcare-text tabular-nums">
                    {c.v}
                  </div>
                </div>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${t.iconBg} ${t.iconText}`}>
                  <Icon className="w-4 h-4" />
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
              <ShieldAlert className="w-4 h-4" />
            </div>
            <h2 className="font-heading text-base font-semibold text-healthcare-text">Status</h2>
          </div>
          <textarea
            value={statusReason}
            onChange={(e) => setStatusReason(e.target.value)}
            rows={2}
            placeholder="Reason for the audit log…"
            className="w-full bg-white border border-healthcare-border rounded-lg px-3 py-2 text-sm text-healthcare-text focus:outline-none focus:ring-[3px] focus:ring-primary-400 focus:border-primary-500 resize-none"
          />
          {statusError && (
            <div className="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">
              {statusError}
            </div>
          )}
          <div className="flex gap-2">
            <button
              disabled={!canSuspend || statusMutation.isPending}
              onClick={() => statusMutation.mutate({ next: 'suspended', reason: statusReason })}
              className="btn-warning btn-sm"
            >
              Suspend
            </button>
            <button
              disabled={!canReactivate || statusMutation.isPending}
              onClick={() => statusMutation.mutate({ next: 'active', reason: statusReason })}
              className="btn-success btn-sm"
            >
              Reactivate
            </button>
          </div>
        </div>

        {/* Subscription override */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-secondary-50 text-secondary-700 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
            <h2 className="font-heading text-base font-semibold text-healthcare-text">
              Subscription
            </h2>
          </div>
          {org.subscription ? (
            <div className="text-sm space-y-1 bg-healthcare-bg rounded-lg p-3 border border-healthcare-border/40">
              <div>
                <span className="text-healthcare-muted">Plan:</span>{' '}
                <span className="font-semibold text-healthcare-text capitalize">
                  {org.subscription.plan}
                </span>
              </div>
              <div>
                <span className="text-healthcare-muted">Status:</span>{' '}
                <span className="font-medium text-healthcare-text">{org.subscription.status}</span>
              </div>
              <div>
                <span className="text-healthcare-muted">Ends:</span>{' '}
                <span className="font-medium text-healthcare-text tabular-nums">
                  {new Date(org.subscription.endDate).toLocaleDateString()}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-healthcare-muted italic">No subscription yet.</div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-healthcare-muted mb-1 font-medium">Plan</label>
              <select
                value={subPlan}
                onChange={(e) => setSubPlan(e.target.value as typeof subPlan)}
                className="w-full bg-white border border-healthcare-border rounded-lg px-2 py-1.5 text-sm text-healthcare-text focus:outline-none focus:ring-[3px] focus:ring-primary-400 focus:border-primary-500"
              >
                <option value="">(unchanged)</option>
                <option value="starter">starter</option>
                <option value="professional">professional</option>
                <option value="enterprise">enterprise</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-healthcare-muted mb-1 font-medium">End date</label>
              <input
                type="date"
                value={subEnd}
                onChange={(e) => setSubEnd(e.target.value)}
                className="w-full bg-white border border-healthcare-border rounded-lg px-2 py-1.5 text-sm text-healthcare-text focus:outline-none focus:ring-[3px] focus:ring-primary-400 focus:border-primary-500"
              />
            </div>
          </div>
          <textarea
            value={subReason}
            onChange={(e) => setSubReason(e.target.value)}
            rows={2}
            placeholder="Reason (required, audited)…"
            className="w-full bg-white border border-healthcare-border rounded-lg px-3 py-2 text-sm text-healthcare-text focus:outline-none focus:ring-[3px] focus:ring-primary-400 focus:border-primary-500 resize-none"
          />
          {subError && (
            <div className="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">
              {subError}
            </div>
          )}
          {subSaved && (
            <div className="text-sm text-success-700 bg-success-50 border border-success-200 rounded-lg px-3 py-2">
              Subscription updated.
            </div>
          )}
          <button
            disabled={(!subPlan && !subEnd) || subReason.trim().length < 3 || subMutation.isPending}
            onClick={() => subMutation.mutate()}
            className="btn-primary btn-sm"
          >
            {subMutation.isPending ? 'Saving…' : 'Override subscription'}
          </button>
        </div>
      </div>

      {/* Impersonate */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-danger-50 text-danger-600 flex items-center justify-center">
            <UserCog className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-heading text-base font-semibold text-healthcare-text">
              Impersonate
            </h2>
            <p className="text-sm text-healthcare-muted mt-0.5">
              Signs you into this org as an admin user for 15 minutes. Every action is
              audit-logged with your platform admin ID.
            </p>
          </div>
        </div>
        {impError && (
          <div className="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">
            {impError}
          </div>
        )}
        {!showImpConfirm ? (
          <button
            onClick={() => setShowImpConfirm(true)}
            disabled={org.status !== 'active'}
            className="btn-primary btn-sm"
          >
            Impersonate admin
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowImpConfirm(false)
                impMutation.mutate()
              }}
              disabled={impMutation.isPending}
              className="btn-danger btn-sm"
            >
              {impMutation.isPending ? 'Starting…' : 'Confirm — go to /dashboard'}
            </button>
            <button onClick={() => setShowImpConfirm(false)} className="btn-outline btn-sm">
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Audit log */}
      <div className="card p-5 space-y-3">
        <div>
          <h2 className="font-heading text-base font-semibold text-healthcare-text">Audit log</h2>
          <p className="text-sm text-healthcare-muted mt-0.5">
            Every action against this org — staff logins, suspensions, subscription changes,
            impersonations.
          </p>
        </div>
        {id && <AuditLogList orgId={id} limit={25} />}
      </div>

      {org.lastActivityAt && (
        <div className="text-xs text-healthcare-muted">
          Last logged activity: {new Date(org.lastActivityAt).toLocaleString()}
        </div>
      )}

      <div>
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-healthcare-muted hover:text-primary-600 transition-colors"
        >
          ← Back
        </button>
      </div>
    </div>
  )
}
