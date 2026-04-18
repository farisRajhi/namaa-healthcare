import { useState } from 'react'
import AuditLogList from '../../components/platform/AuditLogList'

export default function PlatformAudit() {
  const [actionFilter, setActionFilter] = useState('')
  const [appliedAction, setAppliedAction] = useState('')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Audit Log</h1>
        <p className="text-sm text-slate-500 mt-1">
          Every privileged action across orgs — suspensions, subscription overrides, impersonations, cancellations.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          setAppliedAction(actionFilter.trim())
        }}
        className="flex items-center gap-2 max-w-md"
      >
        <input
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          placeholder="Filter by action (e.g. impersonate)…"
          className="flex-1 border border-slate-300 rounded px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="px-3 py-2 bg-slate-900 text-white text-sm rounded hover:bg-slate-800"
        >
          Apply
        </button>
        {appliedAction && (
          <button
            type="button"
            onClick={() => {
              setActionFilter('')
              setAppliedAction('')
            }}
            className="px-3 py-2 text-sm border border-slate-300 rounded hover:bg-slate-50"
          >
            Clear
          </button>
        )}
      </form>

      <AuditLogList key={appliedAction} showOrgColumn />
    </div>
  )
}
