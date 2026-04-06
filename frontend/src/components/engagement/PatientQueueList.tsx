import { useState, useMemo } from 'react'
import { Users } from 'lucide-react'
import { cn } from '../../lib/utils'
import SearchInput from '../ui/SearchInput'
import EmptyState from '../ui/EmptyState'
import PatientQueueRow from './PatientQueueRow'
import type { RankedPatient } from '../../hooks/usePatientEngagementQueue'

interface Props {
  patients: RankedPatient[]
  isLoading: boolean
  isAr: boolean
}

type FilterLevel = 'all' | 'critical' | 'high' | 'medium'

const filters: { key: FilterLevel; en: string; ar: string }[] = [
  { key: 'all', en: 'All', ar: 'الكل' },
  { key: 'critical', en: 'Critical', ar: 'حرج' },
  { key: 'high', en: 'High', ar: 'مرتفع' },
  { key: 'medium', en: 'Medium', ar: 'متوسط' },
]

export default function PatientQueueList({ patients, isLoading, isAr }: Props) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterLevel>('all')

  const filtered = useMemo(() => {
    let list = patients
    if (filter !== 'all') {
      list = list.filter((p) => p.priority === filter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((p) => p.patientName.toLowerCase().includes(q))
    }
    return list
  }, [patients, filter, search])

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                filter === f.key
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {isAr ? f.ar : f.en}
              {f.key !== 'all' && (
                <span className="ms-1 text-[10px] text-gray-400">
                  {patients.filter((p) => p.priority === f.key).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={isAr ? 'بحث بالاسم...' : 'Search by name...'}
          className="w-full sm:w-64"
        />
      </div>

      {/* Patient list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={isAr ? 'لا يوجد مرضى' : 'No patients'}
          description={
            isAr
              ? 'جميع المرضى في حالة جيدة. تحقق لاحقاً.'
              : 'All patients are up to date. Check back later.'
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((patient, idx) => (
            <PatientQueueRow
              key={patient.patientId}
              patient={patient}
              rank={idx + 1}
              isAr={isAr}
            />
          ))}
        </div>
      )}
    </div>
  )
}
