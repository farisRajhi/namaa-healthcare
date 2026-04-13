import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../ui/Toast'
import Modal from '../ui/Modal'
import { Gift, Loader2, Tag } from 'lucide-react'
import { cn } from '../../lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  patientId: string
  patientName: string
  careGapId?: string
  isAr: boolean
}

interface Offer {
  offerId: string
  name: string
  nameAr?: string
  offerType: string
  discountValue?: number
  discountUnit?: string
  promoCode?: string
  status: string
  messageAr?: string
  messageEn?: string
}

const offerTypeLabels: Record<string, { en: string; ar: string }> = {
  percentage_discount: { en: 'Discount %', ar: 'خصم %' },
  fixed_discount: { en: 'Fixed Discount', ar: 'خصم ثابت' },
  free_addon: { en: 'Free Add-on', ar: 'إضافة مجانية' },
  bundle: { en: 'Bundle', ar: 'باقة' },
  loyalty_reward: { en: 'Loyalty', ar: 'ولاء' },
}

export default function QuickActionOffer({ open, onClose, patientId, patientName, careGapId, isAr }: Props) {
  const { user } = useAuth()
  const orgId = user?.org?.id || ''
  const { addToast } = useToast()
  const [selectedOffer, setSelectedOffer] = useState<string>('')

  // Fetch patient phone
  const { data: patient } = useQuery({
    queryKey: ['patient-phone', patientId],
    queryFn: async () => {
      const res = await api.get(`/api/patients/${patientId}`)
      return res.data?.data || res.data
    },
    enabled: open && !!patientId,
    staleTime: 300_000,
  })

  // Fetch active offers
  const { data: offers } = useQuery<Offer[]>({
    queryKey: ['offers-active', orgId],
    queryFn: async () => {
      const res = await api.get(`/api/offers/${orgId}`)
      const list = res.data?.data || res.data || []
      return (Array.isArray(list) ? list : []).filter((o: any) => o.status === 'active')
    },
    enabled: open && !!orgId,
    staleTime: 60_000,
  })

  const sendMutation = useMutation({
    mutationFn: async () => {
      const phone = patient?.phone || patient?.phoneNumber
        || patient?.contacts?.find((c: any) => c.contactType === 'whatsapp')?.contactValue
        || patient?.contacts?.find((c: any) => c.contactType === 'phone')?.contactValue
      if (!phone) throw new Error('No phone number')
      const offer = offers?.find((o) => o.offerId === selectedOffer)
      if (!offer) throw new Error('No offer selected')

      // Send the offer message via raw SMS
      const body = isAr ? offer.messageAr : offer.messageEn
      if (body) {
        await api.post('/api/sms-templates/send-raw', {
          phone,
          body,
          channel: 'whatsapp',
          patientId,
          orgId,
        })
      }

      if (careGapId) {
        await api.patch(`/api/care-gaps/${careGapId}`, { status: 'contacted' }).catch(() => {})
      }
    },
    onSuccess: () => {
      addToast({ type: 'success', title: isAr ? 'تم إرسال العرض' : 'Offer sent' })
      onClose()
    },
    onError: () => {
      addToast({ type: 'error', title: isAr ? 'فشل الإرسال' : 'Failed to send' })
    },
  })

  const selected = offers?.find((o) => o.offerId === selectedOffer)

  return (
    <Modal open={open} onClose={onClose} title={isAr ? 'إرسال عرض' : 'Send Offer'} size="md">
      <div className="space-y-4">
        {/* Patient info */}
        <div className="text-sm text-gray-600">{patientName}</div>

        {/* Offer cards */}
        {offers?.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">
            {isAr ? 'لا توجد عروض نشطة' : 'No active offers'}
          </p>
        )}

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {offers?.map((offer) => (
            <button
              key={offer.offerId}
              type="button"
              onClick={() => setSelectedOffer(offer.offerId)}
              className={cn(
                'w-full text-start p-3 rounded-lg border transition-colors',
                selectedOffer === offer.offerId
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-gray-200 hover:border-gray-300',
              )}
            >
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-purple-500 shrink-0" />
                <span className="text-sm font-medium text-gray-800">
                  {isAr ? (offer.nameAr || offer.name) : offer.name}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-500">
                  {offerTypeLabels[offer.offerType]?.[isAr ? 'ar' : 'en'] || offer.offerType}
                </span>
                {offer.discountValue && (
                  <span className="text-xs font-medium text-purple-600">
                    {offer.discountUnit === 'percent' ? `${offer.discountValue}%` : `${offer.discountValue} SAR`}
                  </span>
                )}
                {offer.promoCode && (
                  <span className="text-[10px] font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                    {offer.promoCode}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Preview */}
        {selected && (isAr ? selected.messageAr : selected.messageEn) && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
            <p className="text-xs text-purple-800 whitespace-pre-wrap" dir={isAr ? 'rtl' : 'ltr'}>
              {isAr ? selected.messageAr : selected.messageEn}
            </p>
          </div>
        )}

        <button
          onClick={() => sendMutation.mutate()}
          disabled={!selectedOffer || sendMutation.isPending}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {sendMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Gift className="h-4 w-4" />
          )}
          {isAr ? 'إرسال العرض' : 'Send Offer'}
        </button>
      </div>
    </Modal>
  )
}
