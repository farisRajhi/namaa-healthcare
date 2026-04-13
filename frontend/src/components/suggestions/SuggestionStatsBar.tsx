import { Users, Bell, Tag, Send } from 'lucide-react'
import StatCard from '../ui/StatCard'
import type { SuggestionStats } from '../../hooks/usePatientSuggestions'

interface Props {
  stats: SuggestionStats
  isAr: boolean
}

export default function SuggestionStatsBar({ stats, isAr }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard
        icon={Users}
        value={stats.totalPending}
        label={isAr ? 'مرضى للتواصل' : 'Patients to Contact'}
        iconBg="bg-red-100"
        iconColor="text-red-600"
      />
      <StatCard
        icon={Bell}
        value={stats.reminders}
        label={isAr ? 'تذكيرات' : 'Reminders'}
        iconBg="bg-blue-100"
        iconColor="text-blue-600"
      />
      <StatCard
        icon={Tag}
        value={stats.offers}
        label={isAr ? 'عروض مطلوبة' : 'Offers Needed'}
        iconBg="bg-orange-100"
        iconColor="text-orange-600"
      />
      <StatCard
        icon={Send}
        value={stats.sentToday}
        label={isAr ? 'أُرسلت اليوم' : 'Sent Today'}
        iconBg="bg-green-100"
        iconColor="text-green-600"
      />
    </div>
  )
}
