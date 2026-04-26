import { useState } from 'react'
import { X, Pencil, Check, Phone, Clock, MessageSquare, MessageCircle, ChevronDown, Database, Upload } from 'lucide-react'
import type { SuggestionCard as SuggestionCardType, RecallStatus } from '../../hooks/usePatientSuggestions'
import { getWhatsAppLink } from '../../lib/whatsapp'

interface Props {
  suggestion: SuggestionCardType
  rank: number
  isAr: boolean
  onEditMessage?: (suggestionId: string, message: string) => void
  onUpdateStatus: (id: string, source: 'native' | 'external', status: RecallStatus) => void
  isUpdating: boolean
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

function formatDate(iso: string | null, isAr: boolean): string {
  if (!iso) return isAr ? 'غير معروف' : 'unknown'
  const d = new Date(iso)
  return d.toLocaleDateString(isAr ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function SuggestionCard({ suggestion, rank, isAr, onEditMessage, onUpdateStatus, isUpdating }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedMessage, setEditedMessage] = useState(suggestion.messageAr || '')
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [marked, setMarked] = useState<RecallStatus | null>(null)

  const isExternal = suggestion.source === 'external'
  const hasMessage = !isExternal && (suggestion.messageAr || suggestion.messageEn)

  const sourceBadge = isExternal
    ? { label: isAr ? 'قديم' : 'Legacy', cls: 'bg-amber-50 text-amber-700 border border-amber-200', Icon: Upload }
    : { label: isAr ? 'مباشر' : 'Native', cls: 'bg-indigo-50 text-indigo-700 border border-indigo-200', Icon: Database }

  const typeBadge = !isExternal && suggestion.suggestionType
    ? (suggestion.suggestionType === 'reminder'
        ? { label: isAr ? 'تذكير' : 'Reminder', cls: 'bg-blue-50 text-blue-700 border border-blue-200' }
        : { label: isAr ? 'عرض' : 'Offer', cls: 'bg-orange-50 text-orange-700 border border-orange-200' })
    : null

  const serviceLabel = isAr
    ? (suggestion.serviceName || suggestion.serviceNameEn || '—')
    : (suggestion.serviceNameEn || suggestion.serviceName || '—')

  const overdueText = suggestion.overdueDays > 0
    ? (isAr ? `متأخر ${suggestion.overdueDays} يوم` : `${suggestion.overdueDays} days overdue`)
    : (isAr ? 'موعده قريب' : 'Due soon')

  const lastVisitText = suggestion.lastCompletedAt
    ? (isAr
        ? `آخر زيارة ${formatDate(suggestion.lastCompletedAt, true)}`
        : `last visit ${formatDate(suggestion.lastCompletedAt, false)}`)
    : null

  const reliability = suggestion.reliability
  const reliabilityText = isExternal
    ? (reliability.totalVisits > 0
        ? (isAr
            ? `${reliability.totalVisits} زيارة (من السجلات القديمة)`
            : `${reliability.totalVisits} past visits (from legacy records)`)
        : null)
    : (() => {
        const pct = reliability.completionRate !== null
          ? Math.round(reliability.completionRate * 100)
          : null
        const visits = reliability.totalVisits
        if (visits === 0 && pct === null) return null
        const visitsStr = isAr ? `${visits} زيارة` : `${visits} visit${visits !== 1 ? 's' : ''}`
        const rateStr = pct !== null
          ? (isAr ? `التزام ${pct}%` : `${pct}% show rate`)
          : null
        return rateStr ? `${visitsStr} • ${rateStr}` : visitsStr
      })()

  const handleWhatsAppClick = () => {
    if (!suggestion.phoneNumber) return
    const prefill = isExternal ? undefined : (isAr ? suggestion.messageAr : suggestion.messageEn) ?? undefined
    const url = getWhatsAppLink(suggestion.phoneNumber, prefill ?? undefined)
    window.open(url, '_blank', 'noopener,noreferrer')
    onUpdateStatus(suggestion.id, suggestion.source, 'contacted')
    setMarked('contacted')
  }

  const handleStatusSelect = (status: RecallStatus) => {
    onUpdateStatus(suggestion.id, suggestion.source, status)
    setMarked(status)
    setStatusMenuOpen(false)
  }

  const handleCancelEdit = () => {
    setEditedMessage(suggestion.messageAr || '')
    setIsEditing(false)
  }

  const handleSaveEdit = () => {
    if (onEditMessage && suggestion.suggestionId) {
      onEditMessage(suggestion.suggestionId, editedMessage)
    }
    setIsEditing(false)
  }

  const statusOptions: { key: RecallStatus; label: string }[] = [
    { key: 'booked', label: isAr ? 'تم الحجز' : 'Booked' },
    { key: 'not_interested', label: isAr ? 'غير مهتم' : 'Not interested' },
    { key: 'unreachable', label: isAr ? 'لا يمكن الوصول' : 'Unreachable' },
  ]

  if (marked) {
    const markedLabel = marked === 'contacted' ? (isAr ? 'تم التواصل' : 'Contacted')
      : marked === 'booked' ? (isAr ? 'تم الحجز' : 'Booked')
      : marked === 'not_interested' ? (isAr ? 'غير مهتم' : 'Not interested')
      : (isAr ? 'لا يمكن الوصول' : 'Unreachable')
    return (
      <div className="bg-green-50 rounded-xl border border-green-200 p-4">
        <div className="flex items-center gap-3 text-green-700">
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <Check size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium">{markedLabel}</span>
            <span className="text-xs text-green-600 block">{suggestion.patientName}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-card hover:shadow-card-hover transition-shadow">
      {/* Header: Rank + Score + Source + Type badges */}
      <div className="flex items-center flex-wrap gap-2 p-4 pb-0">
        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-gray-500">{rank}</span>
        </div>
        <div className={`flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-semibold border ${getScoreColor(suggestion.score)}`}>
          <span>{suggestion.score}/100</span>
          <span className="font-normal">{getScoreLabel(suggestion.score, isAr)}</span>
        </div>
        <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden hidden sm:block" role="progressbar" aria-valuenow={suggestion.score} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full rounded-full transition-all ${getScoreBarColor(suggestion.score)}`} style={{ width: `${suggestion.score}%` }} />
        </div>
        <div className={`ms-auto flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${sourceBadge.cls}`}>
          <sourceBadge.Icon size={12} />
          {sourceBadge.label}
        </div>
        {typeBadge && (
          <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${typeBadge.cls}`}>
            {typeBadge.label}
          </span>
        )}
      </div>

      {/* Patient info */}
      <div className="px-4 pt-3 pb-0 space-y-1.5">
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
        <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-sm">
          <span className="text-gray-800 font-medium">{serviceLabel}</span>
          {lastVisitText && (
            <>
              <span className="text-gray-300">•</span>
              <span className="text-gray-500">{lastVisitText}</span>
            </>
          )}
          <span className="text-gray-300">•</span>
          <span className="flex items-center gap-1 text-gray-500">
            <Clock size={14} />
            {overdueText}
          </span>
        </div>
        {reliabilityText && (
          <p className="text-xs text-gray-500">{reliabilityText}</p>
        )}
      </div>

      {/* Message preview (native only) */}
      {hasMessage && (
        <div className="mx-4 mt-3 bg-gray-50 rounded-lg border border-gray-100">
          <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
            <label className="text-xs text-gray-500 font-medium flex items-center gap-1.5">
              <MessageSquare size={12} />
              {isAr ? 'الرسالة المقترحة (يمكن نسخها)' : 'Suggested Message (optional, for copying)'}
            </label>
            {onEditMessage && suggestion.suggestionId && (!isEditing ? (
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
                  onClick={handleSaveEdit}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-green-600 hover:bg-green-50 rounded-md transition-colors min-h-[28px]"
                >
                  <Check size={12} />
                  {isAr ? 'حفظ' : 'Save'}
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors min-h-[28px]"
                >
                  <X size={12} />
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            ))}
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
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 p-4 pt-3">
        <button
          onClick={handleWhatsAppClick}
          disabled={!suggestion.phoneNumber || isUpdating}
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 min-h-[44px]"
          title={!suggestion.phoneNumber ? (isAr ? 'لا يوجد رقم' : 'No phone number') : undefined}
        >
          <MessageCircle size={16} />
          {isAr ? 'واتساب' : 'WhatsApp'}
        </button>

        <div className="relative ms-auto">
          <button
            onClick={() => setStatusMenuOpen(v => !v)}
            disabled={isUpdating}
            className="flex items-center gap-1.5 px-3 py-2.5 text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 active:bg-gray-100 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 min-h-[44px]"
            aria-haspopup="menu"
            aria-expanded={statusMenuOpen}
          >
            {isAr ? 'تحديد الحالة' : 'Mark as'}
            <ChevronDown size={14} />
          </button>
          {statusMenuOpen && (
            <div
              role="menu"
              className="absolute end-0 top-full mt-1 min-w-[160px] bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1"
            >
              {statusOptions.map(opt => (
                <button
                  key={opt.key}
                  role="menuitem"
                  onClick={() => handleStatusSelect(opt.key)}
                  className="w-full text-start px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
