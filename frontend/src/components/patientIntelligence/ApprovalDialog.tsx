import { useState } from 'react'
import {
  X,
  MessageSquare,
  Smartphone,
  Users,
  Rocket,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import type { Suggestion } from './SuggestionCard'

interface ApprovalDialogProps {
  suggestion: Suggestion
  isAr: boolean
  mode: 'approve' | 'edit'
  onConfirm: (data: {
    messageScriptAr: string
    messageScriptEn: string
    channel: string[]
  }) => void
  onCancel: () => void
}

export default function ApprovalDialog({
  suggestion,
  isAr,
  mode,
  onConfirm,
  onCancel,
}: ApprovalDialogProps) {
  const [messageAr, setMessageAr] = useState(suggestion.messageScriptAr)
  const [messageEn, setMessageEn] = useState(suggestion.messageScriptEn)
  const [channels, setChannels] = useState<string[]>(suggestion.channel)

  const toggleChannel = (ch: string) => {
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    )
  }

  const handleConfirm = () => {
    onConfirm({
      messageScriptAr: messageAr,
      messageScriptEn: messageEn,
      channel: channels,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-heading text-lg font-semibold text-healthcare-text">
              {mode === 'approve'
                ? isAr ? 'مراجعة واطلاق الحملة' : 'Review & Launch Campaign'
                : isAr ? 'تعديل الحملة' : 'Edit Campaign'}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {isAr ? suggestion.campaignNameAr : suggestion.campaignName}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Patient count summary */}
          <div className="flex items-center gap-3 bg-primary-50 rounded-xl p-4">
            <Users className="h-5 w-5 text-primary-600" />
            <div>
              <span className="text-sm font-semibold text-primary-700">
                {(suggestion.patientCount ?? 0).toLocaleString()}
              </span>
              <span className="text-sm text-primary-600 ms-1">
                {isAr ? 'مريض سيتم التواصل معهم' : 'patients will be contacted'}
              </span>
            </div>
          </div>

          {/* Channel selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {isAr ? 'قناة التواصل' : 'Channel'}
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => toggleChannel('whatsapp')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all',
                  channels.includes('whatsapp')
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                )}
              >
                <MessageSquare className="h-4 w-4" />
                WhatsApp
              </button>
              <button
                type="button"
                onClick={() => toggleChannel('sms')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all',
                  channels.includes('sms')
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                )}
              >
                <Smartphone className="h-4 w-4" />
                SMS
              </button>
            </div>
            {channels.length === 0 && (
              <p className="text-xs text-red-500 mt-1">
                {isAr ? 'يجب اختيار قناة واحدة على الأقل' : 'Select at least one channel'}
              </p>
            )}
          </div>

          {/* Arabic message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {isAr ? 'الرسالة بالعربية' : 'Arabic Message'}
            </label>
            <textarea
              dir="rtl"
              value={messageAr}
              onChange={(e) => setMessageAr(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-arabic leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 transition-colors resize-none"
            />
          </div>

          {/* English message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {isAr ? 'الرسالة بالإنجليزية' : 'English Message'}
            </label>
            <textarea
              dir="ltr"
              value={messageEn}
              onChange={(e) => setMessageEn(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 transition-colors resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            onClick={handleConfirm}
            disabled={channels.length === 0}
            className={cn(
              'flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white rounded-xl transition-colors',
              channels.length === 0
                ? 'bg-gray-300 cursor-not-allowed'
                : mode === 'approve'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-blue-600 hover:bg-blue-700'
            )}
          >
            <Rocket className="h-4 w-4" />
            {mode === 'approve'
              ? isAr ? 'إطلاق الحملة' : 'Launch Campaign'
              : isAr ? 'حفظ التعديلات' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
