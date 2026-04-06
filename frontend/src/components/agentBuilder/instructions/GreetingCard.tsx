import { Hand } from 'lucide-react'
import InstructionCard from './InstructionCard'

interface GreetingCardProps {
  greeting?: { ar: string; en: string }
  onChange: (greeting: { ar: string; en: string }) => void
}

export default function GreetingCard({ greeting, onChange }: GreetingCardProps) {
  const value = greeting || { ar: '', en: '' }

  return (
    <InstructionCard
      icon={<Hand className="w-5 h-5" />}
      title="الترحيب"
      subtitle="كيف يرحب الذكاء الاصطناعي بالمرضى"
      color="#22c55e"
      defaultOpen
    >
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            الترحيب بالعربية
          </label>
          <textarea
            className="field-textarea"
            rows={2}
            dir="rtl"
            placeholder="مرحباً بكم في عيادتنا! كيف أقدر أساعدك اليوم؟"
            value={value.ar}
            onChange={(e) => onChange({ ...value, ar: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            Greeting in English
          </label>
          <textarea
            className="field-textarea"
            rows={2}
            dir="ltr"
            placeholder="Welcome to our clinic! How can I help you today?"
            value={value.en}
            onChange={(e) => onChange({ ...value, en: e.target.value })}
          />
        </div>
        <p className="text-[11px] text-gray-400">
          سيستخدم الذكاء الاصطناعي الترحيب المناسب حسب لغة المريض
        </p>
      </div>
    </InstructionCard>
  )
}
