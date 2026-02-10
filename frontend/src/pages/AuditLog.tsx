import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import {
  Shield,
  Download,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { cn, formatDateTime } from '../lib/utils'

interface AuditEntry {
  auditId: string
  timestamp: string
  userId: string
  userName?: string
  action: string
  resource: string
  resourceId?: string
  details: Record<string, any>
  ipAddress?: string
}

const actionTypes = [
  'all',
  'login',
  'logout',
  'create',
  'update',
  'delete',
  'export',
  'access',
  'config_change',
  'api_call',
]

const actionLabels: Record<string, { ar: string; en: string; color: string }> = {
  login: { ar: 'تسجيل دخول', en: 'Login', color: 'bg-green-100 text-green-800' },
  logout: { ar: 'تسجيل خروج', en: 'Logout', color: 'bg-primary-50/50 text-gray-800' },
  create: { ar: 'إنشاء', en: 'Create', color: 'bg-blue-100 text-blue-800' },
  update: { ar: 'تحديث', en: 'Update', color: 'bg-yellow-100 text-yellow-800' },
  delete: { ar: 'حذف', en: 'Delete', color: 'bg-red-100 text-red-800' },
  export: { ar: 'تصدير', en: 'Export', color: 'bg-purple-100 text-purple-800' },
  access: { ar: 'وصول', en: 'Access', color: 'bg-indigo-100 text-indigo-800' },
  config_change: { ar: 'تغيير إعدادات', en: 'Config Change', color: 'bg-orange-100 text-orange-800' },
  'config.bulk_changed': { ar: 'تغيير إعدادات', en: 'Config Change', color: 'bg-orange-100 text-orange-800' },
  'config.created': { ar: 'إنشاء إعدادات', en: 'Config Created', color: 'bg-blue-100 text-blue-800' },
  api_call: { ar: 'استدعاء API', en: 'API Call', color: 'bg-teal-100 text-teal-800' },
}

export default function AuditLog() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { user } = useAuth()
  const orgId = user?.org?.id || ''

  const [page, setPage] = useState(1)
  const [actionFilter, setActionFilter] = useState('all')
  const [userFilter, setUserFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  // Backend: GET /api/audit/:orgId?page=...&action=...&userId=...&from=...&to=...
  const { data, isLoading } = useQuery({
    queryKey: ['audit-log', { page, action: actionFilter, user: userFilter, dateFrom, dateTo, orgId }],
    queryFn: async () => {
      try {
        if (!orgId) return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }
        const params = new URLSearchParams({ page: String(page), limit: '20' })
        if (actionFilter !== 'all') params.set('action', actionFilter)
        if (userFilter) params.set('userId', userFilter)
        if (dateFrom) params.set('from', dateFrom)
        if (dateTo) params.set('to', dateTo)
        const res = await api.get(`/api/audit/${orgId}?${params}`)
        return res.data
      } catch {
        return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }
      }
    },
    enabled: !!orgId,
  })

  const entries: AuditEntry[] = (data?.data || []).map((entry: any) => ({
    auditId: entry.auditId || entry.id || `audit-${Math.random().toString(36).slice(2)}`,
    timestamp: entry.timestamp || entry.createdAt || new Date().toISOString(),
    userId: entry.userId || '',
    userName: entry.userName || entry.userId?.substring(0, 8) || 'System',
    action: entry.action || 'access',
    resource: entry.resource || '',
    resourceId: entry.resourceId,
    details: entry.details || {},
    ipAddress: entry.ipAddress,
  }))
  const pagination = data?.pagination

  // Backend: GET /api/audit/:orgId/export
  const handleExport = async () => {
    try {
      if (!orgId) return
      const params = new URLSearchParams()
      if (actionFilter !== 'all') params.set('action', actionFilter)
      if (userFilter) params.set('userId', userFilter)
      if (dateFrom) params.set('from', dateFrom)
      if (dateTo) params.set('to', dateTo)

      const res = await api.get(`/api/audit/${orgId}/export?${params}`, {
        responseType: 'blob',
      })

      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `audit-log-${new Date().toISOString().split('T')[0]}.json`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed', err)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">
            {isAr ? 'سجل التدقيق الأمني' : 'Security Audit Log'}
          </h1>
          <p className="text-healthcare-muted">
            {isAr ? 'تتبع جميع الإجراءات والأنشطة في النظام' : 'Track all system actions and activities'}
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={!orgId}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
        >
          <Download className="h-5 w-5" />
          {isAr ? 'تصدير JSON' : 'Export JSON'}
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">{isAr ? 'نوع الإجراء' : 'Action Type'}</label>
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-primary-400/20 focus:border-primary-500"
            >
              <option value="all">{isAr ? 'الكل' : 'All'}</option>
              {actionTypes.filter(a => a !== 'all').map((action) => {
                const label = actionLabels[action]
                return (
                  <option key={action} value={action}>
                    {label ? (isAr ? label.ar : label.en) : action}
                  </option>
                )
              })}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{isAr ? 'المستخدم' : 'User'}</label>
            <input
              type="text"
              value={userFilter}
              onChange={(e) => { setUserFilter(e.target.value); setPage(1) }}
              placeholder={isAr ? 'بحث بالمستخدم...' : 'Search user...'}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-primary-400/20 focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{isAr ? 'من' : 'From'}</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{isAr ? 'إلى' : 'To'}</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>
      </div>

      {/* Audit Table */}
      <div className="table-container overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="loading-spinner"></div>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Shield className="h-12 w-12 mb-3 text-gray-300" />
            <p>{isAr ? 'لا توجد سجلات تدقيق' : 'No audit logs found'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-healthcare-bg">
                <tr>
                  <th className="w-8 px-4 py-3"></th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">
                    {isAr ? 'الوقت' : 'Timestamp'}
                  </th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">
                    {isAr ? 'المستخدم' : 'User'}
                  </th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">
                    {isAr ? 'الإجراء' : 'Action'}
                  </th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">
                    {isAr ? 'المورد' : 'Resource'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {entries.map((entry) => {
                  const actionLabel = actionLabels[entry.action]
                  const isExpanded = expandedRow === entry.auditId
                  return (
                    <tr
                      key={entry.auditId}
                      className="hover:bg-primary-50/30 cursor-pointer"
                      onClick={() => setExpandedRow(isExpanded ? null : entry.auditId)}
                    >
                      <td className="px-4 py-4">
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                        {formatDateTime(entry.timestamp)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center">
                            <span className="text-primary-700 text-xs font-medium">
                              {entry.userName?.charAt(0)?.toUpperCase() || '?'}
                            </span>
                          </div>
                          <span className="text-sm font-medium text-healthcare-text">{entry.userName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          'px-2 py-1 rounded text-xs font-medium',
                          actionLabel?.color || 'bg-primary-50/50 text-gray-800'
                        )}>
                          {actionLabel ? (isAr ? actionLabel.ar : actionLabel.en) : entry.action}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {entry.resource}
                      </td>
                    </tr>
                  )
                })}
                {/* Expanded detail rows rendered separately to avoid React key/fragment issues */}
              </tbody>
            </table>
            {/* Detail panels rendered outside the table to avoid nested-table issues */}
            {entries.map((entry) => {
              if (expandedRow !== entry.auditId) return null
              return (
                <div key={`${entry.auditId}-detail`} className="px-6 py-4 bg-healthcare-bg border-t">
                  <div className="rounded-lg bg-gray-900 text-green-400 p-4 font-mono text-sm overflow-x-auto">
                    <pre className="whitespace-pre-wrap" dir="ltr">
                      {JSON.stringify(entry.details, null, 2)}
                    </pre>
                  </div>
                  {entry.ipAddress && (
                    <p className="mt-2 text-xs text-gray-500">
                      IP: <span className="font-mono">{entry.ipAddress}</span>
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="px-6 py-4 border-t flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {isAr
                ? `عرض ${(pagination.page - 1) * pagination.limit + 1} إلى ${Math.min(pagination.page * pagination.limit, pagination.total)} من ${pagination.total}`
                : `Showing ${(pagination.page - 1) * pagination.limit + 1} to ${Math.min(pagination.page * pagination.limit, pagination.total)} of ${pagination.total}`}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50"
              >
                {isAr ? 'السابق' : 'Previous'}
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= pagination.totalPages}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50"
              >
                {isAr ? 'التالي' : 'Next'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
