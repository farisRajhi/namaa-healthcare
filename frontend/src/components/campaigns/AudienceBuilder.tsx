import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import { useAudiencePreview, PatientFilter } from '../../hooks/useAudiencePreview'
import SegmentCard from './SegmentCard'
import FilterGroup from './FilterGroup'
import AudiencePreviewBadge from './AudiencePreviewBadge'
import { SlidersHorizontal, X } from 'lucide-react'
import { cn } from '../../lib/utils'

interface Segment {
  key: string
  labelAr: string
  labelEn: string
  description: string
  descriptionAr: string
  icon: string
  color: string
  count: number
  rank: number
  avgScore: number
  topServices: { serviceId: string; name: string; patientCount: number }[]
  topPatients: { patientId: string; firstName: string; lastName: string; score: number; engagementScore: number; returnLikelihood: number }[]
}

interface Preset {
  key: string
  labelAr: string
  labelEn: string
  description: string
  descriptionAr: string
  icon: string
  color: string
  filter: PatientFilter
}

interface AudienceBuilderProps {
  value: PatientFilter
  onChange: (filter: PatientFilter) => void
  selectedPreset?: string
  onPresetChange?: (preset: string | null) => void
  channel?: 'whatsapp' | 'sms'
}

export default function AudienceBuilder({
  value,
  onChange,
  selectedPreset,
  onPresetChange,
  channel = 'whatsapp',
}: AudienceBuilderProps) {
  const { user } = useAuth()
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const orgId = user?.org?.id

  // Fetch segment counts
  const { data: segmentsData, isLoading: segmentsLoading } = useQuery<{ segments: Segment[] }>({
    queryKey: ['audience-segments', orgId],
    queryFn: async () => {
      const { data } = await api.get(`/api/audience/${orgId}/segments`)
      return data
    },
    enabled: !!orgId,
    staleTime: 60_000,
  })

  // Fetch preset definitions
  const { data: presetsData } = useQuery<{ presets: Preset[] }>({
    queryKey: ['audience-presets', orgId],
    queryFn: async () => {
      const { data } = await api.get(`/api/audience/${orgId}/presets`)
      return data
    },
    enabled: !!orgId,
    staleTime: 300_000,
  })

  // Live audience preview
  const { data: preview, isLoading: previewLoading } = useAudiencePreview(
    orgId,
    value,
    channel,
  )

  const segments = segmentsData?.segments || []
  const presets = presetsData?.presets || []

  const handlePresetSelect = (presetKey: string) => {
    if (selectedPreset === presetKey) {
      // Deselect
      onPresetChange?.(null)
      onChange({})
      return
    }
    onPresetChange?.(presetKey)
    const preset = presets.find((p) => p.key === presetKey)
    if (preset) {
      onChange(preset.filter)
    }
  }

  const updateFilter = <K extends keyof PatientFilter>(key: K, val: PatientFilter[K]) => {
    onPresetChange?.(null) // Switch to custom when editing filters
    const next = { ...value }
    if (val === undefined || val === '' || (Array.isArray(val) && val.length === 0)) {
      delete next[key]
    } else {
      next[key] = val
    }
    onChange(next)
  }

  const clearFilter = () => {
    onPresetChange?.(null)
    onChange({})
  }

  const hasActiveFilters = Object.keys(value).length > 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Segments + Filters */}
      <div className="lg:col-span-2 space-y-6">
        {/* Segment Preset Cards */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            {isAr ? 'شرائح مسبقة الإعداد' : 'Quick Segments'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[...segments]
              .sort((a, b) => (a.rank || 99) - (b.rank || 99))
              .map((seg) => (
                <SegmentCard
                  key={seg.key}
                  label={seg.labelEn}
                  labelAr={seg.labelAr}
                  description={seg.description}
                  descriptionAr={seg.descriptionAr}
                  icon={seg.icon}
                  color={seg.color}
                  count={seg.count}
                  rank={seg.rank}
                  avgScore={seg.avgScore}
                  topServices={seg.topServices}
                  isSelected={selectedPreset === seg.key}
                  isAr={isAr}
                  onClick={() => handlePresetSelect(seg.key)}
                  isLoading={segmentsLoading}
                  expanded={selectedPreset === seg.key}
                />
              ))}
          </div>
        </div>

        {/* Custom Filters */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-700">
                {isAr ? 'فلاتر مخصصة' : 'Custom Filters'}
              </h3>
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilter}
                className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                {isAr ? 'مسح الكل' : 'Clear all'}
              </button>
            )}
          </div>

          <div className="space-y-3">
            {/* Demographics */}
            <FilterGroup
              title="Demographics"
              titleAr="البيانات الديموغرافية"
              isAr={isAr}
              defaultOpen={!!value.minAge || !!value.maxAge || !!value.sex}
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    {isAr ? 'الحد الأدنى للعمر' : 'Min Age'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={value.minAge ?? ''}
                    onChange={(e) =>
                      updateFilter('minAge', e.target.value ? Number(e.target.value) : undefined)
                    }
                    className="input w-full"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    {isAr ? 'الحد الأقصى للعمر' : 'Max Age'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={value.maxAge ?? ''}
                    onChange={(e) =>
                      updateFilter('maxAge', e.target.value ? Number(e.target.value) : undefined)
                    }
                    className="input w-full"
                    placeholder="120"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  {isAr ? 'الجنس' : 'Sex'}
                </label>
                <div className="flex gap-2">
                  {[
                    { value: '', label: isAr ? 'الكل' : 'All' },
                    { value: 'male', label: isAr ? 'ذكر' : 'Male' },
                    { value: 'female', label: isAr ? 'أنثى' : 'Female' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => updateFilter('sex', opt.value || undefined)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-sm border transition-colors',
                        (value.sex || '') === opt.value
                          ? 'bg-primary-50 border-primary-300 text-primary-700'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </FilterGroup>

            {/* Visit Behavior */}
            <FilterGroup
              title="Visit Behavior"
              titleAr="سلوك الزيارات"
              isAr={isAr}
              defaultOpen={!!value.lastVisitDaysAgo || !!value.noAppointmentDays}
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    {isAr ? 'آخر زيارة منذ (أيام)' : 'Last visit (days ago)'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={value.lastVisitDaysAgo ?? ''}
                    onChange={(e) =>
                      updateFilter(
                        'lastVisitDaysAgo',
                        e.target.value ? Number(e.target.value) : undefined,
                      )
                    }
                    className="input w-full"
                    placeholder="90"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    {isAr ? 'بدون موعد منذ (أيام)' : 'No appt in (days)'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={value.noAppointmentDays ?? ''}
                    onChange={(e) =>
                      updateFilter(
                        'noAppointmentDays',
                        e.target.value ? Number(e.target.value) : undefined,
                      )
                    }
                    className="input w-full"
                    placeholder="60"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={value.excludeWithUpcoming || false}
                  onChange={(e) =>
                    updateFilter('excludeWithUpcoming', e.target.checked || undefined)
                  }
                  className="checkbox"
                />
                {isAr ? 'استبعاد من لديهم مواعيد قادمة' : 'Exclude patients with upcoming appointments'}
              </label>
            </FilterGroup>

            {/* Behavioral Scores */}
            <FilterGroup
              title="Behavioral Scores"
              titleAr="مؤشرات السلوك"
              isAr={isAr}
              defaultOpen={
                value.minEngagementScore !== undefined ||
                value.maxEngagementScore !== undefined ||
                value.minReturnLikelihood !== undefined ||
                value.maxReturnLikelihood !== undefined
              }
            >
              <div>
                <label className="text-xs text-gray-500 mb-2 block">
                  {isAr ? 'معدل التفاعل (0-100)' : 'Engagement Score (0-100)'}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={value.minEngagementScore ?? ''}
                    onChange={(e) =>
                      updateFilter(
                        'minEngagementScore',
                        e.target.value ? Number(e.target.value) : undefined,
                      )
                    }
                    className="input w-full"
                    placeholder={isAr ? 'الحد الأدنى' : 'Min'}
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={value.maxEngagementScore ?? ''}
                    onChange={(e) =>
                      updateFilter(
                        'maxEngagementScore',
                        e.target.value ? Number(e.target.value) : undefined,
                      )
                    }
                    className="input w-full"
                    placeholder={isAr ? 'الحد الأقصى' : 'Max'}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-2 block">
                  {isAr ? 'احتمال العودة (0-100)' : 'Return Likelihood (0-100)'}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={value.minReturnLikelihood ?? ''}
                    onChange={(e) =>
                      updateFilter(
                        'minReturnLikelihood',
                        e.target.value ? Number(e.target.value) : undefined,
                      )
                    }
                    className="input w-full"
                    placeholder={isAr ? 'الحد الأدنى' : 'Min'}
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={value.maxReturnLikelihood ?? ''}
                    onChange={(e) =>
                      updateFilter(
                        'maxReturnLikelihood',
                        e.target.value ? Number(e.target.value) : undefined,
                      )
                    }
                    className="input w-full"
                    placeholder={isAr ? 'الحد الأقصى' : 'Max'}
                  />
                </div>
              </div>
            </FilterGroup>

            {/* Tags & Interests */}
            <FilterGroup
              title="Tags & Interests"
              titleAr="الوسوم والاهتمامات"
              isAr={isAr}
              defaultOpen={
                (value.tags && value.tags.length > 0) ||
                (value.serviceInterests && value.serviceInterests.length > 0)
              }
            >
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  {isAr ? 'الوسوم (مفصولة بفاصلة)' : 'Tags (comma separated)'}
                </label>
                <input
                  type="text"
                  value={(value.tags || []).join(', ')}
                  onChange={(e) => {
                    const tags = e.target.value
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean)
                    updateFilter('tags', tags.length > 0 ? tags : undefined)
                  }}
                  className="input w-full"
                  placeholder={isAr ? 'VIP، عالي الخطورة' : 'VIP, high_risk'}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  {isAr ? 'اهتمامات الخدمات (مفصولة بفاصلة)' : 'Service interests (comma separated)'}
                </label>
                <input
                  type="text"
                  value={(value.serviceInterests || []).join(', ')}
                  onChange={(e) => {
                    const interests = e.target.value
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean)
                    updateFilter('serviceInterests', interests.length > 0 ? interests : undefined)
                  }}
                  className="input w-full"
                  placeholder={isAr ? 'تنظيف أسنان، جلدية' : 'dental_cleaning, dermatology'}
                />
              </div>
            </FilterGroup>
          </div>
        </div>
      </div>

      {/* Right: Audience Preview */}
      <div className="lg:col-span-1">
        <div className="sticky top-4 space-y-4">
          <AudiencePreviewBadge
            totalMatching={preview?.totalMatching ?? 0}
            withConsent={preview?.withConsent ?? 0}
            isLoading={previewLoading || !preview}
            isAr={isAr}
          />

          {/* Engagement breakdown mini chart */}
          {preview && preview.breakdown.byEngagement.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h4 className="text-xs font-semibold text-gray-500 mb-3">
                {isAr ? 'توزيع التفاعل' : 'Engagement Distribution'}
              </h4>
              <div className="space-y-2">
                {preview.breakdown.byEngagement.map((b) => {
                  const maxCount = Math.max(
                    ...preview.breakdown.byEngagement.map((x) => x.count),
                    1,
                  )
                  const pct = (b.count / maxCount) * 100
                  return (
                    <div key={b.bucket} className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 w-10 shrink-0 text-end">
                        {b.bucket}
                      </span>
                      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-400 rounded-full transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-500 w-6 shrink-0">
                        {b.count}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
