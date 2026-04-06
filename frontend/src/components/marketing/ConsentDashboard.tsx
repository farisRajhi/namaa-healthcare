import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { ShieldCheck, MessageSquare, Phone, Mail } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ConsentDashboardProps {
  orgId: string
  isAr: boolean
}

interface ChannelStat {
  channel: string
  label: string
  labelAr: string
  icon: React.ElementType
  color: string
  optedIn: number
  total: number
}

export default function ConsentDashboard({ orgId, isAr }: ConsentDashboardProps) {
  const { data } = useQuery({
    queryKey: ['consent-stats', orgId],
    queryFn: async () => {
      try {
        const res = await api.get(`/api/consent/${orgId}/stats`)
        return res.data
      } catch {
        return null
      }
    },
    enabled: !!orgId,
    staleTime: 120_000,
  })

  if (!data) return null

  const channels: ChannelStat[] = [
    {
      channel: 'sms',
      label: 'SMS',
      labelAr: 'رسائل نصية',
      icon: MessageSquare,
      color: 'text-blue-600 bg-blue-100',
      optedIn: data.smsOptIn || 0,
      total: data.totalPatients || 1,
    },
    {
      channel: 'whatsapp',
      label: 'WhatsApp',
      labelAr: 'واتساب',
      icon: MessageSquare,
      color: 'text-green-600 bg-green-100',
      optedIn: data.whatsappOptIn || 0,
      total: data.totalPatients || 1,
    },
    {
      channel: 'voice',
      label: 'Voice',
      labelAr: 'مكالمات',
      icon: Phone,
      color: 'text-amber-600 bg-amber-100',
      optedIn: data.voiceOptIn || 0,
      total: data.totalPatients || 1,
    },
    {
      channel: 'email',
      label: 'Email',
      labelAr: 'بريد إلكتروني',
      icon: Mail,
      color: 'text-purple-600 bg-purple-100',
      optedIn: data.emailOptIn || 0,
      total: data.totalPatients || 1,
    },
  ]

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="h-5 w-5 text-green-600" />
        <h3 className="text-sm font-semibold text-gray-700">
          {isAr ? 'موافقات التسويق (PDPL)' : 'Marketing Consent (PDPL)'}
        </h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {channels.map((ch) => {
          const pct = ch.total > 0 ? Math.round((ch.optedIn / ch.total) * 100) : 0
          return (
            <div key={ch.channel} className="text-center">
              <div className={cn('inline-flex p-2 rounded-lg mb-2', ch.color.split(' ')[1])}>
                <ch.icon className={cn('h-4 w-4', ch.color.split(' ')[0])} />
              </div>
              <p className="text-lg font-bold text-gray-900">{pct}%</p>
              <p className="text-xs text-gray-500">{isAr ? ch.labelAr : ch.label}</p>
              <div className="mt-1 h-1 bg-gray-100 rounded-full mx-2">
                <div className="h-full bg-green-400 rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
