import { Users, ShieldCheck } from 'lucide-react'
import { cn } from '../../lib/utils'

interface AudiencePreviewBadgeProps {
  totalMatching: number
  withConsent: number
  isLoading: boolean
  isAr?: boolean
  compact?: boolean
}

export default function AudiencePreviewBadge({
  totalMatching,
  withConsent,
  isLoading,
  isAr,
  compact,
}: AudiencePreviewBadgeProps) {
  const fmt = (n: number) => n.toLocaleString(isAr ? 'ar-SA' : 'en-US')

  if (compact) {
    return (
      <div className="inline-flex items-center gap-2 bg-primary-50 border border-primary-200 rounded-full px-4 py-1.5">
        <Users className="w-4 h-4 text-primary-600" />
        <span className="text-sm font-bold text-primary-700">
          {isLoading ? '...' : fmt(withConsent)}
        </span>
        <span className="text-xs text-primary-500">
          {isAr ? 'مريض مستهدف' : 'targetable'}
        </span>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-primary-50 to-secondary-50 border border-primary-200 rounded-xl p-5">
      <h4 className="text-sm font-semibold text-gray-700 mb-4">
        {isAr ? 'معاينة الجمهور' : 'Audience Preview'}
      </h4>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-600">
              {isAr ? 'مطابق' : 'Matching'}
            </span>
          </div>
          <span className={cn(
            'text-lg font-bold',
            isLoading ? 'text-gray-400' : 'text-gray-900',
          )}>
            {isLoading ? '...' : fmt(totalMatching)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-green-500" />
            <span className="text-sm text-gray-600">
              {isAr ? 'بموافقة تسويقية' : 'With consent'}
            </span>
          </div>
          <span className={cn(
            'text-lg font-bold',
            isLoading ? 'text-gray-400' : 'text-green-700',
          )}>
            {isLoading ? '...' : fmt(withConsent)}
          </span>
        </div>

        {!isLoading && totalMatching > 0 && withConsent < totalMatching && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mt-2">
            {isAr
              ? `${fmt(totalMatching - withConsent)} مريض بدون موافقة تسويقية — لن يتم إرسال الحملة لهم`
              : `${fmt(totalMatching - withConsent)} patients without marketing consent will be excluded`}
          </p>
        )}
      </div>
    </div>
  )
}
