import { useState } from 'react'
import {
  MessageSquare,
  Smartphone,
  ChevronDown,
  ChevronUp,
  Check,
  Pencil,
  SkipForward,
  Users,
  Sparkles,
} from 'lucide-react'
import { cn } from '../../lib/utils'

export interface Suggestion {
  id: string
  analysisId: string
  campaignName: string
  campaignNameAr: string
  type: 'recall' | 'preventive' | 'follow_up' | 'promotional'
  channel: string[]
  priority: 'high' | 'medium' | 'low'
  patientCount: number
  confidenceScore: number
  reasoning: string
  reasoningAr: string
  messageScriptAr: string
  messageScriptEn: string
  status: 'pending' | 'approved' | 'rejected' | 'edited'
  createdAt: string
}

interface SuggestionCardProps {
  suggestion: Suggestion
  isAr: boolean
  onApprove: (s: Suggestion) => void
  onEdit: (s: Suggestion) => void
  onSkip: (s: Suggestion) => void
}

const typeConfig: Record<string, { ar: string; en: string; color: string }> = {
  recall: { ar: 'استدعاء', en: 'Recall', color: 'bg-blue-100 text-blue-800' },
  preventive: { ar: 'وقائي', en: 'Preventive', color: 'bg-green-100 text-green-800' },
  follow_up: { ar: 'متابعة', en: 'Follow-up', color: 'bg-amber-100 text-amber-800' },
  promotional: { ar: 'ترويجي', en: 'Promotional', color: 'bg-purple-100 text-purple-800' },
}

const priorityConfig: Record<string, { ar: string; en: string; dot: string }> = {
  high: { ar: 'عالية', en: 'High', dot: 'bg-red-500' },
  medium: { ar: 'متوسطة', en: 'Medium', dot: 'bg-amber-500' },
  low: { ar: 'منخفضة', en: 'Low', dot: 'bg-gray-400' },
}

export default function SuggestionCard({
  suggestion,
  isAr,
  onApprove,
  onEdit,
  onSkip,
}: SuggestionCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [messageTab, setMessageTab] = useState<'ar' | 'en'>('ar')

  const typeInfo = typeConfig[suggestion.type] || typeConfig.recall
  const priorityInfo = priorityConfig[suggestion.priority] || priorityConfig.medium
  const isActioned = suggestion.status === 'approved' || suggestion.status === 'rejected'

  return (
    <div
      className={cn(
        'card p-5 transition-all hover:shadow-card-hover',
        isActioned && 'opacity-60'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-healthcare-text truncate">
            {isAr ? suggestion.campaignNameAr : suggestion.campaignName}
          </h3>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', typeInfo.color)}>
              {isAr ? typeInfo.ar : typeInfo.en}
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <span className={cn('w-2 h-2 rounded-full', priorityInfo.dot)} />
              {isAr ? priorityInfo.ar : priorityInfo.en}
            </span>
          </div>
        </div>
        {/* Channel icons */}
        <div className="flex items-center gap-1.5">
          {suggestion.channel.includes('whatsapp') && (
            <span className="p-1.5 rounded-lg bg-green-50" title="WhatsApp">
              <MessageSquare className="h-4 w-4 text-green-600" />
            </span>
          )}
          {suggestion.channel.includes('sms') && (
            <span className="p-1.5 rounded-lg bg-blue-50" title="SMS">
              <Smartphone className="h-4 w-4 text-blue-600" />
            </span>
          )}
        </div>
      </div>

      {/* Metrics row */}
      <div className="flex items-center gap-4 mb-3 text-sm">
        <span className="flex items-center gap-1 text-gray-600">
          <Users className="h-3.5 w-3.5" />
          {(suggestion.patientCount ?? 0).toLocaleString()} {isAr ? 'مريض' : 'patients'}
        </span>
        <span className="flex items-center gap-1 text-gray-500">
          <Sparkles className="h-3.5 w-3.5" />
          {Math.round(suggestion.confidenceScore * 100)}%
        </span>
      </div>

      {/* Confidence bar */}
      <div className="w-full h-1.5 bg-gray-100 rounded-full mb-4">
        <div
          className="h-full rounded-full bg-primary-400 transition-all"
          style={{ width: `${Math.round(suggestion.confidenceScore * 100)}%` }}
        />
      </div>

      {/* AI Reasoning (expandable) */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 mb-3 transition-colors"
      >
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {isAr ? 'تحليل الذكاء الاصطناعي' : 'AI Reasoning'}
      </button>

      {expanded && (
        <div className="mb-4 space-y-3 animate-fade-in">
          <p className="text-xs text-gray-600 leading-relaxed bg-gray-50 rounded-lg p-3">
            {isAr ? suggestion.reasoningAr : suggestion.reasoning}
          </p>

          {/* Message preview tabs */}
          <div>
            <div className="flex border-b border-gray-200 mb-2">
              <button
                onClick={() => setMessageTab('ar')}
                className={cn(
                  'text-xs px-3 py-1.5 -mb-px border-b-2 transition-colors',
                  messageTab === 'ar'
                    ? 'border-primary-500 text-primary-700 font-medium'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                )}
              >
                عربي
              </button>
              <button
                onClick={() => setMessageTab('en')}
                className={cn(
                  'text-xs px-3 py-1.5 -mb-px border-b-2 transition-colors',
                  messageTab === 'en'
                    ? 'border-primary-500 text-primary-700 font-medium'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                )}
              >
                English
              </button>
            </div>
            <div
              className="text-xs text-gray-700 bg-gray-50 rounded-lg p-3 leading-relaxed whitespace-pre-wrap"
              dir={messageTab === 'ar' ? 'rtl' : 'ltr'}
            >
              {messageTab === 'ar' ? suggestion.messageScriptAr : suggestion.messageScriptEn}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      {!isActioned && (
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
          <button
            onClick={() => onApprove(suggestion)}
            className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg py-2 transition-colors"
          >
            <Check className="h-4 w-4" />
            {isAr ? 'موافقة' : 'Approve'}
          </button>
          <button
            onClick={() => onEdit(suggestion)}
            className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg py-2 transition-colors"
          >
            <Pencil className="h-4 w-4" />
            {isAr ? 'تعديل' : 'Edit'}
          </button>
          <button
            onClick={() => onSkip(suggestion)}
            className="flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg py-2 px-3 transition-colors"
          >
            <SkipForward className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Status indicator for actioned cards */}
      {isActioned && (
        <div className="pt-2 border-t border-gray-100">
          <span
            className={cn(
              'text-xs font-medium px-2 py-1 rounded-full',
              suggestion.status === 'approved'
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-500'
            )}
          >
            {suggestion.status === 'approved'
              ? isAr ? 'تمت الموافقة' : 'Approved'
              : isAr ? 'تم التخطي' : 'Skipped'}
          </span>
        </div>
      )}
    </div>
  )
}
