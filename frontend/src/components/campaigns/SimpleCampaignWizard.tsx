import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../ui/Toast'
import { useCampaignCreate } from '../../hooks/useCampaignCreate'
import { useAudiencePreview } from '../../hooks/useAudiencePreview'
import { api } from '../../lib/api'
import { cn } from '../../lib/utils'
import {
  ArrowRight, ArrowLeft, X, Send, Clock, Loader2, CheckCircle,
} from 'lucide-react'
import CampaignTypeSelector from './CampaignTypeSelector'
import TemplatePicker from './TemplatePicker'
import AudiencePresetCard from './AudiencePresetCard'
import AudiencePreviewBadge from './AudiencePreviewBadge'
import MessageComposer from '../marketing/MessageComposer'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

interface TargetPreset {
  key: string
  labelAr: string
  labelEn: string
  description: string
  descriptionAr: string
  icon: string
  color: string
  filter: Record<string, any>
}

const DRAFT_KEY = 'tawafud_simple_campaign_draft'

const typeNameMap: Record<string, { en: string; ar: string }> = {
  recall:       { en: 'Recall', ar: 'استدعاء' },
  follow_up:    { en: 'Follow-up', ar: 'متابعة' },
  reminder:     { en: 'Reminder', ar: 'تذكير' },
  promotional:  { en: 'Promotional', ar: 'ترويجي' },
  announcement: { en: 'Announcement', ar: 'إعلان' },
}

const MSG_VARIABLES = [
  { key: '{patient_name}', ar: '{اسم_المريض}', desc: 'Patient name' },
  { key: '{clinic_name}', ar: '{اسم_العيادة}', desc: 'Clinic name' },
  { key: '{date}', ar: '{التاريخ}', desc: 'Date' },
]

export default function SimpleCampaignWizard({ onClose, onSuccess }: Props) {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { user } = useAuth()
  const orgId = user?.org?.id || ''
  const { addToast } = useToast()
  const Arrow = isAr ? ArrowLeft : ArrowRight
  const BackArrow = isAr ? ArrowRight : ArrowLeft

  // Draft from localStorage
  const saved = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') } catch { return {} }
  }, [])

  const [step, setStep] = useState(0)
  const [type, setType] = useState(saved.type || '')
  const [templateId, setTemplateId] = useState(saved.templateId || '')
  const [scriptAr, setScriptAr] = useState(saved.scriptAr || '')
  const [scriptEn, setScriptEn] = useState(saved.scriptEn || '')
  const [presetKey, setPresetKey] = useState(saved.presetKey || '')
  const [sendNow, setSendNow] = useState(true)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('09:00')

  // Save draft on changes
  const saveDraft = () => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ type, templateId, scriptAr, scriptEn, presetKey }))
    } catch { /* */ }
  }

  // Fetch presets
  const { data: presets } = useQuery<TargetPreset[]>({
    queryKey: ['audience-presets', orgId],
    queryFn: async () => {
      const res = await api.get(`/api/audience/${orgId}/presets`)
      return res.data?.presets || res.data || []
    },
    enabled: !!orgId,
    staleTime: 60_000,
  })

  // Current preset filter for preview
  const currentFilter = useMemo(() => {
    if (!presetKey || !presets) return {}
    return presets.find((p) => p.key === presetKey)?.filter || {}
  }, [presetKey, presets])

  const preview = useAudiencePreview(orgId, currentFilter, 'whatsapp')

  // Auto-generated campaign name
  const autoName = useMemo(() => {
    const typeName = typeNameMap[type]?.[isAr ? 'ar' : 'en'] || type
    const date = new Date().toLocaleDateString(isAr ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric' })
    return `${typeName} — ${date}`
  }, [type, isAr])

  // Campaign create mutation
  const createMutation = useCampaignCreate({
    onSuccess: () => {
      localStorage.removeItem(DRAFT_KEY)
      addToast({ type: 'success', title: isAr ? 'تم إنشاء الحملة' : 'Campaign created' })
      onSuccess()
    },
    onError: (msg) => {
      addToast({ type: 'error', title: msg })
    },
  })

  // Validation per step
  const canNext = step === 0
    ? type && (scriptAr || scriptEn)
    : step === 1
      ? !!presetKey
      : true

  const handleSubmit = () => {
    const startDate = sendNow ? new Date().toISOString() : `${scheduleDate}T${scheduleTime}:00`
    createMutation.mutate({
      data: {
        name: autoName,
        type,
        targetFilter: currentFilter,
        channelSequence: ['whatsapp'],
        scriptAr,
        scriptEn,
        startDate,
      },
      sendNow,
    })
  }

  const steps = [
    { en: 'Message', ar: 'الرسالة' },
    { en: 'Audience', ar: 'الجمهور' },
    { en: 'Send', ar: 'الإرسال' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold font-heading text-healthcare-text">
            {isAr ? 'حملة جديدة' : 'New Campaign'}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">{autoName}</p>
        </div>
        <button onClick={onClose} className="btn-icon btn-ghost p-2">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              i === step
                ? 'bg-healthcare-primary text-white'
                : i < step
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500',
            )}>
              {i < step ? <CheckCircle className="h-3 w-3" /> : <span>{i + 1}</span>}
              <span>{isAr ? s.ar : s.en}</span>
            </div>
            {i < steps.length - 1 && (
              <div className="w-8 h-px bg-gray-300" />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-3">
                {isAr ? 'نوع الحملة' : 'Campaign Type'}
              </h3>
              <CampaignTypeSelector value={type} onChange={setType} isAr={isAr} />
            </div>

            <div>
              <TemplatePicker
                orgId={orgId}
                selectedId={templateId}
                onSelect={(t) => {
                  setTemplateId(t.id)
                  setScriptAr(t.bodyAr)
                  setScriptEn(t.bodyEn)
                }}
                isAr={isAr}
              />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-3">
                {isAr ? 'نص الرسالة' : 'Message Content'}
              </h3>
              <MessageComposer
                bodyAr={scriptAr}
                bodyEn={scriptEn}
                onChangeAr={setScriptAr}
                onChangeEn={setScriptEn}
                variables={MSG_VARIABLES}
                channel="whatsapp"
                isAr={isAr}
                showPreview={true}
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">
                {isAr ? 'اختر الجمهور المستهدف' : 'Select Target Audience'}
              </h3>
              {presetKey && (
                <AudiencePreviewBadge
                  totalMatching={preview.data?.totalMatching || 0}
                  withConsent={preview.data?.withConsent || 0}
                  isLoading={preview.isLoading}
                  isAr={isAr}
                  compact
                />
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {presets?.map((p) => (
                <AudiencePresetCard
                  key={p.key}
                  presetKey={p.key}
                  label={p.labelEn}
                  labelAr={p.labelAr}
                  description={p.description}
                  descriptionAr={p.descriptionAr}
                  icon={p.icon}
                  color={p.color}
                  count={null}
                  isSelected={presetKey === p.key}
                  isAr={isAr}
                  onClick={() => setPresetKey(p.key)}
                />
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h3 className="text-sm font-semibold text-gray-800">
              {isAr ? 'متى ترسل؟' : 'When to send?'}
            </h3>

            {/* Send now / Schedule */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setSendNow(true)}
                className={cn(
                  'flex-1 flex items-center gap-3 p-4 rounded-xl border-2 transition-all',
                  sendNow
                    ? 'border-healthcare-primary bg-healthcare-primary/5'
                    : 'border-gray-200 hover:border-gray-300',
                )}
              >
                <Send className={cn('h-5 w-5', sendNow ? 'text-healthcare-primary' : 'text-gray-400')} />
                <div className="text-start">
                  <p className={cn('text-sm font-medium', sendNow ? 'text-healthcare-primary' : 'text-gray-700')}>
                    {isAr ? 'إرسال الآن' : 'Send Now'}
                  </p>
                  <p className="text-xs text-gray-500">{isAr ? 'فوراً' : 'Immediately'}</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setSendNow(false)}
                className={cn(
                  'flex-1 flex items-center gap-3 p-4 rounded-xl border-2 transition-all',
                  !sendNow
                    ? 'border-healthcare-primary bg-healthcare-primary/5'
                    : 'border-gray-200 hover:border-gray-300',
                )}
              >
                <Clock className={cn('h-5 w-5', !sendNow ? 'text-healthcare-primary' : 'text-gray-400')} />
                <div className="text-start">
                  <p className={cn('text-sm font-medium', !sendNow ? 'text-healthcare-primary' : 'text-gray-700')}>
                    {isAr ? 'جدولة' : 'Schedule'}
                  </p>
                  <p className="text-xs text-gray-500">{isAr ? 'حدد الوقت' : 'Pick a time'}</p>
                </div>
              </button>
            </div>

            {!sendNow && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-600 mb-1 block">
                    {isAr ? 'التاريخ' : 'Date'}
                  </label>
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="input w-full text-sm"
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div className="w-32">
                  <label className="text-xs font-medium text-gray-600 mb-1 block">
                    {isAr ? 'الوقت' : 'Time'}
                  </label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="input w-full text-sm"
                  />
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                {isAr ? 'ملخص' : 'Summary'}
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-gray-500">{isAr ? 'النوع' : 'Type'}</span>
                <span className="font-medium text-gray-800">{typeNameMap[type]?.[isAr ? 'ar' : 'en'] || type}</span>

                <span className="text-gray-500">{isAr ? 'الجمهور' : 'Audience'}</span>
                <span className="font-medium text-gray-800">
                  {presets?.find((p) => p.key === presetKey)?.[isAr ? 'labelAr' : 'labelEn'] || presetKey}
                </span>

                <span className="text-gray-500">{isAr ? 'القناة' : 'Channel'}</span>
                <span className="font-medium text-gray-800">WhatsApp</span>

                <span className="text-gray-500">{isAr ? 'الإرسال' : 'Send'}</span>
                <span className="font-medium text-gray-800">
                  {sendNow ? (isAr ? 'فوراً' : 'Now') : `${scheduleDate} ${scheduleTime}`}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            if (step === 0) { onClose(); return }
            setStep(step - 1)
          }}
          className="btn-ghost flex items-center gap-2"
        >
          <BackArrow className="h-4 w-4" />
          {step === 0 ? (isAr ? 'إلغاء' : 'Cancel') : (isAr ? 'السابق' : 'Back')}
        </button>

        {step < 2 ? (
          <button
            onClick={() => { saveDraft(); setStep(step + 1) }}
            disabled={!canNext}
            className="btn-primary flex items-center gap-2"
          >
            {isAr ? 'التالي' : 'Next'}
            <Arrow className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            className="btn-primary flex items-center gap-2 px-6"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {sendNow ? (isAr ? 'إرسال الآن' : 'Send Now') : (isAr ? 'جدولة' : 'Schedule')}
          </button>
        )}
      </div>
    </div>
  )
}
