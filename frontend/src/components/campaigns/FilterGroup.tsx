import { useState, ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

interface FilterGroupProps {
  title: string
  titleAr: string
  isAr?: boolean
  defaultOpen?: boolean
  children: ReactNode
}

export default function FilterGroup({
  title,
  titleAr,
  isAr,
  defaultOpen = false,
  children,
}: FilterGroupProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-sm font-medium text-gray-700">
          {isAr ? titleAr : title}
        </span>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-gray-500 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div className="p-4 space-y-4 bg-white">{children}</div>
      )}
    </div>
  )
}
