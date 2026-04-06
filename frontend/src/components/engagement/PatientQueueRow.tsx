import { useState } from 'react'
import { MessageCircle, MessageSquare, Gift } from 'lucide-react'
import { cn } from '../../lib/utils'
import PriorityScoreBadge, { getLevel } from './PriorityScoreBadge'
import QuickActionWhatsApp from './QuickActionWhatsApp'
import QuickActionSms from './QuickActionSms'
import QuickActionOffer from './QuickActionOffer'
import Badge from '../ui/Badge'
import type { RankedPatient } from '../../hooks/usePatientEngagementQueue'

interface Props {
  patient: RankedPatient
  rank: number
  isAr: boolean
}

const priorityLabels: Record<string, { en: string; ar: string }> = {
  critical: { en: 'Critical', ar: 'حرج' },
  high:     { en: 'High', ar: 'مرتفع' },
  medium:   { en: 'Medium', ar: 'متوسط' },
  low:      { en: 'Low', ar: 'منخفض' },
}

const priorityBadgeVariant: Record<string, 'danger' | 'warning' | 'neutral' | 'info'> = {
  critical: 'danger',
  high: 'warning',
  medium: 'neutral',
  low: 'neutral',
}

export default function PatientQueueRow({ patient, rank, isAr }: Props) {
  const [waOpen, setWaOpen] = useState(false)
  const [smsOpen, setSmsOpen] = useState(false)
  const [offerOpen, setOfferOpen] = useState(false)
  const [contacted, setContacted] = useState(false)

  const level = getLevel(patient.priorityScore)

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-3 p-3 rounded-xl border transition-all hover:shadow-sm',
          contacted ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-gray-200 hover:border-gray-300',
        )}
      >
        {/* Rank number */}
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
          <span className="text-xs font-bold text-gray-500">{rank}</span>
        </div>

        {/* Patient info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-gray-900 truncate">
              {patient.patientName}
            </span>
            <Badge variant={priorityBadgeVariant[level]} dot>
              {priorityLabels[level]?.[isAr ? 'ar' : 'en']}
            </Badge>
            {contacted && (
              <Badge variant="success" dot>
                {isAr ? 'تم التواصل' : 'Contacted'}
              </Badge>
            )}
          </div>
          {patient.ruleName && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {patient.ruleName}
            </p>
          )}
        </div>

        {/* Score */}
        <div className="flex-shrink-0 hidden sm:block">
          <PriorityScoreBadge score={patient.priorityScore} size="sm" />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => setWaOpen(true)}
            className="p-2 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
            title={isAr ? 'واتساب' : 'WhatsApp'}
          >
            <MessageCircle className="h-4 w-4" />
          </button>
          <button
            onClick={() => setSmsOpen(true)}
            className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
            title={isAr ? 'رسالة نصية' : 'SMS'}
          >
            <MessageSquare className="h-4 w-4" />
          </button>
          <button
            onClick={() => setOfferOpen(true)}
            className="p-2 rounded-lg text-purple-600 hover:bg-purple-50 transition-colors"
            title={isAr ? 'عرض' : 'Offer'}
          >
            <Gift className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Action modals */}
      <QuickActionWhatsApp
        open={waOpen}
        onClose={() => { setWaOpen(false); setContacted(true) }}
        patientId={patient.patientId}
        patientName={patient.patientName}
        careGapId={patient.careGapId}
        isAr={isAr}
      />
      <QuickActionSms
        open={smsOpen}
        onClose={() => { setSmsOpen(false); setContacted(true) }}
        patientId={patient.patientId}
        patientName={patient.patientName}
        careGapId={patient.careGapId}
        isAr={isAr}
      />
      <QuickActionOffer
        open={offerOpen}
        onClose={() => { setOfferOpen(false); setContacted(true) }}
        patientId={patient.patientId}
        patientName={patient.patientName}
        careGapId={patient.careGapId}
        isAr={isAr}
      />
    </>
  )
}
