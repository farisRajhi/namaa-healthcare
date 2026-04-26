import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import LoadingSpinner from './LoadingSpinner'
import EmptyState from './EmptyState'
import { LucideIcon, ChevronRight, ChevronLeft } from 'lucide-react'

interface Column<T> {
  key: string
  header: string
  render: (item: T) => React.ReactNode
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  isLoading?: boolean
  emptyIcon?: LucideIcon
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: { label: string; onClick: () => void }
  onRowClick?: (item: T) => void
  keyExtractor: (item: T) => string
  pagination?: {
    page: number
    totalPages: number
    total: number
    limit: number
    onPageChange: (page: number) => void
  }
  className?: string
}

export default function DataTable<T>({
  columns,
  data,
  isLoading,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyAction,
  onRowClick,
  keyExtractor,
  pagination,
  className,
}: DataTableProps<T>) {
  const { t } = useTranslation()
  const resolvedEmptyTitle = emptyTitle ?? t('common.noData', { defaultValue: 'No data found' })
  if (isLoading) {
    return (
      <div className={cn('table-container', className)}>
        <div className="flex items-center justify-center h-64">
          <LoadingSpinner />
        </div>
      </div>
    )
  }

  if (data.length === 0 && emptyIcon) {
    return (
      <div className={cn('table-container', className)}>
        <EmptyState
          icon={emptyIcon}
          title={resolvedEmptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      </div>
    )
  }

  return (
    <div className={cn('table-container', className)}>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="table-header">
            <tr>
              {columns.map((col) => (
                <th key={col.key} className={col.className}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <tr
                key={keyExtractor(item)}
                className={cn('table-row', onRowClick && 'cursor-pointer')}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((col) => (
                  <td key={col.key} className={col.className}>
                    {col.render(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="px-5 py-4 border-t border-healthcare-border/20 flex items-center justify-between">
          <p className="text-sm text-healthcare-muted">
            {t('common.showing', {
              from: (pagination.page - 1) * pagination.limit + 1,
              to: Math.min(pagination.page * pagination.limit, pagination.total),
              total: pagination.total,
              defaultValue: 'Showing {{from}} to {{to}} of {{total}}',
            })}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="pagination-btn"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="pagination-btn"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
