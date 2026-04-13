import {
  Crown, AlertTriangle, Clock, CalendarX2, UserPlus,
  TrendingUp, Sparkles, ShieldAlert,
} from 'lucide-react'
import { cn } from '../../lib/utils'

interface Props {
  presetKey: string
  label: string
  labelAr: string
  description: string
  descriptionAr: string
  icon: string
  color: string
  count: number | null
  isSelected: boolean
  isAr: boolean
  onClick: () => void
}

const iconMap: Record<string, React.ElementType> = {
  Crown, AlertTriangle, Clock, CalendarX: CalendarX2, CalendarX2,
  UserPlus, TrendingUp, Sparkles, ShieldAlert,
}

const colorMap: Record<string, { bg: string; border: string; text: string }> = {
  amber:  { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-600' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-600' },
  red:    { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-600' },
  blue:   { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-600' },
  green:  { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-600' },
  cyan:   { bg: 'bg-primary-50', border: 'border-primary-200', text: 'text-primary-600' },
  rose:   { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-600' },
}

export default function AudiencePresetCard({
  label, labelAr, description, descriptionAr,
  icon, color, count, isSelected, isAr, onClick,
}: Props) {
  const Icon = iconMap[icon] || Crown
  const colors = colorMap[color] || colorMap.blue

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 p-4 rounded-xl border-2 text-start transition-all w-full',
        isSelected
          ? 'border-healthcare-primary bg-healthcare-primary/5 shadow-sm'
          : 'border-gray-200 hover:border-gray-300 bg-white',
      )}
    >
      <div className={cn('p-2 rounded-lg shrink-0', colors.bg)}>
        <Icon className={cn('h-5 w-5', colors.text)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className={cn('text-sm font-medium', isSelected ? 'text-healthcare-primary' : 'text-gray-800')}>
            {isAr ? labelAr : label}
          </p>
          {count !== null && (
            <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full tabular-nums shrink-0">
              {count.toLocaleString(isAr ? 'ar-SA' : 'en-US')}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          {isAr ? descriptionAr : description}
        </p>
      </div>
    </button>
  )
}
