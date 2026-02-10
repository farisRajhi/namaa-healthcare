import { cn } from '../../lib/utils'

type BadgeVariant = 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'info'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  dot?: boolean
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  primary: 'badge-primary',
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
  neutral: 'badge-neutral',
  info: 'badge-info',
}

const dotClasses: Record<BadgeVariant, string> = {
  primary: 'bg-primary-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  neutral: 'bg-gray-500',
  info: 'bg-primary-400',
}

export default function Badge({ children, variant = 'neutral', dot = false, className }: BadgeProps) {
  return (
    <span className={cn(variantClasses[variant], className)}>
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dotClasses[variant])} />}
      {children}
    </span>
  )
}

// Status mapper for common healthcare statuses
export function getStatusBadgeVariant(status: string): BadgeVariant {
  const statusMap: Record<string, BadgeVariant> = {
    active: 'success',
    confirmed: 'success',
    completed: 'success',
    approved: 'success',
    booked: 'primary',
    scheduled: 'primary',
    checked_in: 'info',
    in_progress: 'warning',
    pending: 'warning',
    pending_refill: 'warning',
    on_hold: 'warning',
    cancelled: 'danger',
    no_show: 'danger',
    denied: 'danger',
    expired: 'neutral',
    inactive: 'neutral',
    held: 'neutral',
    wrapping_up: 'neutral',
    transferring: 'info',
  }
  return statusMap[status] || 'neutral'
}
