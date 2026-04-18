import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
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

function StatusPill({ status }: { status: OrgStatus }) {
  const styles: Record<OrgStatus, string> = {
    active: 'bg-green-100 text-green-800',
    suspended: 'bg-amber-100 text-amber-800',
    deleted: 'bg-slate-200 text-slate-600',
  }
  return (
    <span className={`inline-block text-xs font-medium rounded px-2 py-0.5 ${styles[status]}`}>
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
    return <div className="text-slate-500">Loading…</div>
  }
  if (detailQuery.error || !detailQuery.data) {
    return <div className="text-red-600">Failed to load org.</div>
  }

  const org = detailQuery.data
  const canSuspend = org.status === 'active'
  const canReactivate = org.status === 'suspended'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <Link to="/platform/orgs" className="hover:underline">← All organizations</Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{org.name}</h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-slate-500">
            <StatusPill status={org.status} />
            <span>Created {new Date(org.createdAt).toLocaleDateString()}</span>
            <span>Timezone {org.defaultTimezone}</span>
          </div>
          {org.status === 'suspended' && org.suspendedReason && (
            <div className="mt-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
              Suspended {org.suspendedAt ? new Date(org.suspendedAt).toLocaleString() : ''} — {org.suspendedReason}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Users', v: org.counts.users },
          { label: 'Facilities', v: org.counts.facilities },
          { label: 'Patients', v: org.counts.patients.toLocaleString() },
          { label: 'Appointments', v: org.counts.appointments.toLocaleString() },
          { label: 'SMS sent', v: org.counts.smsMessages.toLocaleString() },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs uppercase tracking-widest text-slate-500">{c.label}</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{c.v}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status controls */}
        <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-widest">Status</h2>
          <textarea
            value={statusReason}
            onChange={(e) => setStatusReason(e.target.value)}
            rows={2}
            placeholder="Reason for the audit log…"
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
          />
          {statusError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {statusError}
            </div>
          )}
          <div className="flex gap-2">
            <button
              disabled={!canSuspend || statusMutation.isPending}
              onClick={() => statusMutation.mutate({ next: 'suspended', reason: statusReason })}
              className="px-3 py-2 text-sm text-white rounded bg-amber-600 hover:bg-amber-700 disabled:opacity-40"
            >
              Suspend
            </button>
            <button
              disabled={!canReactivate || statusMutation.isPending}
              onClick={() => statusMutation.mutate({ next: 'active', reason: statusReason })}
              className="px-3 py-2 text-sm text-white rounded bg-green-700 hover:bg-green-800 disabled:opacity-40"
            >
              Reactivate
            </button>
          </div>
        </div>

        {/* Subscription override */}
        <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-widest">Subscription</h2>
          {org.subscription ? (
            <div className="text-sm text-slate-600 space-y-0.5">
              <div>
                <span className="text-slate-500">Plan</span>{' '}
                <span className="font-medium capitalize">{org.subscription.plan}</span>
              </div>
              <div>
                <span className="text-slate-500">Status</span>{' '}
                <span className="font-medium">{org.subscription.status}</span>
              </div>
              <div>
                <span className="text-slate-500">Ends</span>{' '}
                <span className="font-medium">{new Date(org.subscription.endDate).toLocaleDateString()}</span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-500">No subscription yet.</div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Plan</label>
              <select
                value={subPlan}
                onChange={(e) => setSubPlan(e.target.value as typeof subPlan)}
                className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
              >
                <option value="">(unchanged)</option>
                <option value="starter">starter</option>
                <option value="professional">professional</option>
                <option value="enterprise">enterprise</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">End date</label>
              <input
                type="date"
                value={subEnd}
                onChange={(e) => setSubEnd(e.target.value)}
                className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <textarea
            value={subReason}
            onChange={(e) => setSubReason(e.target.value)}
            rows={2}
            placeholder="Reason (required, audited)…"
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
          />
          {subError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {subError}
            </div>
          )}
          {subSaved && (
            <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
              Subscription updated.
            </div>
          )}
          <button
            disabled={(!subPlan && !subEnd) || subReason.trim().length < 3 || subMutation.isPending}
            onClick={() => subMutation.mutate()}
            className="px-3 py-2 text-sm text-white rounded bg-slate-900 hover:bg-slate-800 disabled:opacity-40"
          >
            {subMutation.isPending ? 'Saving…' : 'Override subscription'}
          </button>
        </div>
      </div>

      {/* Impersonate */}
      <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-widest">Impersonate</h2>
          <p className="text-sm text-slate-500 mt-1">
            Signs you into this org as an admin user for 15 minutes. Every action is audit-logged with your platform
            admin ID.
          </p>
        </div>
        {impError && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {impError}
          </div>
        )}
        {!showImpConfirm ? (
          <button
            onClick={() => setShowImpConfirm(true)}
            disabled={org.status !== 'active'}
            className="px-3 py-2 text-sm text-white rounded bg-slate-900 hover:bg-slate-800 disabled:opacity-40"
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
              className="px-3 py-2 text-sm text-white rounded bg-red-700 hover:bg-red-800 disabled:opacity-60"
            >
              {impMutation.isPending ? 'Starting…' : 'Confirm — go to /dashboard'}
            </button>
            <button
              onClick={() => setShowImpConfirm(false)}
              className="px-3 py-2 text-sm border border-slate-300 rounded hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Audit log */}
      <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-widest">Audit log</h2>
        <p className="text-sm text-slate-500">
          Every action against this org — staff logins, suspensions, subscription changes, impersonations.
        </p>
        {id && <AuditLogList orgId={id} limit={25} />}
      </div>

      {org.lastActivityAt && (
        <div className="text-xs text-slate-400">
          Last logged activity: {new Date(org.lastActivityAt).toLocaleString()}
        </div>
      )}

      <div>
        <button onClick={() => navigate(-1)} className="text-sm text-slate-500 hover:underline">
          ← Back
        </button>
      </div>
    </div>
  )
}
