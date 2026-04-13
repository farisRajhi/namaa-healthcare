import { useState } from 'react'
import { Search, Inbox } from 'lucide-react'
import SuggestionCard from './SuggestionCard'
import type { SuggestionCard as SuggestionCardType } from '../../hooks/usePatientSuggestions'

type FilterType = 'all' | 'reminder' | 'offer'

interface Props {
  suggestions: SuggestionCardType[]
  isLoading: boolean
  isAr: boolean
  onSend: (suggestionId: string, messageAr?: string) => void
  onDismiss: (suggestionId: string) => void
  isSending: boolean
}

export default function SuggestionList({ suggestions, isLoading, isAr, onSend, onDismiss, isSending }: Props) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')

  const filtered = suggestions.filter(s => {
    if (filter !== 'all' && s.suggestionType !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return s.patientName.toLowerCase().includes(q) || s.serviceName.toLowerCase().includes(q)
    }
    return true
  })

  const reminderCount = suggestions.filter(s => s.suggestionType === 'reminder').length
  const offerCount = suggestions.filter(s => s.suggestionType === 'offer').length

  const filters: { key: FilterType; label: string; count: number }[] = [
    { key: 'all', label: isAr ? 'الكل' : 'All', count: suggestions.length },
    { key: 'reminder', label: isAr ? 'تذكيرات' : 'Reminders', count: reminderCount },
    { key: 'offer', label: isAr ? 'عروض' : 'Offers', count: offerCount },
  ]

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-7 h-7 bg-gray-200 rounded-full" />
              <div className="h-5 bg-gray-200 rounded-lg w-20" />
              <div className="h-5 bg-gray-100 rounded-lg w-16 ms-auto" />
            </div>
            <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-1/2 mb-4" />
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="h-3 bg-gray-200 rounded w-2/3 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex gap-2" role="tablist" aria-label={isAr ? 'تصفية الاقتراحات' : 'Filter suggestions'}>
          {filters.map(f => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 ${
                filter === f.key
                  ? 'bg-primary-500 text-white shadow-btn'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300'
              }`}
            >
              {f.label}
              <span className={`ms-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                filter === f.key ? 'bg-white/20' : 'bg-gray-200 text-gray-500'
              }`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>
        <div className="relative sm:ms-auto w-full sm:w-auto">
          <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={isAr ? 'بحث بالاسم أو الخدمة...' : 'Search by name or service...'}
            className="w-full sm:w-72 ps-10 pe-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 min-h-[44px]"
            aria-label={isAr ? 'بحث في الاقتراحات' : 'Search suggestions'}
          />
        </div>
      </div>

      {/* Results count */}
      {search && (
        <p className="text-xs text-gray-500">
          {isAr
            ? `${filtered.length} نتيجة`
            : `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`}
        </p>
      )}

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Inbox size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-base font-medium text-gray-500 mb-1">
            {isAr ? 'لا توجد اقتراحات' : 'No suggestions'}
          </p>
          <p className="text-sm text-gray-400">
            {search
              ? (isAr ? 'جرب كلمة بحث مختلفة' : 'Try a different search term')
              : (isAr ? 'اضغط "تحديث الاقتراحات" لتوليد اقتراحات جديدة' : 'Click "Refresh Suggestions" to generate new ones')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((s, i) => (
            <SuggestionCard
              key={s.suggestionId}
              suggestion={s}
              rank={i + 1}
              isAr={isAr}
              onSend={onSend}
              onDismiss={onDismiss}
              isSending={isSending}
            />
          ))}
        </div>
      )}
    </div>
  )
}
