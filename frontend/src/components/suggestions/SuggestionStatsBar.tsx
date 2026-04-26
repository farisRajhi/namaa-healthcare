import { Users, Database, Upload, Send } from 'lucide-react'
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
        label={isAr ? 'إجمالي المتأخرين' : 'Total Overdue'}
        iconBg="bg-red-100"
        iconColor="text-red-600"
      />
      <StatCard
        icon={Database}
        value={stats.nativePending}
        label={isAr ? 'من النظام' : 'From Native'}
        iconBg="bg-indigo-100"
        iconColor="text-indigo-600"
      />
      <StatCard
        icon={Upload}
        value={stats.externalPending}
        label={isAr ? 'من الملفات المرفوعة' : 'From Legacy Upload'}
        iconBg="bg-amber-100"
        iconColor="text-amber-600"
      />
      <StatCard
        icon={Send}
        value={stats.sentToday}
        label={isAr ? 'تم التواصل اليوم' : 'Contacted Today'}
        iconBg="bg-green-100"
        iconColor="text-green-600"
      />
    </div>
  )
}
