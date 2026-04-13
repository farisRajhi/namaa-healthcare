import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../ui/Toast'
import Modal from '../ui/Modal'
import { Loader2, MessageSquare } from 'lucide-react'

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

export default function QuickActionSms({ open, onClose, patientId, patientName, careGapId, isAr }: Props) {
  const { user } = useAuth()
  const orgId = user?.org?.id || ''
  const { addToast } = useToast()
  const [mode, setMode] = useState<'template' | 'custom'>('template')
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [customMessage, setCustomMessage] = useState('')

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

  // Fetch SMS templates
  const { data: templates } = useQuery<SmsTemplate[]>({
    queryKey: ['sms-templates-sms', orgId],
    queryFn: async () => {
      const res = await api.get(`/api/sms-templates/${orgId}`)
      const list = res.data?.data || res.data || []
      return (Array.isArray(list) ? list : []).filter(
        (t: any) => t.isActive && (t.channel === 'sms' || t.channel === 'both'),
      )
    },
    enabled: open && !!orgId,
    staleTime: 60_000,
  })

  const sendMutation = useMutation({
    mutationFn: async () => {
      const phone = patient?.phone || patient?.phoneNumber
      if (!phone) throw new Error('No phone number')

      if (mode === 'template' && selectedTemplate) {
        await api.post(`/api/sms-templates/${selectedTemplate}/send`, {
          phone,
          patientId,
          channel: 'sms',
          lang: isAr ? 'ar' : 'en',
        })
      } else {
        await api.post('/api/sms-templates/send-raw', {
          phone,
          body: customMessage,
          channel: 'sms',
          patientId,
          orgId,
        })
      }

      if (careGapId) {
        await api.patch(`/api/care-gaps/${careGapId}`, { status: 'contacted' }).catch(() => {})
      }
    },
    onSuccess: () => {
      addToast({ type: 'success', title: isAr ? 'تم إرسال الرسالة' : 'SMS sent' })
      onClose()
    },
    onError: () => {
      addToast({ type: 'error', title: isAr ? 'فشل الإرسال' : 'Failed to send' })
    },
  })

  const phone = patient?.phone || patient?.phoneNumber
    || patient?.contacts?.find((c: any) => c.contactType === 'phone')?.contactValue
    || patient?.contacts?.find((c: any) => c.contactType === 'whatsapp')?.contactValue
    || ''
  const canSend = phone && (mode === 'template' ? !!selectedTemplate : customMessage.trim().length > 0)

  return (
    <Modal open={open} onClose={onClose} title={isAr ? 'إرسال رسالة نصية' : 'Send SMS'} size="md">
      <div className="space-y-4">
        {/* Patient info */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">{patientName}</span>
          <span className="text-gray-400 font-mono text-xs" dir="ltr">{phone || '...'}</span>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setMode('template')}
            className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              mode === 'template' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
            }`}
          >
            {isAr ? 'قالب جاهز' : 'Template'}
          </button>
          <button
            type="button"
            onClick={() => setMode('custom')}
            className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              mode === 'custom' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
            }`}
          >
            {isAr ? 'رسالة مخصصة' : 'Custom'}
          </button>
        </div>

        {mode === 'template' ? (
          <>
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
            {selectedTemplate && templates?.find((t) => t.id === selectedTemplate) && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-800 whitespace-pre-wrap" dir={isAr ? 'rtl' : 'ltr'}>
                  {isAr
                    ? templates.find((t) => t.id === selectedTemplate)!.bodyAr
                    : templates.find((t) => t.id === selectedTemplate)!.bodyEn}
                </p>
              </div>
            )}
          </>
        ) : (
          <div>
            <textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              rows={4}
              className="input w-full text-sm"
              placeholder={isAr ? 'اكتب رسالتك هنا...' : 'Type your message...'}
              dir={isAr ? 'rtl' : 'ltr'}
            />
            <p className="text-[10px] text-gray-400 mt-1">
              {customMessage.length} {isAr ? 'حرف' : 'chars'}
            </p>
          </div>
        )}

        <button
          onClick={() => sendMutation.mutate()}
          disabled={!canSend || sendMutation.isPending}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {sendMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MessageSquare className="h-4 w-4" />
          )}
          {isAr ? 'إرسال' : 'Send SMS'}
        </button>
      </div>
    </Modal>
  )
}
