import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { cn } from '../../lib/utils'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export default function SearchInput({ value, onChange, placeholder, className }: SearchInputProps) {
  const { t } = useTranslation()
  const resolvedPlaceholder = placeholder ?? t('common.search', { defaultValue: 'Search...' })
  return (
    <div className={cn('relative', className)}>
      <Search className="search-icon" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={resolvedPlaceholder}
        aria-label={resolvedPlaceholder}
        className="search-input"
      />
    </div>
  )
}
