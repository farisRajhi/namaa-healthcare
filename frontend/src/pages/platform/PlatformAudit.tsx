import { useState } from 'react'
import { Search, X } from 'lucide-react'
import AuditLogList from '../../components/platform/AuditLogList'

export default function PlatformAudit() {
  const [actionFilter, setActionFilter] = useState('')
  const [appliedAction, setAppliedAction] = useState('')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-healthcare-text">Audit Log</h1>
        <p className="text-sm text-healthcare-muted mt-1">
          Every privileged action across orgs — suspensions, subscription overrides, impersonations,
          cancellations.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          setAppliedAction(actionFilter.trim())
        }}
        className="flex items-center gap-2 max-w-lg flex-wrap"
      >
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-healthcare-muted absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
          <input
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            placeholder="Filter by action (e.g. impersonate)…"
            className="w-full bg-white border border-healthcare-border rounded-lg ps-9 pe-3 py-2 text-sm text-healthcare-text focus:outline-none focus:ring-[3px] focus:ring-primary-400 focus:border-primary-500 transition-colors"
          />
        </div>
        <button type="submit" className="btn-primary btn-sm">
          Apply
        </button>
        {appliedAction && (
          <button
            type="button"
            onClick={() => {
              setActionFilter('')
              setAppliedAction('')
            }}
            className="btn-outline btn-sm"
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </form>

      <AuditLogList key={appliedAction} showOrgColumn />
    </div>
  )
}
