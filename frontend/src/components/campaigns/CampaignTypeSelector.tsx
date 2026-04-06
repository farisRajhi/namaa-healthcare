import { RotateCcw, UserCheck, Bell, Megaphone, Tag } from 'lucide-react'
import { cn } from '../../lib/utils'

interface Props {
  value: string
  onChange: (type: string) => void
  isAr: boolean
}

const types = [
  { key: 'recall', icon: RotateCcw, en: 'Recall', ar: 'استدعاء', descEn: 'Bring back lapsed patients', descAr: 'إعادة المرضى المنقطعين' },
  { key: 'follow_up', icon: UserCheck, en: 'Follow-up', ar: 'متابعة', descEn: 'Post-visit check-in', descAr: 'متابعة بعد الزيارة' },
  { key: 'reminder', icon: Bell, en: 'Reminder', ar: 'تذكير', descEn: 'Appointment reminders', descAr: 'تذكير بالمواعيد' },
  { key: 'promotional', icon: Tag, en: 'Promotional', ar: 'ترويجي', descEn: 'Offers & discounts', descAr: 'عروض وخصومات' },
  { key: 'announcement', icon: Megaphone, en: 'Announcement', ar: 'إعلان', descEn: 'General clinic news', descAr: 'أخبار العيادة' },
]

export default function CampaignTypeSelector({ value, onChange, isAr }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {types.map((t) => {
        const Icon = t.icon
        const selected = value === t.key
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={cn(
              'flex items-start gap-3 p-4 rounded-xl border-2 text-start transition-all',
              selected
                ? 'border-healthcare-primary bg-healthcare-primary/5 shadow-sm'
                : 'border-gray-200 hover:border-gray-300 bg-white',
            )}
          >
            <div className={cn(
              'p-2 rounded-lg shrink-0',
              selected ? 'bg-healthcare-primary/10' : 'bg-gray-100',
            )}>
              <Icon className={cn('h-5 w-5', selected ? 'text-healthcare-primary' : 'text-gray-500')} />
            </div>
            <div>
              <p className={cn('text-sm font-medium', selected ? 'text-healthcare-primary' : 'text-gray-800')}>
                {isAr ? t.ar : t.en}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {isAr ? t.descAr : t.descEn}
              </p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
