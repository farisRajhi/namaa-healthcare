import { cn } from '../../lib/utils'

type StatusDotType = 'live' | 'warning' | 'danger' | 'neutral'

interface StatusDotProps {
  type?: StatusDotType
  label?: string
  className?: string
}

const typeClasses: Record<StatusDotType, string> = {
  live: 'status-dot-live',
  warning: 'status-dot-warning',
  danger: 'status-dot-danger',
  neutral: 'status-dot-neutral',
}

export default function StatusDot({ type = 'live', label, className }: StatusDotProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className={typeClasses[type]} />
      {label && <span className="text-xs font-medium text-healthcare-muted">{label}</span>}
    </span>
  )
}
