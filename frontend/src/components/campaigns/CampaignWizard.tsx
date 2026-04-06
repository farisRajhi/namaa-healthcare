import { useState, useRef, useCallback, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import { useToast } from '../ui/Toast'
import { cn } from '../../lib/utils'
import { ArrowRight, ArrowLeft, X, Check, Rocket } from 'lucide-react'
import AudienceBuilder from './AudienceBuilder'
import ABTestEditor, { type ScriptVariant } from './ABTestEditor'
import AudiencePreviewBadge from './AudiencePreviewBadge'
import { useAudiencePreview, PatientFilter } from '../../hooks/useAudiencePreview'
import { typeLabels } from './CampaignList'

interface WizardData {
  name: string
  nameAr: string
  type: string
  targetFilter: PatientFilter
  targetPreset: string | null
  channelSequence: string[]
  scriptAr: string
  scriptEn: string
  abTestEnabled: boolean
  scriptVariants: ScriptVariant[]
  offerId: string | null
  startDate: string
  endDate: string
}

const defaultWizardData: WizardData = {
  name: '',
  nameAr: '',
  type: 'recall',
  targetFilter: {},
  targetPreset: null,
  channelSequence: ['whatsapp'],
  scriptAr: '',
  scriptEn: '',
  abTestEnabled: false,
  scriptVariants: [],
  offerId: null,
  startDate: '',
  endDate: '',
}

interface CampaignWizardProps {
  onClose: () => void
  onSuccess: () => void
}

export default function CampaignWizard({ onClose, onSuccess }: CampaignWizardProps) {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { user } = useAuth()
  const orgId = user?.org?.id || ''
  const { addToast } = useToast()
  const queryClient = useQueryClient()

  const DRAFT_KEY = `campaign-wizard-draft-${orgId}`

  // Restore draft from localStorage
  const [hasDraft, setHasDraft] = useState(false)
  const [step, setStep] = useState(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.step != null) return parsed.step as number
      }
    } catch { /* ignore */ }
    return 0
  })
  const [data, setData] = useState<WizardData>(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.data) return { ...defaultWizardData, ...parsed.data }
      }
    } catch { /* ignore */ }
    return defaultWizardData
  })
  const [draftSaved, setDraftSaved] = useState(false)

  // Check for existing draft on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.data?.name) setHasDraft(true)
      }
    } catch { /* ignore */ }
  }, [DRAFT_KEY])

  // Auto-save to localStorage
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (data.name || data.scriptAr || data.scriptEn || Object.keys(data.targetFilter).length > 0) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ step, data }))
        setDraftSaved(true)
        setTimeout(() => setDraftSaved(false), 2000)
      }
    }, 1000)
    return () => clearTimeout(timeout)
  }, [step, data, DRAFT_KEY])

  const discardDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY)
    setStep(0)
    setData(defaultWizardData)
    setHasDraft(false)
  }, [DRAFT_KEY])

  // Audience preview for the review step
  const { data: preview, isLoading: previewLoading } = useAudiencePreview(
    orgId,
    data.targetFilter,
    data.channelSequence.includes('whatsapp') ? 'whatsapp' : 'sms',
  )

  // Fetch available offers for attachment
  const { data: offersData } = useQuery({
    queryKey: ['offers-active', orgId],
    queryFn: async () => {
      const res = await api.get(`/api/offers/${orgId}?status=active&limit=50`)
      return res.data?.data || res.data || []
    },
    enabled: !!orgId && step === 4,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/api/outbound/campaigns', {
        name: data.name,
        nameAr: data.nameAr || undefined,
        type: data.type,
        targetFilter: data.targetFilter,
        channelSequence: data.channelSequence,
        scriptEn: data.scriptEn || undefined,
        scriptAr: data.scriptAr || undefined,
        scriptVariants: data.abTestEnabled && data.scriptVariants.length > 0 ? data.scriptVariants : undefined,
        startDate: data.startDate || undefined,
        endDate: data.endDate || undefined,
      }),
    onSuccess: () => {
      localStorage.removeItem(DRAFT_KEY)
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      addToast({ type: 'success', title: isAr ? 'تم إنشاء الحملة بنجاح' : 'Campaign created successfully' })
      onSuccess()
    },
    onError: () => {
      addToast({ type: 'error', title: isAr ? 'فشل إنشاء الحملة' : 'Failed to create campaign' })
    },
  })

  const steps = [
    { ar: 'الاسم والنوع', en: 'Name & Type' },
    { ar: 'الجمهور المستهدف', en: 'Smart Targeting' },
    { ar: 'القنوات', en: 'Channels' },
    { ar: 'الرسالة', en: 'Message' },
    { ar: 'العرض', en: 'Offer' },
    { ar: 'مراجعة', en: 'Review' },
  ]

  const canProceed = () => {
    switch (step) {
      case 0: return data.name.trim().length > 0
      case 1: return Object.keys(data.targetFilter).length > 0
      case 2: return data.channelSequence.length > 0
      case 3: return true // scripts are optional
      case 4: return true // offer is optional
      default: return true
    }
  }

  const templateVars = [
    { key: '{patient_name}', ar: '{اسم_المريض}', desc: isAr ? 'اسم المريض' : 'Patient name' },
    { key: '{clinic_name}', ar: '{اسم_العيادة}', desc: isAr ? 'اسم العيادة' : 'Clinic name' },
    { key: '{booking_link}', ar: '{رابط_الحجز}', desc: isAr ? 'رابط الحجز' : 'Booking link' },
  ]

  const scriptArRef = useRef<HTMLTextAreaElement>(null)
  const scriptEnRef = useRef<HTMLTextAreaElement>(null)
  const lastFocusedRef = useRef<'ar' | 'en'>('ar')

  const insertVariable = useCallback((v: { key: string; ar: string }) => {
    const isArFocused = lastFocusedRef.current === 'ar'
    const ref = isArFocused ? scriptArRef.current : scriptEnRef.current
    const varText = isArFocused ? v.ar : v.key
    const field = isArFocused ? 'scriptAr' : 'scriptEn'

    if (ref) {
      const start = ref.selectionStart ?? ref.value.length
      const end = ref.selectionEnd ?? ref.value.length
      const before = ref.value.slice(0, start)
      const after = ref.value.slice(end)
      const newValue = before + varText + after
      setData((prev) => ({ ...prev, [field]: newValue }))
      requestAnimationFrame(() => {
        ref.focus()
        const cursor = start + varText.length
        ref.setSelectionRange(cursor, cursor)
      })
    } else {
      setData((prev) => ({ ...prev, [field]: prev[field] + varText }))
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
      {/* Top Bar */}
      <div className="sticky top-0 z-10 bg-white border-b px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-heading font-semibold text-healthcare-text">
              {isAr ? 'إنشاء حملة جديدة' : 'Create New Campaign'}
            </h2>
            {draftSaved && (
              <span className="text-xs text-green-600 animate-fade-in">
                {isAr ? 'تم حفظ المسودة' : 'Draft saved'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasDraft && (
              <button
                onClick={discardDraft}
                className="text-xs text-red-500 hover:text-red-700 px-2 py-1"
              >
                {isAr ? 'حذف المسودة' : 'Discard draft'}
              </button>
            )}
            <button onClick={() => { onClose() }} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Steps Indicator */}
      <div className="bg-gray-50 border-b px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center gap-1 overflow-x-auto pb-1">
          {steps.map((s, idx) => (
            <div key={idx} className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => idx < step && setStep(idx)}
                disabled={idx > step}
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                  idx < step
                    ? 'bg-green-500 text-white cursor-pointer'
                    : idx === step
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-200 text-gray-400',
                )}
              >
                {idx < step ? <Check className="w-3.5 h-3.5" /> : idx + 1}
              </button>
              <span
                className={cn(
                  'text-xs whitespace-nowrap',
                  idx <= step ? 'text-primary-700 font-medium' : 'text-gray-400',
                )}
              >
                {isAr ? s.ar : s.en}
              </span>
              {idx < steps.length - 1 && <div className="w-6 h-0.5 bg-gray-200 mx-1" />}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Step 0: Name & Type */}
        {step === 0 && (
          <div className="max-w-lg space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {isAr ? 'اسم الحملة (إنجليزي)' : 'Campaign Name'}
              </label>
              <input
                type="text"
                value={data.name}
                onChange={(e) => setData({ ...data, name: e.target.value })}
                className="input"
                placeholder={isAr ? 'مثال: Annual Checkup Reminder' : 'e.g., Annual Checkup Reminder'}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {isAr ? 'اسم الحملة (عربي)' : 'Campaign Name (Arabic)'}
              </label>
              <input
                type="text"
                value={data.nameAr}
                onChange={(e) => setData({ ...data, nameAr: e.target.value })}
                className="input"
                placeholder="تذكير الفحص السنوي"
                dir="rtl"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {isAr ? 'نوع الحملة' : 'Campaign Type'}
              </label>
              <select
                value={data.type}
                onChange={(e) => setData({ ...data, type: e.target.value })}
                className="input"
              >
                {Object.entries(typeLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {isAr ? label.ar : label.en}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {isAr ? 'تاريخ البدء' : 'Start Date'}
                </label>
                <input
                  type="date"
                  value={data.startDate}
                  onChange={(e) => setData({ ...data, startDate: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {isAr ? 'تاريخ الانتهاء' : 'End Date'}
                </label>
                <input
                  type="date"
                  value={data.endDate}
                  onChange={(e) => setData({ ...data, endDate: e.target.value })}
                  className="input"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Smart Targeting */}
        {step === 1 && (
          <AudienceBuilder
            value={data.targetFilter}
            onChange={(filter) => setData({ ...data, targetFilter: filter })}
            selectedPreset={data.targetPreset || undefined}
            onPresetChange={(preset) => setData({ ...data, targetPreset: preset })}
            channel={data.channelSequence.includes('whatsapp') ? 'whatsapp' : 'sms'}
          />
        )}

        {/* Step 2: Channels */}
        {step === 2 && (
          <div className="max-w-lg space-y-4">
            <p className="text-sm text-gray-500">
              {isAr ? 'اختر قنوات التواصل مع المرضى' : 'Select communication channels'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* WhatsApp */}
              <button
                type="button"
                onClick={() => {
                  const has = data.channelSequence.includes('whatsapp')
                  setData({
                    ...data,
                    channelSequence: has
                      ? data.channelSequence.filter((c) => c !== 'whatsapp')
                      : [...data.channelSequence, 'whatsapp'],
                  })
                }}
                className={cn(
                  'p-5 rounded-xl border-2 text-start transition-all',
                  data.channelSequence.includes('whatsapp')
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 hover:border-gray-300',
                )}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">💬</span>
                  <span className="font-semibold">WhatsApp</span>
                </div>
                <p className="text-xs text-gray-500">
                  {isAr ? 'الأكثر فعالية — معدل فتح 90%+' : 'Most effective — 90%+ open rate'}
                </p>
              </button>

              {/* SMS */}
              <button
                type="button"
                onClick={() => {
                  const has = data.channelSequence.includes('sms')
                  setData({
                    ...data,
                    channelSequence: has
                      ? data.channelSequence.filter((c) => c !== 'sms')
                      : [...data.channelSequence, 'sms'],
                  })
                }}
                className={cn(
                  'p-5 rounded-xl border-2 text-start transition-all',
                  data.channelSequence.includes('sms')
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300',
                )}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">📱</span>
                  <span className="font-semibold">SMS</span>
                </div>
                <p className="text-xs text-gray-500">
                  {isAr ? 'رسائل نصية قصيرة — وصول عالمي' : 'Text messages — universal reach'}
                </p>
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Message/Script */}
        {step === 3 && (
          <div className="max-w-2xl space-y-5">
            <p className="text-sm text-gray-500">
              {isAr ? 'اكتب نص الرسالة. استخدم المتغيرات أدناه للتخصيص' : 'Write the campaign message. Use variables below for personalization'}
            </p>

            {/* Template variables helper */}
            <div className="flex flex-wrap gap-2">
              {templateVars.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertVariable(v)}
                  className="px-2.5 py-1 bg-primary-50 border border-primary-200 rounded-md text-xs text-primary-700 hover:bg-primary-100"
                  title={v.desc}
                >
                  {isAr ? v.ar : v.key}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {isAr ? 'النص العربي' : 'Arabic Message'}
              </label>
              <textarea
                ref={scriptArRef}
                rows={5}
                value={data.scriptAr}
                onChange={(e) => setData({ ...data, scriptAr: e.target.value })}
                onFocus={() => { lastFocusedRef.current = 'ar' }}
                className="input w-full"
                dir="rtl"
                placeholder={`مرحباً {اسم_المريض} 👋\n\nحان وقت فحصك الدوري...\n\nللحجز: {رابط_الحجز}`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {isAr ? 'النص الإنجليزي' : 'English Message'}
              </label>
              <textarea
                ref={scriptEnRef}
                rows={5}
                value={data.scriptEn}
                onChange={(e) => setData({ ...data, scriptEn: e.target.value })}
                onFocus={() => { lastFocusedRef.current = 'en' }}
                className="input w-full"
                placeholder={`Hello {patient_name} 👋\n\nIt's time for your checkup...\n\nBook now: {booking_link}`}
              />
            </div>

            {/* A/B Testing */}
            <ABTestEditor
              enabled={data.abTestEnabled}
              onToggle={(enabled) => setData({ ...data, abTestEnabled: enabled })}
              variants={data.scriptVariants}
              onChange={(variants) => setData({ ...data, scriptVariants: variants })}
              isAr={isAr}
            />
          </div>
        )}

        {/* Step 4: Offer Attachment */}
        {step === 4 && (
          <div className="max-w-lg space-y-5">
            <p className="text-sm text-gray-500">
              {isAr
                ? 'اختياري — اربط عرض ترويجي موجود بالحملة'
                : 'Optional — attach an existing promotional offer to this campaign'}
            </p>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setData({ ...data, offerId: null })}
                className={cn(
                  'w-full p-4 rounded-xl border-2 text-start transition-all',
                  !data.offerId
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300',
                )}
              >
                <span className="font-medium">{isAr ? 'بدون عرض' : 'No offer'}</span>
                <p className="text-xs text-gray-500 mt-1">
                  {isAr ? 'إرسال حملة بدون عرض ترويجي' : 'Send campaign without a promotional offer'}
                </p>
              </button>

              {(offersData || []).map((offer: any) => (
                <button
                  key={offer.offerId}
                  type="button"
                  onClick={() => setData({ ...data, offerId: offer.offerId })}
                  className={cn(
                    'w-full p-4 rounded-xl border-2 text-start transition-all',
                    data.offerId === offer.offerId
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {isAr ? (offer.nameAr || offer.name) : offer.name}
                    </span>
                    {offer.promoCode && (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-mono">
                        {offer.promoCode}
                      </span>
                    )}
                  </div>
                  {offer.description && (
                    <p className="text-xs text-gray-500 mt-1">{offer.description}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 5: Review */}
        {step === 5 && (
          <div className="max-w-lg space-y-5">
            <div className="bg-gray-50 rounded-xl p-5 space-y-4">
              <ReviewRow
                label={isAr ? 'الاسم' : 'Name'}
                value={data.name}
              />
              {data.nameAr && (
                <ReviewRow
                  label={isAr ? 'الاسم (عربي)' : 'Name (Arabic)'}
                  value={data.nameAr}
                />
              )}
              <ReviewRow
                label={isAr ? 'النوع' : 'Type'}
                value={isAr ? typeLabels[data.type]?.ar : typeLabels[data.type]?.en}
              />
              <ReviewRow
                label={isAr ? 'القنوات' : 'Channels'}
                value={data.channelSequence.map((c) => c === 'whatsapp' ? 'WhatsApp' : c.toUpperCase()).join(', ')}
              />
              {data.targetPreset && (
                <ReviewRow
                  label={isAr ? 'الشريحة' : 'Segment'}
                  value={data.targetPreset}
                />
              )}
              <ReviewRow
                label={isAr ? 'الفلاتر' : 'Filters'}
                value={Object.keys(data.targetFilter).length > 0
                  ? `${Object.keys(data.targetFilter).length} ${isAr ? 'فلتر نشط' : 'active filters'}`
                  : isAr ? 'لا توجد' : 'None'}
              />
            </div>

            {/* Audience Preview */}
            <AudiencePreviewBadge
              totalMatching={preview?.totalMatching ?? 0}
              withConsent={preview?.withConsent ?? 0}
              isLoading={previewLoading || !preview}
              isAr={isAr}
            />
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="sticky bottom-0 bg-white border-t px-6 py-4">
        <div className="max-w-4xl mx-auto flex justify-between">
          <button
            type="button"
            onClick={() => (step > 0 ? setStep(step - 1) : onClose())}
            className="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
          >
            {step === 0 ? (isAr ? 'إلغاء' : 'Cancel') : (isAr ? 'السابق' : 'Previous')}
          </button>

          {step < steps.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="btn-primary disabled:opacity-50"
            >
              {isAr ? 'التالي' : 'Next'}
              {isAr ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !data.name}
              className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
            >
              <Rocket className="h-4 w-4" />
              {createMutation.isPending
                ? (isAr ? 'جاري الإنشاء...' : 'Creating...')
                : (isAr ? 'إنشاء الحملة' : 'Create Campaign')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  )
}
