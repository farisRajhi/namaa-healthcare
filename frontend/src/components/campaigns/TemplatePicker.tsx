import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { FileText } from 'lucide-react'
import { cn } from '../../lib/utils'

interface Props {
  orgId: string
  selectedId: string
  onSelect: (template: { id: string; bodyAr: string; bodyEn: string }) => void
  isAr: boolean
}

interface SmsTemplate {
  id: string
  name: string
  bodyAr: string
  bodyEn: string
  channel: string
  isActive: boolean
}

export default function TemplatePicker({ orgId, selectedId, onSelect, isAr }: Props) {
  const { data: templates, isLoading } = useQuery<SmsTemplate[]>({
    queryKey: ['sms-templates-picker', orgId],
    queryFn: async () => {
      const res = await api.get(`/api/sms-templates/${orgId}`)
      const list = res.data?.data || res.data || []
      return (Array.isArray(list) ? list : []).filter(
        (t: any) => t.isActive && (t.channel === 'whatsapp' || t.channel === 'both'),
      )
    },
    enabled: !!orgId,
    staleTime: 60_000,
  })

  if (isLoading) {
    return <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
  }

  if (!templates?.length) {
    return (
      <p className="text-xs text-gray-400 py-2">
        {isAr ? 'لا توجد قوالب متاحة' : 'No templates available'}
      </p>
    )
  }

  return (
    <div>
      <label className="text-sm font-medium text-gray-700 mb-1.5 block">
        {isAr ? 'استخدم قالب جاهز (اختياري)' : 'Use a template (optional)'}
      </label>
      <div className="space-y-2 max-h-40 overflow-y-auto">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect({ id: t.id, bodyAr: t.bodyAr, bodyEn: t.bodyEn })}
            className={cn(
              'w-full flex items-center gap-2 p-2.5 rounded-lg border text-start transition-colors',
              selectedId === t.id
                ? 'border-healthcare-primary bg-healthcare-primary/5'
                : 'border-gray-200 hover:border-gray-300',
            )}
          >
            <FileText className="h-4 w-4 text-gray-400 shrink-0" />
            <span className="text-sm text-gray-700 truncate">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
