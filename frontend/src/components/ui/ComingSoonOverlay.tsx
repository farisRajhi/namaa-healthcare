import { useTranslation } from 'react-i18next'
import { Clock } from 'lucide-react'

interface ComingSoonOverlayProps {
  children: React.ReactNode
  label?: string
  className?: string
}

export default function ComingSoonOverlay({ children, label, className = '' }: ComingSoonOverlayProps) {
  const { t } = useTranslation()

  return (
    <div className={`relative ${className}`}>
      <div className="pointer-events-none select-none opacity-40">
        {children}
      </div>
      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl">
        <span className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm">
          <Clock className="h-3 w-3" />
          {label || t('common.comingSoon')}
        </span>
      </div>
    </div>
  )
}
