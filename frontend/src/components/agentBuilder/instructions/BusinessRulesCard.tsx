import { ShieldCheck, Plus, Trash2, GripVertical } from 'lucide-react'
import InstructionCard from './InstructionCard'

interface BusinessRulesCardProps {
  rules?: string[]
  onChange: (rules: string[]) => void
}

export default function BusinessRulesCard({ rules, onChange }: BusinessRulesCardProps) {
  const items = rules || []

  const addRule = () => {
    onChange([...items, ''])
  }

  const updateRule = (index: number, value: string) => {
    const updated = [...items]
    updated[index] = value
    onChange(updated)
  }

  const removeRule = (index: number) => {
    onChange(items.filter((_, i) => i !== index))
  }

  return (
    <InstructionCard
      icon={<ShieldCheck className="w-5 h-5" />}
      title="قواعد العمل"
      subtitle="قواعد يجب على الذكاء الاصطناعي اتباعها دائماً"
      color="#f97316"
    >
      <div className="space-y-2">
        {items.map((rule, index) => (
          <div key={index} className="flex items-start gap-2 group">
            <GripVertical className="w-4 h-4 text-gray-300 mt-2.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
            <span className="text-xs font-bold text-gray-400 mt-2.5 w-5 flex-shrink-0 text-center">
              {index + 1}
            </span>
            <input
              type="text"
              className="field-input flex-1"
              dir="rtl"
              placeholder="مثال: اطلب دائماً اسم المريض قبل الحجز"
              value={rule}
              onChange={(e) => updateRule(index, e.target.value)}
            />
            <button
              onClick={() => removeRule(index)}
              className="p-2 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        <button
          onClick={addRule}
          className="flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 transition-colors mt-2 px-1"
        >
          <Plus className="w-3.5 h-3.5" />
          إضافة قاعدة
        </button>

        {items.length === 0 && (
          <p className="text-[11px] text-gray-400 py-2">
            أضف قواعد عمل خاصة بعيادتك، مثل: "لا تحجز مواعيد خارج أوقات الدوام" أو "اطلب رقم الهوية دائماً"
          </p>
        )}
      </div>
    </InstructionCard>
  )
}
