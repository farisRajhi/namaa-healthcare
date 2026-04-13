import { useState } from 'react'
import { Send, X, Pencil, Check, Phone, Clock, MessageSquare } from 'lucide-react'
import type { SuggestionCard as SuggestionCardType } from '../../hooks/usePatientSuggestions'

interface Props {
  suggestion: SuggestionCardType
  rank: number
  isAr: boolean
  onSend: (suggestionId: string, messageAr?: string) => void
  onDismiss: (suggestionId: string) => void
  isSending: boolean
}

function getScoreColor(score: number) {
  if (score >= 80) return 'text-green-700 bg-green-50 border-green-200'
  if (score >= 60) return 'text-blue-700 bg-blue-50 border-blue-200'
  if (score >= 40) return 'text-amber-700 bg-amber-50 border-amber-200'
  return 'text-red-700 bg-red-50 border-red-200'
}

function getScoreBarColor(score: number) {
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-blue-500'
  if (score >= 40) return 'bg-amber-500'
  return 'bg-red-500'
}

function getScoreLabel(score: number, isAr: boolean) {
  if (score >= 80) return isAr ? 'ممتاز' : 'Excellent'
  if (score >= 60) return isAr ? 'جيد' : 'Good'
  if (score >= 40) return isAr ? 'متوسط' : 'Moderate'
  return isAr ? 'منخفض' : 'Low'
}

export default function SuggestionCard({ suggestion, rank, isAr, onSend, onDismiss, isSending }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedMessage, setEditedMessage] = useState(suggestion.messageAr || '')
  const [sent, setSent] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const isReminder = suggestion.suggestionType === 'reminder'
  const typeBadge = isReminder
    ? { label: isAr ? 'تذكير' : 'Reminder', cls: 'bg-blue-50 text-blue-700 border border-blue-200', icon: '🔔' }
    : { label: isAr ? 'عرض' : 'Offer', cls: 'bg-orange-50 text-orange-700 border border-orange-200', icon: '🎁' }

  const overdueText = suggestion.overdueDays <= 0
    ? (isAr ? 'موعده قريب' : 'Due soon')
    : (isAr ? `متأخر ${suggestion.overdueDays} يوم` : `${suggestion.overdueDays} days overdue`)

  const handleSendClick = () => {
    setShowConfirm(true)
  }

  const handleConfirmSend = () => {
    onSend(suggestion.suggestionId, isEditing ? editedMessage : undefined)
    setSent(true)
    setShowConfirm(false)
  }

  const handleCancelEdit = () => {
    setEditedMessage(suggestion.messageAr || '')
    setIsEditing(false)
  }

  if (sent) {
    return (
      <div className="bg-green-50 rounded-xl border border-green-200 p-4">
        <div className="flex items-center gap-3 text-green-700">
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <Check size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium">{isAr ? 'تم الإرسال بنجاح' : 'Sent successfully'}</span>
            <span className="text-xs text-green-600 block">{suggestion.patientName}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-card hover:shadow-card-hover transition-shadow">
      {/* Header: Score + Type badge */}
      <div className="flex items-center justify-between p-4 pb-0">
        <div className="flex items-center gap-3">
          {/* Rank */}
          <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-gray-500">{rank}</span>
          </div>
          {/* Score */}
          <div className={`flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-semibold border ${getScoreColor(suggestion.score)}`}>
            <span>{suggestion.score}/100</span>
            <span className="font-normal">{getScoreLabel(suggestion.score, isAr)}</span>
          </div>
          {/* Score bar */}
          <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden hidden sm:block" role="progressbar" aria-valuenow={suggestion.score} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full rounded-full transition-all ${getScoreBarColor(suggestion.score)}`} style={{ width: `${suggestion.score}%` }} />
          </div>
        </div>
        <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${typeBadge.cls}`}>
          {typeBadge.label}
        </span>
      </div>

      {/* Patient info + Service */}
      <div className="px-4 pt-3 pb-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-gray-900 text-base">{suggestion.patientName}</h3>
          {suggestion.phoneNumber && (
            <a
              href={`tel:${suggestion.phoneNumber}`}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600 transition-colors"
              dir="ltr"
            >
              <Phone size={14} />
              <span>{suggestion.phoneNumber}</span>
            </a>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-800 font-medium">
            {isAr ? suggestion.serviceName : (suggestion.serviceNameEn || suggestion.serviceName)}
          </span>
          <span className="text-gray-300">|</span>
          <span className="flex items-center gap-1 text-gray-500">
            <Clock size={14} />
            {overdueText}
          </span>
        </div>
      </div>

      {/* Message preview / editor */}
      <div className="mx-4 mt-3 bg-gray-50 rounded-lg border border-gray-100">
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
          <label className="text-xs text-gray-500 font-medium flex items-center gap-1.5">
            <MessageSquare size={12} />
            {isAr ? 'الرسالة المقترحة' : 'Suggested Message'}
          </label>
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-md transition-colors min-h-[28px]"
            >
              <Pencil size={12} />
              {isAr ? 'تعديل' : 'Edit'}
            </button>
          ) : (
            <div className="flex gap-1">
              <button
                onClick={() => { setIsEditing(false) }}
                className="flex items-center gap-1 px-2 py-1 text-xs text-green-600 hover:bg-green-50 rounded-md transition-colors min-h-[28px]"
              >
                <Check size={12} />
                {isAr ? 'تم' : 'Done'}
              </button>
              <button
                onClick={handleCancelEdit}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors min-h-[28px]"
              >
                <X size={12} />
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          )}
        </div>
        <div className="px-3 pb-3">
          {isEditing ? (
            <textarea
              className="w-full border border-gray-200 rounded-lg p-2.5 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400"
              rows={3}
              dir="rtl"
              aria-label={isAr ? 'تعديل الرسالة' : 'Edit message'}
              value={editedMessage}
              onChange={e => setEditedMessage(e.target.value)}
            />
          ) : (
            <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed" dir="rtl">
              {suggestion.messageAr || suggestion.messageEn}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 p-4 pt-3">
        {showConfirm ? (
          <>
            <span className="text-xs text-gray-500 flex-1">
              {isAr ? 'تأكيد الإرسال؟' : 'Confirm send?'}
            </span>
            <button
              onClick={handleConfirmSend}
              disabled={isSending}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-50 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 min-h-[44px]"
            >
              <Check size={16} />
              {isAr ? 'تأكيد' : 'Confirm'}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="px-3 py-2.5 text-sm text-gray-500 hover:bg-gray-100 active:bg-gray-200 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 min-h-[44px]"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleSendClick}
              disabled={isSending}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-50 rounded-lg transition-colors ms-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 min-h-[44px]"
            >
              <Send size={16} />
              {isAr ? 'إرسال واتساب' : 'Send WhatsApp'}
            </button>
            <button
              onClick={() => onDismiss(suggestion.suggestionId)}
              className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 active:bg-red-100 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label={isAr ? 'تجاهل هذا الاقتراح' : 'Dismiss this suggestion'}
            >
              <X size={18} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
