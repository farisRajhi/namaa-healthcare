import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, RefreshCw, Settings2, UserCog, Circle, type LucideIcon } from 'lucide-react'
import { platformApi } from '../../lib/platformApi'
import i18n from '../../i18n'

interface AuditEntry {
  auditId: string
  orgId: string | null
  orgName?: string | null
  orgNameAr?: string | null
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

interface ActionMeta {
  tone: string
  icon: LucideIcon
  i18nKey: string
}

const ACTION_META: Record<string, ActionMeta> = {
  'platform.org.suspend': { tone: 'text-warning-700', icon: AlertTriangle, i18nKey: 'platform.actions.orgSuspend' },
  'platform.org.reactivate': { tone: 'text-success-700', icon: CheckCircle2, i18nKey: 'platform.actions.orgReactivate' },
  'platform.subscription.override': { tone: 'text-secondary-700', icon: Settings2, i18nKey: 'platform.actions.subOverride' },
  'platform.subscription.cancel': { tone: 'text-danger-700', icon: AlertTriangle, i18nKey: 'platform.actions.subCancel' },
  'platform.subscription.retry_renewal': { tone: 'text-primary-700', icon: RefreshCw, i18nKey: 'platform.actions.subRetry' },
  'platform.impersonate.start': { tone: 'text-danger-700', icon: UserCog, i18nKey: 'platform.actions.impersonate' },
  'subscription.cancel': { tone: 'text-danger-700', icon: AlertTriangle, i18nKey: 'platform.actions.subCancel' },
  'subscription.resume': { tone: 'text-success-700', icon: CheckCircle2, i18nKey: 'platform.actions.subResume' },
}

export default function AuditLogList({
  orgId,
  limit = 25,
  showOrgColumn = false,
}: AuditLogListProps) {
  const { t } = useTranslation()
  const lang = i18n.language
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [announce, setAnnounce] = useState('')

  const url = orgId ? `/api/platform/orgs/${orgId}/audit-log` : '/api/platform/audit-log'

  useEffect(() => {
    let cancelled = false
    const load = async (afterCursor: string | null) => {
      if (afterCursor) setLoadingMore(true)
      else setLoading(true)
      setError(null)
      try {
        const res = await platformApi.get<FetchResponse>(url, {
          params: { limit, ...(afterCursor ? { cursor: afterCursor } : {}) },
        })
        if (cancelled) return
        const next = res.data
        setEntries((prev) => {
          const merged = afterCursor ? [...prev, ...next.items] : next.items
          if (afterCursor) setAnnounce(t('platform.audit.loadedMore', { n: next.items.length, defaultValue: `Loaded ${next.items.length} more entries` }))
          return merged
        })
        setCursor(next.nextCursor)
        setHasMore(!!next.nextCursor)
      } catch (err: unknown) {
        if (cancelled) return
        const fallback = t('platform.audit.error')
        if (err && typeof err === 'object' && 'response' in err) {
          const r = (err as { response?: { data?: { message?: string; error?: string } } }).response
          setError(r?.data?.message ?? r?.data?.error ?? fallback)
        } else if (err instanceof Error) {
          setError(err.message || fallback)
        } else {
          setError(fallback)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    }
    setEntries([])
    setCursor(null)
    load(null)
    return () => {
      cancelled = true
    }
  }, [orgId, url, limit, t])

  const loadMore = () => {
    if (!cursor) return
    setLoadingMore(true)
    setError(null)
    platformApi
      .get<FetchResponse>(url, { params: { limit, cursor } })
      .then((res) => {
        const next = res.data
        setEntries((prev) => [...prev, ...next.items])
        setCursor(next.nextCursor)
        setHasMore(!!next.nextCursor)
        setAnnounce(t('platform.audit.loadedMore', { n: next.items.length, defaultValue: `Loaded ${next.items.length} more entries` }))
      })
      .catch(() => setError(t('platform.audit.error')))
      .finally(() => setLoadingMore(false))
  }

  if (loading) {
    return (
      <div role="status" aria-live="polite" className="text-sm text-healthcare-muted">
        {t('platform.audit.loading')}
      </div>
    )
  }
  if (error) {
    return (
      <div role="alert" className="text-sm text-danger-600">
        {error}
      </div>
    )
  }
  if (entries.length === 0) {
    return (
      <div className="text-sm text-healthcare-muted italic">
        {t('platform.audit.empty')}
      </div>
    )
  }

  const renderAction = (action: string) => {
    const meta = ACTION_META[action]
    if (!meta) {
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-healthcare-text">
          <Circle className="w-3 h-3" aria-hidden="true" />
          {action}
        </span>
      )
    }
    const Icon = meta.icon
    const label = t(meta.i18nKey, { defaultValue: action })
    return (
      <span className={`inline-flex items-center gap-1.5 font-medium text-xs ${meta.tone}`} title={action}>
        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
        {label}
      </span>
    )
  }

  return (
    <div className="space-y-3">
      <div role="status" aria-live="polite" className="sr-only">
        {announce}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm" aria-label={t('platform.audit.title')}>
          <caption className="sr-only">{t('platform.audit.title')}</caption>
          <thead className="bg-healthcare-bg text-healthcare-muted text-[11px] uppercase tracking-widest font-semibold">
            <tr>
              <th scope="col" className="text-start px-4 py-2.5">{t('platform.audit.headers.when')}</th>
              <th scope="col" className="text-start px-4 py-2.5">{t('platform.audit.headers.action')}</th>
              {showOrgColumn && <th scope="col" className="text-start px-4 py-2.5">{t('platform.audit.headers.org')}</th>}
              <th scope="col" className="text-start px-4 py-2.5">{t('platform.audit.headers.actor')}</th>
              <th scope="col" className="text-start px-4 py-2.5">{t('platform.audit.headers.details')}</th>
              <th scope="col" className="text-start px-4 py-2.5">{t('platform.audit.headers.ip')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const orgDisplay = lang === 'ar' ? (e.orgNameAr ?? e.orgName) : e.orgName
              return (
                <tr
                  key={e.auditId}
                  className="border-t border-healthcare-border/40 hover:bg-healthcare-bg/60 align-top transition-colors"
                >
                  <td className="px-4 py-2.5 text-healthcare-muted whitespace-nowrap tabular-nums">
                    {new Date(e.createdAt).toLocaleString(lang)}
                  </td>
                  <td className="px-4 py-2.5">{renderAction(e.action)}</td>
                  {showOrgColumn && (
                    <td className="px-4 py-2.5">
                      {e.orgId ? (
                        <Link
                          to={`/platform/orgs/${e.orgId}`}
                          className="text-healthcare-text hover:text-primary-600 font-medium transition-colors"
                        >
                          {orgDisplay ?? e.orgId.slice(0, 8)}
                        </Link>
                      ) : (
                        <span className="text-healthcare-muted">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-healthcare-muted text-xs">
                    {e.platformAdminId ? (
                      <span className="text-primary-700 font-medium">
                        {t('platform.audit.actor.platformAdmin')}
                      </span>
                    ) : e.userId ? (
                      <span>{t('platform.audit.actor.orgUser')}</span>
                    ) : (
                      <span>{t('platform.audit.actor.system')}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-healthcare-muted text-xs max-w-md">
                    {renderDetails(e.details, t)}
                  </td>
                  <td className="px-4 py-2.5 text-healthcare-muted text-xs whitespace-nowrap tabular-nums">
                    {e.ipAddress ?? '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="btn-outline btn-sm focus-visible:ring-2 focus-visible:ring-primary-400"
            aria-busy={loadingMore}
          >
            {loadingMore ? t('platform.audit.loading') : t('platform.audit.loadMore')}
          </button>
        </div>
      )}
    </div>
  )
}

function renderDetails(details: any, t: (key: string, opts?: any) => string): string {
  if (!details) return ''
  if (typeof details === 'string') return details
  try {
    const summary: string[] = []
    if (details.reason) summary.push(`${t('platform.audit.details.reason', { defaultValue: 'reason' })}: ${details.reason}`)
    if (details.plan) summary.push(`${t('platform.audit.details.plan', { defaultValue: 'plan' })}: ${details.plan}`)
    if (details.previousStatus) summary.push(`${t('platform.audit.details.prev', { defaultValue: 'prev' })}: ${details.previousStatus}`)
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
