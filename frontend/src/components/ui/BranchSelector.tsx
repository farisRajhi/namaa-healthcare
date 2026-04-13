/**
 * BranchSelector – Dropdown to switch between clinic branches.
 * Appears in the dashboard header when the org has multiple branches.
 */

import { Building2, ChevronDown } from 'lucide-react'
import { useBranch } from '../../context/BranchContext'
import { useState, useRef, useEffect } from 'react'
import { cn } from '../../lib/utils'

export default function BranchSelector() {
  const { branches, selectedBranch, setSelectedBranchId, loading } = useBranch()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Don't render if no branches defined
  if (!loading && branches.length === 0) return null

  const label = selectedBranch?.name ?? 'كل الفروع'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium',
          'border-gray-200 bg-white hover:bg-gray-50 text-gray-700',
          'transition-colors duration-150',
        )}
      >
        <Building2 className="h-4 w-4 text-primary-600" />
        <span className="max-w-[140px] truncate">{label}</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 right-0 z-50 min-w-[180px] rounded-xl border border-gray-100 bg-white shadow-lg py-1">
          {/* "All branches" option */}
          <button
            onClick={() => { setSelectedBranchId(null); setOpen(false) }}
            className={cn(
              'w-full text-right px-4 py-2 text-sm hover:bg-gray-50 transition-colors',
              !selectedBranch && 'font-semibold text-primary-600',
            )}
          >
            كل الفروع
          </button>

          <div className="my-1 border-t border-gray-100" />

          {branches.map((b) => (
            <button
              key={b.branchId}
              onClick={() => { setSelectedBranchId(b.branchId); setOpen(false) }}
              className={cn(
                'w-full text-right px-4 py-2 text-sm hover:bg-gray-50 transition-colors',
                selectedBranch?.branchId === b.branchId && 'font-semibold text-primary-600',
              )}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
