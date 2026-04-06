import { CalendarCheck } from 'lucide-react'
import InstructionCard from './InstructionCard'

interface BookingCardProps {
  instructions?: string
  onChange: (instructions: string) => void
}

export default function BookingCard({ instructions, onChange }: BookingCardProps) {
  return (
    <InstructionCard
      icon={<CalendarCheck className="w-5 h-5" />}
      title="تعليمات الحجز"
      subtitle="كيف يتعامل الذكاء الاصطناعي مع حجز المواعيد"
      color="#0891b2"
    >
      <div className="space-y-3">
        <textarea
          className="field-textarea"
          rows={4}
          dir="rtl"
          placeholder="مثال: اسأل المريض عن القسم المطلوب أولاً، ثم اقترح أقرب موعد متاح. تأكد من رقم الجوال قبل تأكيد الحجز."
          value={instructions || ''}
          onChange={(e) => onChange(e.target.value)}
        />
        <p className="text-[11px] text-gray-400">
          اكتب التعليمات التي يجب أن يتبعها الذكاء الاصطناعي عند حجز المواعيد
        </p>
      </div>
    </InstructionCard>
  )
}
