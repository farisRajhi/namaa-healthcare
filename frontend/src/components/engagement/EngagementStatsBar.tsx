import { Users, Send, Tag, CheckCircle } from 'lucide-react'
import StatCard from '../ui/StatCard'
import type { EngagementStats } from '../../hooks/usePatientEngagementQueue'

interface Props {
  stats: EngagementStats
  isAr: boolean
}

export default function EngagementStatsBar({ stats, isAr }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard
        icon={Users}
        value={stats.toContact}
        label={isAr ? 'مرضى للتواصل' : 'To Contact'}
        iconBg="bg-red-100"
        iconColor="text-red-600"
      />
      <StatCard
        icon={Send}
        value={stats.sentToday}
        label={isAr ? 'رسائل اليوم' : 'Sent Today'}
        iconBg="bg-blue-100"
        iconColor="text-blue-600"
      />
      <StatCard
        icon={Tag}
        value={stats.activeOffers}
        label={isAr ? 'عروض نشطة' : 'Active Offers'}
        iconBg="bg-purple-100"
        iconColor="text-purple-600"
      />
      <StatCard
        icon={CheckCircle}
        value={`${stats.reminderConfirmRate}%`}
        label={isAr ? 'معدل التأكيد' : 'Confirm Rate'}
        iconBg="bg-green-100"
        iconColor="text-green-600"
      />
    </div>
  )
}
