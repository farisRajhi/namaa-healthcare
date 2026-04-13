import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import {
  Plus,
  Search,
  Tag,
  Users,
  X,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Clock,
  Gift,
  Copy,
  Check,
  TrendingUp,
  Eye,
} from 'lucide-react'
import { useToast } from '../components/ui/Toast'
import { cn, formatDate } from '../lib/utils'

interface Offer {
  offerId: string
  name: string
  nameAr?: string
  description?: string
  descriptionAr?: string
  offerType: string
  discountValue?: number
  discountUnit?: string
  promoCode?: string
  serviceIds: string[]
  providerIds: string[]
  facilityIds: string[]
  validFrom: string
  validUntil: string
  maxRedemptions?: number
  perPatientLimit: number
  targetPreset?: string
  targetFilter: Record<string, any>
  status: string
  messageAr?: string
  messageEn?: string
  totalSent: number
  totalRedeemed: number
  totalRevenue: number
  createdAt: string
  _count?: { redemptions: number }
}

interface TargetPreset {
  key: string
  labelAr: string
  labelEn: string
  description: string
  filter: Record<string, any>
}

const statusConfig: Record<string, { ar: string; en: string; color: string }> = {
  draft: { ar: 'مسودة', en: 'Draft', color: 'bg-gray-100 text-gray-800' },
  active: { ar: 'نشط', en: 'Active', color: 'bg-green-100 text-green-800' },
  paused: { ar: 'متوقف', en: 'Paused', color: 'bg-yellow-100 text-yellow-800' },
  expired: { ar: 'منتهي', en: 'Expired', color: 'bg-red-100 text-red-800' },
  archived: { ar: 'مؤرشف', en: 'Archived', color: 'bg-gray-200 text-gray-600' },
}

const typeLabels: Record<string, { ar: string; en: string; icon: string }> = {
  percentage_discount: { ar: 'خصم نسبي', en: 'Percentage Discount', icon: '%' },
  fixed_discount: { ar: 'خصم ثابت', en: 'Fixed Discount', icon: '💰' },
  free_addon: { ar: 'إضافة مجانية', en: 'Free Add-on', icon: '🎁' },
  bundle: { ar: 'باقة', en: 'Bundle', icon: '📦' },
  loyalty_reward: { ar: 'مكافأة ولاء', en: 'Loyalty Reward', icon: '⭐' },
}

const WIZARD_STEPS = [
  { ar: 'تفاصيل العرض', en: 'Offer Details' },
  { ar: 'الجمهور المستهدف', en: 'Target Audience' },
  { ar: 'الصلاحية', en: 'Validity' },
  { ar: 'رسالة الواتساب', en: 'WhatsApp Message' },
  { ar: 'مراجعة', en: 'Review' },
]

export default function Offers() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const orgId = user?.org?.id || ''
  const { addToast } = useToast()

  const [search, setSearch] = useState('')
  const [showWizard, setShowWizard] = useState(false)
  const [wizardStep, setWizardStep] = useState(0)
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)
  const [audienceCount, setAudienceCount] = useState<number | null>(null)

  const [wizardData, setWizardData] = useState({
    name: '',
    nameAr: '',
    offerType: 'percentage_discount' as string,
    discountValue: '',
    discountUnit: 'percent' as string,
    promoCode: '',
    targetPreset: 'lapsed_90' as string,
    targetFilter: {} as Record<string, any>,
    validFrom: new Date().toISOString().split('T')[0],
    validUntil: '',
    maxRedemptions: '',
    perPatientLimit: '1',
    messageAr: '',
    messageEn: '',
  })

  // Fetch offers
  const { data: offersData, isLoading } = useQuery({
    queryKey: ['offers', orgId],
    queryFn: async () => {
      const res = await api.get(`/api/offers/${orgId}`)
      return res.data
    },
    enabled: !!orgId,
  })

  // Fetch presets
  const { data: presets } = useQuery<TargetPreset[]>({
    queryKey: ['offer-presets', orgId],
    queryFn: async () => {
      const res = await api.get(`/api/offers/${orgId}/presets`)
      return res.data
    },
    enabled: !!orgId,
  })

  // Create offer
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post(`/api/offers/${orgId}`, data)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offers'] })
      setShowWizard(false)
      resetWizard()
      addToast({ type: 'success', title: isAr ? 'تم إنشاء العرض بنجاح' : 'Offer created successfully' })
    },
    onError: () => {
      addToast({ type: 'error', title: isAr ? 'فشل في إنشاء العرض' : 'Failed to create offer' })
    },
  })

  // Activate offer
  const activateMutation = useMutation({
    mutationFn: async (offerId: string) => {
      const res = await api.post(`/api/offers/${orgId}/${offerId}/activate`)
      return res.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['offers'] })
      addToast({
        type: 'success',
        title: isAr
          ? `تم تفعيل العرض وإرساله إلى ${data.targetsCreated} مريض`
          : `Offer activated and sent to ${data.targetsCreated} patients`,
      })
    },
    onError: () => {
      addToast({ type: 'error', title: isAr ? 'فشل في تفعيل العرض' : 'Failed to activate offer' })
    },
  })

  // Pause offer
  const pauseMutation = useMutation({
    mutationFn: async (offerId: string) => {
      await api.post(`/api/offers/${orgId}/${offerId}/pause`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offers'] })
      addToast({ type: 'success', title: isAr ? 'تم إيقاف العرض' : 'Offer paused' })
    },
  })

  // Preview audience
  const previewAudience = async () => {
    try {
      const preset = presets?.find((p) => p.key === wizardData.targetPreset)
      const filter = preset && preset.key !== 'custom' ? preset.filter : wizardData.targetFilter
      const res = await api.post(`/api/offers/${orgId}/preview-audience`, { targetFilter: filter })
      setAudienceCount(res.data.count)
    } catch {
      setAudienceCount(0)
    }
  }

  const resetWizard = () => {
    setWizardStep(0)
    setAudienceCount(null)
    setWizardData({
      name: '',
      nameAr: '',
      offerType: 'percentage_discount',
      discountValue: '',
      discountUnit: 'percent',
      promoCode: '',
      targetPreset: 'lapsed_90',
      targetFilter: {},
      validFrom: new Date().toISOString().split('T')[0],
      validUntil: '',
      maxRedemptions: '',
      perPatientLimit: '1',
      messageAr: '',
      messageEn: '',
    })
  }

  const handleSubmit = () => {
    const data: any = {
      name: wizardData.name,
      nameAr: wizardData.nameAr || undefined,
      offerType: wizardData.offerType,
      discountValue: wizardData.discountValue ? Number(wizardData.discountValue) : undefined,
      discountUnit: wizardData.discountUnit || undefined,
      promoCode: wizardData.promoCode || undefined,
      targetPreset: wizardData.targetPreset,
      targetFilter: wizardData.targetFilter,
      validFrom: wizardData.validFrom,
      validUntil: wizardData.validUntil,
      maxRedemptions: wizardData.maxRedemptions ? Number(wizardData.maxRedemptions) : undefined,
      perPatientLimit: Number(wizardData.perPatientLimit) || 1,
      messageAr: wizardData.messageAr || undefined,
      messageEn: wizardData.messageEn || undefined,
    }
    createMutation.mutate(data)
  }

  const copyPromoCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  const offers: Offer[] = offersData?.data || []
  const filtered = offers.filter(
    (o) =>
      !search ||
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.nameAr?.includes(search) ||
      o.promoCode?.toLowerCase().includes(search.toLowerCase()),
  )

  const formatDiscount = (offer: Offer) => {
    if (!offer.discountValue) return ''
    if (offer.discountUnit === 'percent') return `${offer.discountValue}%`
    if (offer.discountUnit === 'sar') return `${offer.discountValue / 100} ${isAr ? 'ريال' : 'SAR'}`
    return ''
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isAr ? 'العروض الترويجية' : 'Marketing Offers'}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAr ? 'إنشاء وإدارة عروض واتساب للمرضى' : 'Create and manage WhatsApp offers for patients'}
          </p>
        </div>
        <button
          onClick={() => setShowWizard(true)}
          className="flex items-center gap-2 px-4 py-2 bg-healthcare-primary text-white rounded-lg hover:bg-healthcare-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {isAr ? 'إنشاء عرض' : 'Create Offer'}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder={isAr ? 'بحث بالاسم أو كود العرض...' : 'Search by name or promo code...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full ps-10 pe-4 py-2 border rounded-lg focus:ring-2 focus:ring-healthcare-primary/20 focus:border-healthcare-primary"
        />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          {
            label: isAr ? 'عروض نشطة' : 'Active Offers',
            value: offers.filter((o) => o.status === 'active').length,
            icon: Play,
            color: 'text-green-600 bg-green-50',
          },
          {
            label: isAr ? 'إجمالي المرسل' : 'Total Sent',
            value: offers.reduce((s, o) => s + o.totalSent, 0),
            icon: Users,
            color: 'text-blue-600 bg-blue-50',
          },
          {
            label: isAr ? 'إجمالي الاسترداد' : 'Total Redeemed',
            value: offers.reduce((s, o) => s + o.totalRedeemed, 0),
            icon: Gift,
            color: 'text-purple-600 bg-purple-50',
          },
          {
            label: isAr ? 'إجمالي الإيرادات' : 'Total Revenue',
            value: `${(offers.reduce((s, o) => s + o.totalRevenue, 0) / 100).toFixed(0)} ${isAr ? 'ريال' : 'SAR'}`,
            icon: TrendingUp,
            color: 'text-primary-600 bg-primary-50',
          },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <div className={cn('p-2 rounded-lg', stat.color)}>
                <stat.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-gray-500">{stat.label}</p>
                <p className="text-xl font-bold text-gray-900">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Offers List */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">{isAr ? 'جاري التحميل...' : 'Loading...'}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <Tag className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">{isAr ? 'لا توجد عروض بعد' : 'No offers yet'}</p>
          <button
            onClick={() => setShowWizard(true)}
            className="mt-3 text-healthcare-primary hover:underline text-sm"
          >
            {isAr ? 'إنشاء أول عرض' : 'Create your first offer'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((offer) => {
            const typeConf = typeLabels[offer.offerType]
            const gradientMap: Record<string, string> = {
              percentage_discount: 'from-primary-500 to-primary-600',
              fixed_discount: 'from-green-500 to-green-600',
              free_addon: 'from-purple-500 to-purple-600',
              bundle: 'from-blue-500 to-blue-600',
              loyalty_reward: 'from-amber-500 to-amber-600',
            }
            const gradient = gradientMap[offer.offerType] || 'from-gray-500 to-gray-600'
            const redemptionRate = offer.totalSent > 0 ? Math.round((offer.totalRedeemed / offer.totalSent) * 100) : 0

            return (
            <div
              key={offer.offerId}
              className="bg-white rounded-xl border hover:shadow-card-hover transition-shadow cursor-pointer overflow-hidden"
              onClick={() => setSelectedOffer(offer)}
            >
              {/* Gradient header with discount */}
              <div className={cn('relative p-5 bg-gradient-to-br text-white', gradient)}>
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <span className="text-white/70 text-xs font-medium">
                      {typeConf?.[isAr ? 'ar' : 'en'] || offer.offerType}
                    </span>
                    <h3 className="font-semibold text-white truncate mt-0.5">
                      {isAr ? offer.nameAr || offer.name : offer.name}
                    </h3>
                  </div>
                  {offer.discountValue ? (
                    <div className="text-end shrink-0 ms-3">
                      <p className="text-3xl font-bold leading-none">{formatDiscount(offer)}</p>
                      <p className="text-xs text-white/70 mt-0.5">{isAr ? 'خصم' : 'off'}</p>
                    </div>
                  ) : (
                    <span className="text-2xl">{typeConf?.icon || '🎁'}</span>
                  )}
                </div>
                <span className={cn(
                  'absolute top-2 end-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                  offer.status === 'active' ? 'bg-white/30 text-white' : 'bg-black/20 text-white/80',
                )}>
                  {statusConfig[offer.status]?.[isAr ? 'ar' : 'en'] || offer.status}
                </span>
              </div>

              <div className="p-5">
                {offer.promoCode && (
                  <div className="flex items-center gap-2 mb-4 bg-gray-50 rounded-lg px-3 py-2">
                    <code className="font-mono text-sm font-bold text-gray-800 flex-1">{offer.promoCode}</code>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        copyPromoCode(offer.promoCode!)
                      }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      {copiedCode ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-blue-50 rounded-lg p-2">
                    <p className="font-bold text-blue-700">{offer.totalSent}</p>
                    <p className="text-blue-600">{isAr ? 'مرسل' : 'Sent'}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-2">
                    <p className="font-bold text-green-700">{offer.totalRedeemed}</p>
                    <p className="text-green-600">{isAr ? 'مستخدم' : 'Redeemed'}</p>
                  </div>
                  <div className="bg-primary-50 rounded-lg p-2">
                    <p className="font-bold text-primary-700">{(offer.totalRevenue / 100).toFixed(0)}</p>
                    <p className="text-primary-600">{isAr ? 'ريال' : 'SAR'}</p>
                  </div>
                </div>

                {/* Redemption rate bar */}
                {offer.totalSent > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-500">{isAr ? 'معدل الاسترداد' : 'Redemption rate'}</span>
                      <span className="font-semibold text-gray-700">{redemptionRate}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full">
                      <div className="h-full bg-green-400 rounded-full transition-all duration-500" style={{ width: `${redemptionRate}%` }} />
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-1 mt-3 text-xs text-gray-400">
                  <Clock className="w-3 h-3" />
                  {isAr ? 'صالح حتى' : 'Valid until'}: {formatDate(offer.validUntil)}
                </div>
              </div>

              {/* Action buttons */}
              {offer.status === 'draft' && (
                <div className="border-t px-5 py-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      activateMutation.mutate(offer.offerId)
                    }}
                    className="flex items-center gap-1 text-sm text-green-600 hover:text-green-700 font-medium"
                  >
                    <Play className="w-4 h-4" />
                    {isAr ? 'تفعيل وإرسال' : 'Activate & Send'}
                  </button>
                </div>
              )}
              {offer.status === 'active' && (
                <div className="border-t px-5 py-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      pauseMutation.mutate(offer.offerId)
                    }}
                    className="flex items-center gap-1 text-sm text-yellow-600 hover:text-yellow-700 font-medium"
                  >
                    <Pause className="w-4 h-4" />
                    {isAr ? 'إيقاف مؤقت' : 'Pause'}
                  </button>
                </div>
              )}
            </div>
            )
          })}
        </div>
      )}

      {/* ── Creation Wizard Modal ─────────────────────────────── */}
      {showWizard && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Wizard Header */}
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <div>
                <h2 className="text-lg font-bold">{isAr ? 'إنشاء عرض جديد' : 'Create New Offer'}</h2>
                <div className="flex items-center gap-2 mt-2">
                  {WIZARD_STEPS.map((step, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <div
                        className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                          i === wizardStep
                            ? 'bg-healthcare-primary text-white'
                            : i < wizardStep
                            ? 'bg-green-500 text-white'
                            : 'bg-gray-200 text-gray-500',
                        )}
                      >
                        {i < wizardStep ? '✓' : i + 1}
                      </div>
                      <span className={cn('text-xs hidden sm:inline', i === wizardStep ? 'text-gray-900 font-medium' : 'text-gray-400')}>
                        {step[isAr ? 'ar' : 'en']}
                      </span>
                      {i < WIZARD_STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-gray-300" />}
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => { setShowWizard(false); resetWizard() }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Wizard Body */}
            <div className="p-6 space-y-4">
              {/* Step 1: Offer Details */}
              {wizardStep === 0 && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{isAr ? 'اسم العرض (عربي)' : 'Offer Name (Arabic)'}</label>
                      <input
                        type="text"
                        value={wizardData.nameAr}
                        onChange={(e) => setWizardData({ ...wizardData, nameAr: e.target.value })}
                        placeholder={isAr ? 'مثال: خصم عودة المريض' : 'e.g., Patient Return Discount'}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-healthcare-primary/20"
                        dir="rtl"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{isAr ? 'اسم العرض (إنجليزي)' : 'Offer Name (English)'}</label>
                      <input
                        type="text"
                        value={wizardData.name}
                        onChange={(e) => setWizardData({ ...wizardData, name: e.target.value })}
                        placeholder="e.g., Patient Return Discount"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-healthcare-primary/20"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{isAr ? 'نوع العرض' : 'Offer Type'}</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {Object.entries(typeLabels).map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => setWizardData({ ...wizardData, offerType: key })}
                          className={cn(
                            'p-3 rounded-lg border text-sm text-start transition-colors',
                            wizardData.offerType === key
                              ? 'border-healthcare-primary bg-healthcare-primary/5 text-healthcare-primary'
                              : 'border-gray-200 hover:border-gray-300',
                          )}
                        >
                          <span className="text-lg">{label.icon}</span>
                          <p className="font-medium mt-1">{label[isAr ? 'ar' : 'en']}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {(wizardData.offerType === 'percentage_discount' || wizardData.offerType === 'fixed_discount') && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{isAr ? 'قيمة الخصم' : 'Discount Value'}</label>
                        <input
                          type="number"
                          value={wizardData.discountValue}
                          onChange={(e) => setWizardData({ ...wizardData, discountValue: e.target.value })}
                          placeholder={wizardData.offerType === 'percentage_discount' ? '20' : '5000'}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-healthcare-primary/20"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{isAr ? 'الوحدة' : 'Unit'}</label>
                        <select
                          value={wizardData.discountUnit}
                          onChange={(e) => setWizardData({ ...wizardData, discountUnit: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-healthcare-primary/20"
                        >
                          <option value="percent">{isAr ? 'نسبة مئوية (%)' : 'Percentage (%)'}</option>
                          <option value="sar">{isAr ? 'ريال سعودي (هللات)' : 'SAR (halalas)'}</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {isAr ? 'كود العرض (اختياري - سيتم إنشاؤه تلقائياً)' : 'Promo Code (optional - auto-generated)'}
                    </label>
                    <input
                      type="text"
                      value={wizardData.promoCode}
                      onChange={(e) => setWizardData({ ...wizardData, promoCode: e.target.value.toUpperCase() })}
                      placeholder="TAWAFUD20"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-healthcare-primary/20 font-mono"
                    />
                  </div>
                </>
              )}

              {/* Step 2: Target Audience */}
              {wizardStep === 1 && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{isAr ? 'اختر الجمهور المستهدف' : 'Select Target Audience'}</label>
                    <div className="space-y-2">
                      {presets?.map((preset) => (
                        <button
                          key={preset.key}
                          onClick={() => {
                            setWizardData({ ...wizardData, targetPreset: preset.key, targetFilter: preset.filter })
                            setAudienceCount(null)
                          }}
                          className={cn(
                            'w-full p-4 rounded-lg border text-start transition-colors',
                            wizardData.targetPreset === preset.key
                              ? 'border-healthcare-primary bg-healthcare-primary/5'
                              : 'border-gray-200 hover:border-gray-300',
                          )}
                        >
                          <p className="font-medium text-gray-900">{preset[isAr ? 'labelAr' : 'labelEn']}</p>
                          <p className="text-sm text-gray-500 mt-1">{preset.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {wizardData.targetPreset === 'custom' && (
                    <div className="space-y-3 bg-gray-50 rounded-lg p-4">
                      <h4 className="font-medium text-sm">{isAr ? 'فلتر مخصص' : 'Custom Filter'}</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500">{isAr ? 'آخر زيارة (أيام)' : 'Last visit (days ago)'}</label>
                          <input
                            type="number"
                            value={wizardData.targetFilter.lastVisitDaysAgo || ''}
                            onChange={(e) =>
                              setWizardData({
                                ...wizardData,
                                targetFilter: { ...wizardData.targetFilter, lastVisitDaysAgo: Number(e.target.value) || undefined },
                              })
                            }
                            className="w-full px-2 py-1.5 border rounded text-sm"
                            placeholder="90"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">{isAr ? 'حد أدنى تفاعل' : 'Min engagement'}</label>
                          <input
                            type="number"
                            value={wizardData.targetFilter.minEngagementScore || ''}
                            onChange={(e) =>
                              setWizardData({
                                ...wizardData,
                                targetFilter: { ...wizardData.targetFilter, minEngagementScore: Number(e.target.value) || undefined },
                              })
                            }
                            className="w-full px-2 py-1.5 border rounded text-sm"
                            placeholder="0"
                          />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={wizardData.targetFilter.excludeWithUpcoming || false}
                          onChange={(e) =>
                            setWizardData({
                              ...wizardData,
                              targetFilter: { ...wizardData.targetFilter, excludeWithUpcoming: e.target.checked },
                            })
                          }
                          className="rounded border-gray-300"
                        />
                        {isAr ? 'استبعاد المرضى الذين لديهم مواعيد قادمة' : 'Exclude patients with upcoming appointments'}
                      </label>
                    </div>
                  )}

                  <button
                    onClick={previewAudience}
                    className="flex items-center gap-2 px-4 py-2 border border-healthcare-primary text-healthcare-primary rounded-lg hover:bg-healthcare-primary/5 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    {isAr ? 'معاينة حجم الجمهور' : 'Preview Audience Size'}
                  </button>
                  {audienceCount !== null && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
                      <Users className="w-5 h-5 text-blue-600" />
                      <span className="text-blue-800 font-medium">
                        {audienceCount} {isAr ? 'مريض مؤهل (وافقوا على التسويق)' : 'eligible patients (marketing consent)'}
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* Step 3: Validity */}
              {wizardStep === 2 && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{isAr ? 'تاريخ البدء' : 'Start Date'}</label>
                      <input
                        type="date"
                        value={wizardData.validFrom}
                        onChange={(e) => setWizardData({ ...wizardData, validFrom: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-healthcare-primary/20"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{isAr ? 'تاريخ الانتهاء' : 'End Date'}</label>
                      <input
                        type="date"
                        value={wizardData.validUntil}
                        onChange={(e) => setWizardData({ ...wizardData, validUntil: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-healthcare-primary/20"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{isAr ? 'حد الاستخدام الكلي' : 'Total Max Redemptions'}</label>
                      <input
                        type="number"
                        value={wizardData.maxRedemptions}
                        onChange={(e) => setWizardData({ ...wizardData, maxRedemptions: e.target.value })}
                        placeholder={isAr ? 'غير محدود' : 'Unlimited'}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-healthcare-primary/20"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{isAr ? 'حد لكل مريض' : 'Limit Per Patient'}</label>
                      <input
                        type="number"
                        value={wizardData.perPatientLimit}
                        onChange={(e) => setWizardData({ ...wizardData, perPatientLimit: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-healthcare-primary/20"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Step 4: WhatsApp Message */}
              {wizardStep === 3 && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {isAr ? 'رسالة الواتساب (عربي)' : 'WhatsApp Message (Arabic)'}
                    </label>
                    <p className="text-xs text-gray-400 mb-2">
                      {isAr ? 'المتغيرات المتاحة:' : 'Available variables:'} {'{patient_name}'}, {'{promo_code}'}, {'{discount}'}, {'{booking_link}'}
                    </p>
                    <textarea
                      value={wizardData.messageAr}
                      onChange={(e) => setWizardData({ ...wizardData, messageAr: e.target.value })}
                      rows={6}
                      dir="rtl"
                      placeholder={`مرحباً {patient_name} 👋\n\n🎉 عرض خاص: خصم {discount}\n📋 كود العرض: {promo_code}\n\nللحجز أرسل "حجز"\n\nللإلغاء أرسل: إلغاء`}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-healthcare-primary/20 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {isAr ? 'رسالة الواتساب (إنجليزي) - اختياري' : 'WhatsApp Message (English) - optional'}
                    </label>
                    <textarea
                      value={wizardData.messageEn}
                      onChange={(e) => setWizardData({ ...wizardData, messageEn: e.target.value })}
                      rows={4}
                      placeholder={`Hello {patient_name} 👋\n\n🎉 Special offer: {discount} off\n📋 Promo code: {promo_code}\n\nReply "book" to book\n\nTo unsubscribe: stop`}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-healthcare-primary/20 font-mono text-sm"
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    {isAr
                      ? '💡 إذا تركت الرسالة فارغة، سيتم إنشاء رسالة افتراضية تلقائياً'
                      : '💡 If left empty, a default message will be auto-generated'}
                  </p>
                </>
              )}

              {/* Step 5: Review */}
              {wizardStep === 4 && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900">{isAr ? 'ملخص العرض' : 'Offer Summary'}</h3>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-500">{isAr ? 'الاسم' : 'Name'}</span>
                      <span className="font-medium">{wizardData.nameAr || wizardData.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">{isAr ? 'النوع' : 'Type'}</span>
                      <span>{typeLabels[wizardData.offerType]?.[isAr ? 'ar' : 'en']}</span>
                    </div>
                    {wizardData.discountValue && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">{isAr ? 'الخصم' : 'Discount'}</span>
                        <span className="font-bold text-healthcare-primary">
                          {wizardData.discountValue}{wizardData.discountUnit === 'percent' ? '%' : ` ${isAr ? 'هللة' : 'halalas'}`}
                        </span>
                      </div>
                    )}
                    {wizardData.promoCode && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">{isAr ? 'كود العرض' : 'Promo Code'}</span>
                        <code className="font-mono font-bold">{wizardData.promoCode}</code>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-500">{isAr ? 'الجمهور' : 'Audience'}</span>
                      <span>{presets?.find((p) => p.key === wizardData.targetPreset)?.[isAr ? 'labelAr' : 'labelEn'] || wizardData.targetPreset}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">{isAr ? 'الصلاحية' : 'Validity'}</span>
                      <span>{wizardData.validFrom} → {wizardData.validUntil}</span>
                    </div>
                    {audienceCount !== null && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">{isAr ? 'الجمهور المقدر' : 'Est. Audience'}</span>
                        <span className="font-bold text-blue-600">{audienceCount} {isAr ? 'مريض' : 'patients'}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    {isAr
                      ? 'سيتم إنشاء العرض كمسودة. يمكنك تفعيله لاحقاً لإرسال الرسائل.'
                      : 'The offer will be created as a draft. You can activate it later to send messages.'}
                  </p>
                </div>
              )}
            </div>

            {/* Wizard Footer */}
            <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex items-center justify-between rounded-b-2xl">
              <button
                onClick={() => (wizardStep > 0 ? setWizardStep(wizardStep - 1) : null)}
                disabled={wizardStep === 0}
                className={cn('flex items-center gap-1 text-sm', wizardStep === 0 ? 'text-gray-300' : 'text-gray-600 hover:text-gray-900')}
              >
                <ChevronLeft className="w-4 h-4" />
                {isAr ? 'السابق' : 'Back'}
              </button>

              {wizardStep < WIZARD_STEPS.length - 1 ? (
                <button
                  onClick={() => setWizardStep(wizardStep + 1)}
                  disabled={wizardStep === 0 && !wizardData.name && !wizardData.nameAr}
                  className="flex items-center gap-1 px-4 py-2 bg-healthcare-primary text-white rounded-lg hover:bg-healthcare-primary/90 disabled:opacity-50"
                >
                  {isAr ? 'التالي' : 'Next'}
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={createMutation.isPending}
                  className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  <Tag className="w-4 h-4" />
                  {createMutation.isPending
                    ? (isAr ? 'جاري الإنشاء...' : 'Creating...')
                    : (isAr ? 'إنشاء العرض' : 'Create Offer')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Offer Detail Modal with Analytics ─────────────────── */}
      {selectedOffer && (
        <OfferDetailModal
          offer={selectedOffer}
          orgId={orgId}
          isAr={isAr}
          onClose={() => setSelectedOffer(null)}
          onActivate={(id) => { activateMutation.mutate(id); setSelectedOffer(null) }}
          onPause={(id) => { pauseMutation.mutate(id); setSelectedOffer(null) }}
          formatDiscount={formatDiscount}
        />
      )}
    </div>
  )
}

// ─── Offer Detail with Analytics ────────────────────────────────────────────

function OfferDetailModal({
  offer,
  orgId,
  isAr,
  onClose,
  onActivate,
  onPause,
  formatDiscount,
}: {
  offer: Offer
  orgId: string
  isAr: boolean
  onClose: () => void
  onActivate: (id: string) => void
  onPause: (id: string) => void
  formatDiscount: (o: Offer) => string
}) {
  // Prefetch analytics for future use (redemption details, etc.)
  const { data: _analytics } = useQuery({
    queryKey: ['offer-analytics', offer.offerId],
    queryFn: async () => {
      const res = await api.get(`/api/offers/${orgId}/${offer.offerId}/analytics`)
      return res.data
    },
    enabled: !!orgId && !!offer.offerId,
  })

  const redemptionRate = offer.totalSent > 0 ? ((offer.totalRedeemed / offer.totalSent) * 100).toFixed(1) : '0'
  const revenuePerRedemption = offer.totalRedeemed > 0 ? ((offer.totalRevenue / 100) / offer.totalRedeemed).toFixed(0) : '0'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto animate-scale-in">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold">{isAr ? offer.nameAr || offer.name : offer.name}</h2>
              <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', statusConfig[offer.status]?.color)}>
                {statusConfig[offer.status]?.[isAr ? 'ar' : 'en']}
              </span>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          {offer.promoCode && (
            <div className="bg-gray-50 rounded-lg p-4 mb-4 text-center">
              <p className="text-xs text-gray-500 mb-1">{isAr ? 'كود العرض' : 'Promo Code'}</p>
              <code className="text-2xl font-mono font-bold text-healthcare-primary">{offer.promoCode}</code>
            </div>
          )}

          {/* Analytics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className="text-center bg-blue-50 rounded-lg p-3">
              <p className="text-xl font-bold text-blue-700">{offer.totalSent}</p>
              <p className="text-xs text-blue-600">{isAr ? 'مرسل' : 'Sent'}</p>
            </div>
            <div className="text-center bg-green-50 rounded-lg p-3">
              <p className="text-xl font-bold text-green-700">{offer.totalRedeemed}</p>
              <p className="text-xs text-green-600">{isAr ? 'مستخدم' : 'Redeemed'}</p>
            </div>
            <div className="text-center bg-primary-50 rounded-lg p-3">
              <p className="text-xl font-bold text-primary-700">{(offer.totalRevenue / 100).toFixed(0)}</p>
              <p className="text-xs text-primary-600">{isAr ? 'إيرادات (ريال)' : 'Revenue (SAR)'}</p>
            </div>
            <div className="text-center bg-purple-50 rounded-lg p-3">
              <p className="text-xl font-bold text-purple-700">{redemptionRate}%</p>
              <p className="text-xs text-purple-600">{isAr ? 'معدل الاسترداد' : 'Redemption Rate'}</p>
            </div>
          </div>

          {/* Conversion Funnel */}
          {offer.totalSent > 0 && (
            <div className="mb-5">
              <p className="text-sm font-semibold text-gray-700 mb-3">{isAr ? 'قمع التحويل' : 'Conversion Funnel'}</p>
              <div className="space-y-2">
                {[
                  { label: isAr ? 'مرسل' : 'Sent', value: offer.totalSent, color: 'bg-blue-500' },
                  { label: isAr ? 'مستخدم' : 'Redeemed', value: offer.totalRedeemed, color: 'bg-green-500' },
                ].map((stage) => {
                  const pct = offer.totalSent > 0 ? Math.round((stage.value / offer.totalSent) * 100) : 0
                  return (
                    <div key={stage.label}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-600">{stage.label}</span>
                        <span className="font-semibold">{stage.value} ({pct}%)</span>
                      </div>
                      <div className="h-4 bg-gray-100 rounded-lg overflow-hidden">
                        <div className={cn('h-full rounded-lg transition-all duration-500', stage.color)} style={{ width: `${pct}%`, minWidth: stage.value > 0 ? '3%' : '0%' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              {offer.totalRedeemed > 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  {isAr ? 'متوسط الإيرادات لكل استرداد' : 'Avg revenue per redemption'}: <strong>{revenuePerRedemption} {isAr ? 'ريال' : 'SAR'}</strong>
                </p>
              )}
            </div>
          )}

          {/* Offer Details */}
          <div className="space-y-2 text-sm mb-5">
            <div className="flex justify-between py-1 border-b border-gray-100">
              <span className="text-gray-500">{isAr ? 'النوع' : 'Type'}</span>
              <span>{typeLabels[offer.offerType]?.[isAr ? 'ar' : 'en']}</span>
            </div>
            {offer.discountValue && (
              <div className="flex justify-between py-1 border-b border-gray-100">
                <span className="text-gray-500">{isAr ? 'الخصم' : 'Discount'}</span>
                <span className="font-bold text-healthcare-primary">{formatDiscount(offer)}</span>
              </div>
            )}
            <div className="flex justify-between py-1 border-b border-gray-100">
              <span className="text-gray-500">{isAr ? 'صالح حتى' : 'Valid until'}</span>
              <span>{formatDate(offer.validUntil)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-100">
              <span className="text-gray-500">{isAr ? 'حد لكل مريض' : 'Per patient'}</span>
              <span>{offer.perPatientLimit}x</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {offer.status === 'draft' && (
              <button
                onClick={() => onActivate(offer.offerId)}
                className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm"
              >
                {isAr ? 'تفعيل وإرسال' : 'Activate & Send'}
              </button>
            )}
            {offer.status === 'active' && (
              <button
                onClick={() => onPause(offer.offerId)}
                className="flex-1 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 font-medium text-sm"
              >
                {isAr ? 'إيقاف مؤقت' : 'Pause'}
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 py-2 border rounded-lg hover:bg-gray-50 font-medium text-sm text-gray-700"
            >
              {isAr ? 'إغلاق' : 'Close'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
