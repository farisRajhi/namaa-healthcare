import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../ui/Toast'
import Modal from '../ui/Modal'
import { Send, Loader2 } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  patientId: string
  patientName: string
  careGapId?: string
  isAr: boolean
}

interface SmsTemplate {
  id: string
  name: string
  bodyAr: string
  bodyEn: string
  channel: string
}

export default function QuickActionWhatsApp({ open, onClose, patientId, patientName, careGapId, isAr }: Props) {
  const { user } = useAuth()
  const orgId = user?.org?.id || ''
  const { addToast } = useToast()
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')

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

  // Fetch WhatsApp templates
  const { data: templates } = useQuery<SmsTemplate[]>({
    queryKey: ['sms-templates-wa', orgId],
    queryFn: async () => {
      const res = await api.get(`/api/sms-templates/${orgId}`)
      const list = res.data?.data || res.data || []
      return (Array.isArray(list) ? list : []).filter(
        (t: any) => t.isActive && (t.channel === 'whatsapp' || t.channel === 'both'),
      )
    },
    enabled: open && !!orgId,
    staleTime: 60_000,
  })

  const sendMutation = useMutation({
    mutationFn: async () => {
      const phone = patient?.phone || patient?.phoneNumber
      if (!phone) throw new Error('No phone number')
      await api.post(`/api/sms-templates/${selectedTemplate}/send`, {
        phone,
        patientId,
        channel: 'whatsapp',
        lang: isAr ? 'ar' : 'en',
      })
      // Mark care gap as contacted
      if (careGapId) {
        await api.patch(`/api/care-gaps/${careGapId}`, { status: 'contacted' }).catch(() => {})
      }
    },
    onSuccess: () => {
      addToast({ type: 'success', title: isAr ? 'تم إرسال الرسالة' : 'Message sent' })
      onClose()
    },
    onError: () => {
      addToast({ type: 'error', title: isAr ? 'فشل الإرسال' : 'Failed to send' })
    },
  })

  const selected = templates?.find((t) => t.id === selectedTemplate)
  const phone = patient?.phone || patient?.phoneNumber || ''

  return (
    <Modal open={open} onClose={onClose} title={isAr ? 'إرسال واتساب' : 'Send WhatsApp'} size="md">
      <div className="space-y-4">
        {/* Patient info */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">{patientName}</span>
          <span className="text-gray-400 font-mono text-xs" dir="ltr">{phone || '...'}</span>
        </div>

        {/* Template picker */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1.5 block">
            {isAr ? 'اختر قالب الرسالة' : 'Select message template'}
          </label>
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            className="input w-full text-sm"
          >
            <option value="">{isAr ? '— اختر —' : '— Select —'}</option>
            {templates?.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* Preview */}
        {selected && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-xs text-green-800 whitespace-pre-wrap" dir={isAr ? 'rtl' : 'ltr'}>
              {isAr ? selected.bodyAr : selected.bodyEn}
            </p>
          </div>
        )}

        {/* Send button */}
        <button
          onClick={() => sendMutation.mutate()}
          disabled={!selectedTemplate || !phone || sendMutation.isPending}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {sendMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {isAr ? 'إرسال' : 'Send'}
        </button>
      </div>
    </Modal>
  )
}
