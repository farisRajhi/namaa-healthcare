import { cn } from '../../lib/utils'

interface PriorityScoreBadgeProps {
  score: number
  size?: 'sm' | 'md'
}

const colorMap = {
  critical: { bg: 'bg-red-100', text: 'text-red-700', bar: 'bg-red-500' },
  high:     { bg: 'bg-orange-100', text: 'text-orange-700', bar: 'bg-orange-500' },
  medium:   { bg: 'bg-amber-100', text: 'text-amber-700', bar: 'bg-amber-500' },
  low:      { bg: 'bg-gray-100', text: 'text-gray-600', bar: 'bg-gray-400' },
}

function getLevel(score: number) {
  if (score >= 80) return 'critical'
  if (score >= 60) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}

export default function PriorityScoreBadge({ score, size = 'md' }: PriorityScoreBadgeProps) {
  const level = getLevel(score)
  const colors = colorMap[level]

  return (
    <div className={cn('inline-flex items-center gap-2', size === 'sm' ? 'text-xs' : 'text-sm')}>
      <span className={cn('font-bold tabular-nums', colors.text)}>
        {score}
      </span>
      <div className={cn('rounded-full overflow-hidden', size === 'sm' ? 'w-12 h-1.5' : 'w-16 h-2', 'bg-gray-200')}>
        <div
          className={cn('h-full rounded-full transition-all', colors.bar)}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
    </div>
  )
}

export { getLevel }
