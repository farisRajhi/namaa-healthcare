import { MessageCircleQuestion, Plus, Trash2 } from 'lucide-react'
import InstructionCard from './InstructionCard'
import type { FaqOverrideItem } from '../types'

interface FaqOverridesCardProps {
  overrides?: FaqOverrideItem[]
  onChange: (overrides: FaqOverrideItem[]) => void
}

export default function FaqOverridesCard({ overrides, onChange }: FaqOverridesCardProps) {
  const items = overrides || []

  const addPair = () => {
    onChange([...items, { id: `faq-${Date.now()}`, question: '', answer: '' }])
  }

  const updatePair = (index: number, field: 'question' | 'answer', value: string) => {
    const updated = [...items]
    updated[index] = { ...updated[index], [field]: value }
    onChange(updated)
  }

  const removePair = (index: number) => {
    onChange(items.filter((_, i) => i !== index))
  }

  return (
    <InstructionCard
      icon={<MessageCircleQuestion className="w-5 h-5" />}
      title="إجابات مخصصة"
      subtitle="إجابات محددة لأسئلة شائعة"
      color="#3b82f6"
    >
      <div className="space-y-3">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="relative bg-gray-50 rounded-lg p-3 space-y-2 group border border-gray-100"
          >
            <button
              onClick={() => removePair(index)}
              className="absolute top-2 start-2 p-1 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1">
                عندما يسأل المريض عن:
              </label>
              <input
                type="text"
                className="field-input bg-white"
                dir="rtl"
                placeholder="مثال: أوقات العمل"
                value={item.question}
                onChange={(e) => updatePair(index, 'question', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1">
                أجب بـ:
              </label>
              <textarea
                className="field-textarea bg-white"
                rows={2}
                dir="rtl"
                placeholder="مثال: نعمل من الأحد إلى الخميس، من الساعة 8 صباحاً حتى 10 مساءً"
                value={item.answer}
                onChange={(e) => updatePair(index, 'answer', e.target.value)}
              />
            </div>
          </div>
        ))}

        <button
          onClick={addPair}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors px-1"
        >
          <Plus className="w-3.5 h-3.5" />
          إضافة سؤال وجواب
        </button>

        {items.length === 0 && (
          <p className="text-[11px] text-gray-400 py-2">
            أضف أسئلة شائعة مع إجابات محددة، مثل أوقات العمل أو طرق الدفع المقبولة
          </p>
        )}
      </div>
    </InstructionCard>
  )
}
