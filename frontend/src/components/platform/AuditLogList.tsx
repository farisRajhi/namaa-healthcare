import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { platformApi } from '../../lib/platformApi'

interface AuditEntry {
  auditId: string
  orgId: string | null
  orgName?: string | null
  userId: string | null
  platformAdminId: string | null
  action: string
  resource: string
  resourceId: string | null
  details: any
  ipAddress: string | null
  createdAt: string
}

interface FetchResponse {
  items: AuditEntry[]
  nextCursor: string | null
}

interface AuditLogListProps {
  /** Org-scoped feed if provided, otherwise the global cross-org feed. */
  orgId?: string
  /** Initial page size */
  limit?: number
  showOrgColumn?: boolean
}

const ACTION_TONE: Record<string, string> = {
  'platform.org.suspend': 'text-warning-700',
  'platform.org.reactivate': 'text-success-700',
  'platform.subscription.override': 'text-secondary-700',
  'platform.subscription.cancel': 'text-danger-700',
  'platform.subscription.retry_renewal': 'text-primary-700',
  'platform.impersonate.start': 'text-danger-700',
  'subscription.cancel': 'text-danger-700',
  'subscription.resume': 'text-success-700',
}

export default function AuditLogList({
  orgId,
  limit = 25,
  showOrgColumn = false,
}: AuditLogListProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const url = orgId ? `/api/platform/orgs/${orgId}/audit-log` : '/api/platform/audit-log'

  const load = async (afterCursor: string | null) => {
    if (afterCursor) setLoadingMore(true)
    else setLoading(true)
    setError(null)
    try {
      const res = await platformApi.get<FetchResponse>(url, {
        params: { limit, ...(afterCursor ? { cursor: afterCursor } : {}) },
      })
      const next = res.data
      setEntries((prev) => (afterCursor ? [...prev, ...next.items] : next.items))
      setCursor(next.nextCursor)
      setHasMore(!!next.nextCursor)
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load audit log')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    setEntries([])
    setCursor(null)
    load(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  if (loading) return <div className="text-sm text-healthcare-muted">Loading audit log…</div>
  if (error) return <div className="text-sm text-danger-600">{error}</div>
  if (entries.length === 0)
    return <div className="text-sm text-healthcare-muted italic">No audit entries yet.</div>

  return (
    <div className="space-y-3">
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-healthcare-bg text-healthcare-muted text-[11px] uppercase tracking-widest font-semibold">
            <tr>
              <th className="text-start px-4 py-2.5">When</th>
              <th className="text-start px-4 py-2.5">Action</th>
              {showOrgColumn && <th className="text-start px-4 py-2.5">Org</th>}
              <th className="text-start px-4 py-2.5">Actor</th>
              <th className="text-start px-4 py-2.5">Details</th>
              <th className="text-start px-4 py-2.5">IP</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr
                key={e.auditId}
                className="border-t border-healthcare-border/40 hover:bg-healthcare-bg/60 align-top transition-colors"
              >
                <td className="px-4 py-2.5 text-healthcare-muted whitespace-nowrap tabular-nums">
                  {new Date(e.createdAt).toLocaleString()}
                </td>
                <td
                  className={`px-4 py-2.5 font-mono text-xs font-semibold ${ACTION_TONE[e.action] ?? 'text-healthcare-text'}`}
                >
                  {e.action}
                </td>
                {showOrgColumn && (
                  <td className="px-4 py-2.5">
                    {e.orgId ? (
                      <Link
                        to={`/platform/orgs/${e.orgId}`}
                        className="text-healthcare-text hover:text-primary-600 font-medium transition-colors"
                      >
                        {e.orgName ?? e.orgId.slice(0, 8)}
                      </Link>
                    ) : (
                      <span className="text-healthcare-muted">—</span>
                    )}
                  </td>
                )}
                <td className="px-4 py-2.5 text-healthcare-muted text-xs">
                  {e.platformAdminId ? (
                    <span title={e.platformAdminId} className="text-primary-700 font-medium">
                      platform admin
                    </span>
                  ) : e.userId ? (
                    <span title={e.userId}>org user</span>
                  ) : (
                    <span>system</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-healthcare-muted text-xs max-w-md">
                  {renderDetails(e.details)}
                </td>
                <td className="px-4 py-2.5 text-healthcare-muted text-xs whitespace-nowrap tabular-nums">
                  {e.ipAddress ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <button
            onClick={() => load(cursor)}
            disabled={loadingMore}
            className="btn-outline btn-sm"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}

function renderDetails(details: any): string {
  if (!details) return ''
  if (typeof details === 'string') return details
  try {
    const reason = details.reason
    const summary: string[] = []
    if (reason) summary.push(`reason: ${reason}`)
    if (details.plan) summary.push(`plan: ${details.plan}`)
    if (details.previousStatus) summary.push(`prev: ${details.previousStatus}`)
    if (
      details.next?.plan &&
      details.previous?.plan &&
      details.next.plan !== details.previous.plan
    ) {
      summary.push(`${details.previous.plan} → ${details.next.plan}`)
    }
    if (details.orgName) summary.push(details.orgName)
    if (summary.length === 0) return JSON.stringify(details).slice(0, 120)
    return summary.join(' · ')
  } catch {
    return ''
  }
}
