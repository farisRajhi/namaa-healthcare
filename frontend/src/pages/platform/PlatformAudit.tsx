import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X } from 'lucide-react'
import AuditLogList from '../../components/platform/AuditLogList'

export default function PlatformAudit() {
  const { t } = useTranslation()
  const [actionFilter, setActionFilter] = useState('')
  const [appliedAction, setAppliedAction] = useState('')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-healthcare-text">
          {t('platform.audit.title')}
        </h1>
        <p className="text-sm text-healthcare-muted mt-1">{t('platform.audit.subtitle')}</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          setAppliedAction(actionFilter.trim())
        }}
        className="flex items-center gap-2 max-w-lg flex-wrap"
      >
        <div className="relative flex-1 min-w-[220px]">
          <label htmlFor="audit-filter" className="sr-only">
            {t('platform.audit.filterPlaceholder')}
          </label>
          <Search className="w-4 h-4 text-healthcare-muted absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
          <input
            id="audit-filter"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            placeholder={t('platform.audit.filterPlaceholder')}
            className="w-full bg-white border border-healthcare-border rounded-lg ps-9 pe-3 py-2 text-sm text-healthcare-text focus:outline-none focus:ring-[3px] focus:ring-primary-400 focus:border-primary-500 transition-colors"
          />
        </div>
        <button type="submit" className="btn-primary btn-sm">
          {t('platform.audit.apply')}
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
            <X className="w-3.5 h-3.5" aria-hidden="true" />
            {t('platform.audit.clear')}
          </button>
        )}
      </form>

      <AuditLogList key={appliedAction} showOrgColumn />
    </div>
  )
}
