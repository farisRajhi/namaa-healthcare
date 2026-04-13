import { Sparkles, Plus, Trash2 } from 'lucide-react'
import InstructionCard from './InstructionCard'

interface CustomInstructionsCardProps {
  instructions?: string[]
  onChange: (instructions: string[]) => void
}

export default function CustomInstructionsCard({ instructions, onChange }: CustomInstructionsCardProps) {
  const items = instructions || []

  const addInstruction = () => {
    onChange([...items, ''])
  }

  const updateInstruction = (index: number, value: string) => {
    const updated = [...items]
    updated[index] = value
    onChange(updated)
  }

  const removeInstruction = (index: number) => {
    onChange(items.filter((_, i) => i !== index))
  }

  return (
    <InstructionCard
      icon={<Sparkles className="w-5 h-5" />}
      title="تعليمات إضافية"
      subtitle="تعليمات حرة لتخصيص سلوك الذكاء الاصطناعي"
      color="#14b8a6"
    >
      <div className="space-y-2">
        {items.map((instruction, index) => (
          <div key={index} className="flex items-start gap-2 group">
            <div className="w-1.5 h-1.5 rounded-full bg-primary-400 mt-3 flex-shrink-0" />
            <textarea
              className="field-textarea flex-1"
              rows={2}
              dir="rtl"
              placeholder="مثال: اذكر دائماً إمكانية الحجز عبر الواتساب"
              value={instruction}
              onChange={(e) => updateInstruction(index, e.target.value)}
            />
            <button
              onClick={() => removeInstruction(index)}
              className="p-2 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        <button
          onClick={addInstruction}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors mt-2 px-1"
        >
          <Plus className="w-3.5 h-3.5" />
          إضافة تعليمات
        </button>

        {items.length === 0 && (
          <p className="text-[11px] text-gray-400 py-2">
            أضف أي تعليمات إضافية تريد أن يتبعها الذكاء الاصطناعي
          </p>
        )}
      </div>
    </InstructionCard>
  )
}
