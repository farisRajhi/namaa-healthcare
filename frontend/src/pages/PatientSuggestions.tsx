import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { RefreshCw } from 'lucide-react'
import { usePatientSuggestions } from '../hooks/usePatientSuggestions'
import SuggestionStatsBar from '../components/suggestions/SuggestionStatsBar'
import SuggestionList from '../components/suggestions/SuggestionList'

export default function PatientSuggestions() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { user } = useAuth()
  const orgId = user?.org?.id || ''

  const {
    suggestions,
    stats,
    isLoading,
    generate,
    isGenerating,
    send,
    isSending,
    dismiss,
  } = usePatientSuggestions(orgId)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading text-healthcare-text">
            {isAr ? 'اقتراحات المتابعة' : 'Patient Suggestions'}
          </h1>
          <p className="text-sm text-gray-500 mt-1 max-w-md">
            {isAr
              ? 'مرضى يحتاجون متابعة بناءً على مواعيد خدماتهم — أرسل تذكير أو عرض لكل مريض'
              : 'Patients due for services based on their visit history — send a reminder or offer to each one'}
          </p>
        </div>
        <button
          onClick={() => generate()}
          disabled={isGenerating}
          className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 active:bg-primary-700 disabled:opacity-50 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 min-h-[44px] w-full sm:w-auto"
        >
          <RefreshCw size={16} className={isGenerating ? 'animate-spin' : ''} />
          {isAr ? 'تحديث الاقتراحات' : 'Refresh Suggestions'}
        </button>
      </div>

      {/* Stats */}
      <SuggestionStatsBar stats={stats} isAr={isAr} />

      {/* Suggestion List */}
      <SuggestionList
        suggestions={suggestions}
        isLoading={isLoading}
        isAr={isAr}
        onSend={(id, msg) => send({ suggestionId: id, messageAr: msg })}
        onDismiss={dismiss}
        isSending={isSending}
      />
    </div>
  )
}
