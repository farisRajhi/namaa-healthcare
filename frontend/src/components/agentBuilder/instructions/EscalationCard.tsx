import { UserRoundX, Plus, Trash2 } from 'lucide-react'
import InstructionCard from './InstructionCard'

interface EscalationCardProps {
  triggers?: string[]
  onChange: (triggers: string[]) => void
}

const SUGGESTIONS = [
  'عندما يذكر المريض أعراض طارئة (ألم صدر، صعوبة تنفس)',
  'عندما يطلب المريض التحدث مع شخص حقيقي',
  'عندما يكون المريض غاضباً أو غير راضٍ',
  'عندما يسأل عن تفاصيل الفاتورة أو التأمين',
]

export default function EscalationCard({ triggers, onChange }: EscalationCardProps) {
  const items = triggers || []

  const addTrigger = (value = '') => {
    onChange([...items, value])
  }

  const updateTrigger = (index: number, value: string) => {
    const updated = [...items]
    updated[index] = value
    onChange(updated)
  }

  const removeTrigger = (index: number) => {
    onChange(items.filter((_, i) => i !== index))
  }

  const unusedSuggestions = SUGGESTIONS.filter((s) => !items.includes(s))

  return (
    <InstructionCard
      icon={<UserRoundX className="w-5 h-5" />}
      title="حالات التحويل للموظف"
      subtitle="متى يجب تحويل المحادثة لموظف بشري"
      color="#ef4444"
    >
      <div className="space-y-2">
        {items.map((trigger, index) => (
          <div key={index} className="flex items-start gap-2 group">
            <div className="w-2 h-2 rounded-full bg-red-400 mt-3 flex-shrink-0" />
            <input
              type="text"
              className="field-input flex-1"
              dir="rtl"
              placeholder="صف الحالة التي تتطلب تحويل لموظف..."
              value={trigger}
              onChange={(e) => updateTrigger(index, e.target.value)}
            />
            <button
              onClick={() => removeTrigger(index)}
              className="p-2 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        <button
          onClick={() => addTrigger()}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors mt-2 px-1"
        >
          <Plus className="w-3.5 h-3.5" />
          إضافة حالة
        </button>

        {unusedSuggestions.length > 0 && items.length < 2 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-[11px] text-gray-400 mb-2">اقتراحات:</p>
            <div className="flex flex-wrap gap-1.5">
              {unusedSuggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => addTrigger(s)}
                  className="text-[10px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-500 hover:border-red-200 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  + {s.length > 35 ? s.substring(0, 35) + '...' : s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </InstructionCard>
  )
}
