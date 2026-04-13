import { cn } from '../../lib/utils'
import {
  Crown,
  AlertTriangle,
  Clock,
  CalendarX,
  UserPlus,
  TrendingUp,
  Sparkles,
  ShieldAlert,
  Megaphone,
  Tag,
} from 'lucide-react'

const iconMap: Record<string, React.ElementType> = {
  Crown,
  AlertTriangle,
  Clock,
  CalendarX,
  UserPlus,
  TrendingUp,
  Sparkles,
  ShieldAlert,
}

const colorMap: Record<string, { bg: string; border: string; text: string; badge: string; scoreBg: string }> = {
  amber: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    badge: 'bg-amber-100 text-amber-800',
    scoreBg: 'from-amber-500 to-amber-600',
  },
  orange: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-700',
    badge: 'bg-orange-100 text-orange-800',
    scoreBg: 'from-orange-500 to-orange-600',
  },
  red: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    badge: 'bg-red-100 text-red-800',
    scoreBg: 'from-red-500 to-red-600',
  },
  blue: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    badge: 'bg-blue-100 text-blue-800',
    scoreBg: 'from-blue-500 to-blue-600',
  },
  green: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-700',
    badge: 'bg-green-100 text-green-800',
    scoreBg: 'from-green-500 to-green-600',
  },
  cyan: {
    bg: 'bg-primary-50',
    border: 'border-primary-200',
    text: 'text-primary-700',
    badge: 'bg-primary-100 text-primary-800',
    scoreBg: 'from-primary-500 to-primary-600',
  },
  rose: {
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    text: 'text-rose-700',
    badge: 'bg-rose-100 text-rose-800',
    scoreBg: 'from-rose-500 to-rose-600',
  },
}

interface TopService {
  serviceId: string
  name: string
  patientCount: number
}

interface TopPatient {
  patientId: string
  firstName: string
  lastName: string
  score: number
  engagementScore: number
  returnLikelihood: number
}

interface SegmentCardProps {
  label: string
  labelAr: string
  description: string
  descriptionAr: string
  icon: string
  color: string
  count: number
  rank?: number
  avgScore?: number
  topServices?: TopService[]
  topPatients?: TopPatient[]
  isSelected?: boolean
  isAr?: boolean
  onClick?: () => void
  onSendOffer?: () => void
  onCreateCampaign?: () => void
  isLoading?: boolean
  expanded?: boolean
}

export default function SegmentCard({
  label,
  labelAr,
  description,
  descriptionAr,
  icon,
  color,
  count,
  rank,
  avgScore,
  topServices,
  topPatients,
  isSelected,
  isAr,
  onClick,
  onSendOffer,
  onCreateCampaign,
  isLoading,
  expanded,
}: SegmentCardProps) {
  const Icon = iconMap[icon] || Crown
  const colors = colorMap[color] || colorMap.blue

  const fmt = (n: number) => n.toLocaleString(isAr ? 'ar-SA' : 'en-US')

  return (
    <div
      className={cn(
        'relative w-full text-start rounded-xl border-2 transition-all duration-200 overflow-hidden',
        isSelected
          ? 'border-primary-500 bg-primary-50/50 shadow-md ring-2 ring-primary-200'
          : `${colors.border} bg-white hover:shadow-md`,
      )}
    >
      {/* Rank badge */}
      {rank && rank > 0 && (
        <div className={cn(
          'absolute top-0 end-0 w-9 h-9 flex items-center justify-center',
          'bg-gradient-to-br text-white text-sm font-black rounded-es-xl rounded-se-lg',
          colors.scoreBg,
        )}>
          #{rank}
        </div>
      )}

      {/* Clickable header area */}
      <button type="button" onClick={onClick} className="w-full text-start p-4 pb-3">
        <div className="flex items-start gap-3">
          <div className={cn('rounded-lg p-2 shrink-0', colors.bg)}>
            <Icon className={cn('w-5 h-5', colors.text)} />
          </div>
          <div className="flex-1 min-w-0 pe-6">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-sm text-gray-900 truncate">
                {isAr ? labelAr : label}
              </h4>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold shrink-0',
                  isLoading ? 'bg-gray-100 text-gray-400' : colors.badge,
                )}
              >
                {isLoading ? '...' : fmt(count)}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">
              {isAr ? descriptionAr : description}
            </p>
          </div>
        </div>

        {/* Score bar */}
        {avgScore !== undefined && avgScore > 0 && count > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[10px] text-gray-400 shrink-0 w-16">
              {isAr ? 'معدل النقاط' : 'Avg Score'}
            </span>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full bg-gradient-to-r', colors.scoreBg)}
                style={{ width: `${avgScore}%` }}
              />
            </div>
            <span className="text-xs font-bold text-gray-700 w-8 text-end">{avgScore}</span>
          </div>
        )}
      </button>

      {/* Expanded content: services + top patients + CTA */}
      {expanded && count > 0 && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
          {/* Suggested services for offers */}
          {topServices && topServices.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                {isAr ? 'خدمات مقترحة للعرض' : 'Suggested services for offers'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {topServices.map((svc) => (
                  <span
                    key={svc.serviceId}
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium',
                      colors.bg, colors.text,
                    )}
                  >
                    {svc.name}
                    <span className="opacity-60">({svc.patientCount})</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Top ranked patients */}
          {topPatients && topPatients.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                {isAr ? 'أعلى المرضى تصنيفاً' : 'Top ranked patients'}
              </p>
              <div className="space-y-1">
                {topPatients.map((p, idx) => (
                  <div
                    key={p.patientId}
                    className="flex items-center justify-between py-1 px-2 rounded-md hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cn(
                        'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white bg-gradient-to-br shrink-0',
                        idx === 0 ? 'from-amber-400 to-amber-600' :
                        idx === 1 ? 'from-gray-300 to-gray-500' :
                        idx === 2 ? 'from-orange-400 to-orange-600' :
                        'from-gray-200 to-gray-400',
                      )}>
                        {idx + 1}
                      </span>
                      <span className="text-xs text-gray-700 truncate">
                        {p.firstName} {p.lastName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="text-end">
                        <span className="text-xs font-bold text-gray-900">{p.score}</span>
                        <span className="text-[9px] text-gray-400">/100</span>
                      </div>
                      {/* Mini score bar */}
                      <div className="w-10 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full bg-gradient-to-r', colors.scoreBg)}
                          style={{ width: `${p.score}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Row */}
          {(onSendOffer || onCreateCampaign) && (
            <div className="flex items-center gap-2">
              {onCreateCampaign && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onCreateCampaign() }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
                >
                  <Megaphone className="w-3.5 h-3.5" />
                  {isAr ? 'حملة' : 'Campaign'}
                </button>
              )}
              {onSendOffer && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSendOffer() }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors"
                >
                  <Tag className="w-3.5 h-3.5" />
                  {isAr ? 'عرض' : 'Offer'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export type { TopService, TopPatient }
