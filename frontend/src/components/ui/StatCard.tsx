import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '../../lib/utils'

interface StatCardProps {
  icon: LucideIcon
  value: string | number
  label: string
  trend?: {
    value: number
    isPositive: boolean
  }
  iconBg?: string
  iconColor?: string
  className?: string
  live?: boolean
}

export default function StatCard({
  icon: Icon,
  value,
  label,
  trend,
  iconBg = 'bg-primary-100',
  iconColor = 'text-primary-600',
  className,
  live,
}: StatCardProps) {
  return (
    <div className={cn('stat-card group', className)}>
      <div className={cn('stat-icon', iconBg)}>
        <Icon className={cn('h-6 w-6', iconColor)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="stat-value">{value}</span>
          {live && (
            <span className="status-dot-live" title="Live" />
          )}
        </div>
        <p className="stat-label">{label}</p>
        {trend && (
          <div className={cn('stat-trend', trend.isPositive ? 'stat-trend-up' : 'stat-trend-down')}>
            {trend.isPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            <span>{trend.isPositive ? '+' : ''}{trend.value}%</span>
          </div>
        )}
      </div>
    </div>
  )
}
