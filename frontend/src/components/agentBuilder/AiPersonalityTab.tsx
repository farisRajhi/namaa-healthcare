import { Brain } from 'lucide-react'
import type { LLMInstructionsSettings, FaqOverrideItem } from './types'
import {
  GreetingCard,
  ToneCard,
  BusinessRulesCard,
  EscalationCard,
  BookingCard,
  FaqOverridesCard,
  CustomInstructionsCard,
} from './instructions'

interface AiPersonalityTabProps {
  settings: LLMInstructionsSettings
  onChange: (settings: LLMInstructionsSettings) => void
}

export default function AiPersonalityTab({ settings, onChange }: AiPersonalityTabProps) {
  const update = (patch: Partial<LLMInstructionsSettings>) => {
    onChange({ ...settings, ...patch })
  }

  return (
    <div className="flex-1 overflow-y-auto" dir="rtl">
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
            <Brain className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-800">شخصية الذكاء الاصطناعي</h2>
            <p className="text-xs text-gray-500">خصّص كيف يتعامل الذكاء الاصطناعي مع المرضى</p>
          </div>
        </div>

        {/* Instruction Cards */}
        <GreetingCard
          greeting={settings.greeting}
          onChange={(greeting) => update({ greeting })}
        />

        <ToneCard
          tone={settings.tone}
          tonePreset={settings.tonePreset}
          onChange={(tone, tonePreset) => update({ tone, tonePreset })}
        />

        <BusinessRulesCard
          rules={settings.businessRules}
          onChange={(businessRules) => update({ businessRules })}
        />

        <EscalationCard
          triggers={settings.escalationTriggers}
          onChange={(escalationTriggers) => update({ escalationTriggers })}
        />

        <BookingCard
          instructions={settings.bookingInstructions}
          onChange={(bookingInstructions) => update({ bookingInstructions })}
        />

        <FaqOverridesCard
          overrides={settings.faqOverrides as FaqOverrideItem[] | undefined}
          onChange={(faqOverrides) => update({ faqOverrides })}
        />

        <CustomInstructionsCard
          instructions={settings.customInstructions}
          onChange={(customInstructions) => update({ customInstructions })}
        />

        {/* Bottom spacer */}
        <div className="h-6" />
      </div>
    </div>
  )
}
