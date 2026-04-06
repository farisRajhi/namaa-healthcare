import { Palette } from 'lucide-react'
import InstructionCard from './InstructionCard'

interface ToneCardProps {
  tone?: string
  tonePreset?: 'formal' | 'friendly' | 'professional' | 'custom'
  onChange: (tone: string, preset: 'formal' | 'friendly' | 'professional' | 'custom') => void
}

const PRESETS: { key: 'formal' | 'friendly' | 'professional'; label: string; description: string; prompt: string }[] = [
  {
    key: 'formal',
    label: 'رسمي',
    description: 'أسلوب رسمي ومهذب',
    prompt: 'استخدم أسلوباً رسمياً ومهذباً. تحدث بصيغة الجمع (نحن). تجنب العبارات العامية. كن موجزاً ودقيقاً في الإجابات.',
  },
  {
    key: 'friendly',
    label: 'ودود',
    description: 'أسلوب دافئ وقريب',
    prompt: 'كن ودوداً ودافئاً مع المرضى. استخدم أسلوباً قريباً ومريحاً. ابتسم في كلامك واجعل المريض يشعر بالراحة والاطمئنان.',
  },
  {
    key: 'professional',
    label: 'مهني',
    description: 'متوازن بين الرسمية والودّ',
    prompt: 'كن مهنياً ومتوازناً. اجمع بين الاحترافية والودّ. استخدم لغة واضحة ومباشرة مع لمسة من الاهتمام الشخصي.',
  },
]

export default function ToneCard({ tone, tonePreset, onChange }: ToneCardProps) {
  const activePreset = tonePreset || 'professional'
  const isCustom = activePreset === 'custom'

  const handlePresetClick = (preset: typeof PRESETS[number]) => {
    onChange(preset.prompt, preset.key)
  }

  return (
    <InstructionCard
      icon={<Palette className="w-5 h-5" />}
      title="أسلوب الرد"
      subtitle="شخصية ونبرة الذكاء الاصطناعي"
      color="#8b5cf6"
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.key}
              onClick={() => handlePresetClick(preset)}
              className={`flex-1 px-3 py-2.5 rounded-lg border text-xs font-semibold transition-all ${
                activePreset === preset.key
                  ? 'border-violet-300 bg-violet-50 text-violet-700 shadow-sm'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div>{preset.label}</div>
              <div className="font-normal text-[10px] mt-0.5 opacity-70">{preset.description}</div>
            </button>
          ))}
          <button
            onClick={() => onChange(tone || '', 'custom')}
            className={`flex-1 px-3 py-2.5 rounded-lg border text-xs font-semibold transition-all ${
              isCustom
                ? 'border-violet-300 bg-violet-50 text-violet-700 shadow-sm'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <div>مخصص</div>
            <div className="font-normal text-[10px] mt-0.5 opacity-70">أسلوب خاص بك</div>
          </button>
        </div>

        <textarea
          className="field-textarea"
          rows={3}
          dir="rtl"
          placeholder="اكتب تعليمات الأسلوب المخصص هنا..."
          value={tone || ''}
          onChange={(e) => onChange(e.target.value, isCustom ? 'custom' : activePreset)}
          readOnly={!isCustom}
        />
      </div>
    </InstructionCard>
  )
}
