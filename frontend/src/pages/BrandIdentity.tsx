import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Palette, Save, CheckCircle, Trash2, Image as ImageIcon, Plus } from 'lucide-react'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import {
  fetchBranding,
  updateBranding,
  uploadBrandLogo,
  deleteBrandLogo,
} from '../lib/branding'

const HEX = /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/

function normalizeHex(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('#') ? trimmed.toLowerCase() : `#${trimmed.toLowerCase()}`
}

export default function BrandIdentity() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [nameAr, setNameAr] = useState('')
  const [voiceTone, setVoiceTone] = useState('')
  const [colors, setColors] = useState<string[]>([])
  const [draftColor, setDraftColor] = useState('#0ea5e9')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: branding, isLoading } = useQuery({
    queryKey: ['branding'],
    queryFn: fetchBranding,
  })

  useEffect(() => {
    if (branding) {
      setNameAr(branding.nameAr ?? '')
      setVoiceTone(branding.voiceTone ?? '')
      setColors(branding.colors ?? [])
    }
  }, [branding])

  const saveMutation = useMutation({
    mutationFn: () =>
      updateBranding({
        nameAr: nameAr.trim() || null,
        voiceTone: voiceTone.trim() || null,
        colors,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branding'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error ?? (isAr ? 'تعذر الحفظ' : 'Failed to save'))
    },
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadBrandLogo(file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['branding'] }),
    onError: (err: any) => {
      setError(err?.response?.data?.error ?? (isAr ? 'فشل رفع الشعار' : 'Logo upload failed'))
    },
  })

  const deleteLogoMutation = useMutation({
    mutationFn: deleteBrandLogo,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['branding'] }),
  })

  const handleAddColor = () => {
    const normalized = normalizeHex(draftColor)
    if (!HEX.test(normalized.replace('#', ''))) {
      setError(isAr ? 'لون غير صالح' : 'Invalid color')
      return
    }
    if (colors.includes(normalized)) return
    if (colors.length >= 10) {
      setError(isAr ? 'الحد الأقصى ١٠ ألوان' : 'Maximum 10 colors')
      return
    }
    setColors([...colors, normalized])
    setError(null)
  }

  const handleRemoveColor = (hex: string) => {
    setColors(colors.filter((c) => c !== hex))
  }

  const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setError(null)
    uploadMutation.mutate(file)
    event.target.value = ''
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" text={isAr ? 'جاري التحميل...' : 'Loading...'} />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{isAr ? 'هوية العلامة التجارية' : 'Brand Identity'}</h1>
          <p className="page-subtitle">
            {isAr
              ? 'تُستخدم هذه المعلومات لتوليد صور إعلاناتك بالذكاء الاصطناعي.'
              : 'Used by the AI to generate on-brand ad images for your campaigns.'}
          </p>
        </div>
        {saved && (
          <div className="flex items-center gap-2 px-4 py-2 bg-success-50 text-success-700 rounded-xl text-sm font-medium animate-fade-in">
            <CheckCircle className="h-4 w-4" />
            {isAr ? 'تم الحفظ' : 'Saved'}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6">
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
              <ImageIcon className="h-5 w-5 text-primary-500" />
            </div>
            <h2 className="text-lg font-heading font-semibold text-healthcare-text">
              {isAr ? 'الشعار' : 'Logo'}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="w-24 h-24 rounded-xl border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center overflow-hidden">
              {branding?.logoUrl ? (
                <img src={branding.logoUrl} alt="logo" className="object-contain w-full h-full" />
              ) : (
                <ImageIcon className="h-8 w-8 text-gray-300" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleLogoChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending}
                className="btn-primary"
              >
                {uploadMutation.isPending
                  ? isAr
                    ? 'جاري الرفع...'
                    : 'Uploading...'
                  : isAr
                    ? 'رفع شعار'
                    : 'Upload logo'}
              </button>
              {branding?.logoUrl && (
                <button
                  type="button"
                  onClick={() => deleteLogoMutation.mutate()}
                  className="btn-ghost text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                  {isAr ? 'حذف الشعار' : 'Remove logo'}
                </button>
              )}
              <p className="text-xs text-healthcare-muted">
                {isAr
                  ? 'PNG / JPG / WEBP / SVG · حتى ٥ ميغابايت'
                  : 'PNG / JPG / WEBP / SVG · up to 5MB'}
              </p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-success-50 flex items-center justify-center">
              <Palette className="h-5 w-5 text-success-500" />
            </div>
            <h2 className="text-lg font-heading font-semibold text-healthcare-text">
              {isAr ? 'لوحة الألوان' : 'Color palette'}
            </h2>
          </div>
          <div className="space-y-4">
            <p className="text-sm text-healthcare-muted">
              {isAr
                ? 'أضف ألوان علامتك التجارية. ستُحقن في كل صورة إعلانية يولّدها الذكاء الاصطناعي.'
                : 'Add your brand colors. They’ll be injected into every AI-generated ad image.'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {colors.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border bg-white text-sm shadow-sm"
                >
                  <span
                    className="inline-block h-4 w-4 rounded-full border"
                    style={{ background: c }}
                  />
                  {c}
                  <button
                    type="button"
                    onClick={() => handleRemoveColor(c)}
                    className="text-healthcare-muted hover:text-red-600"
                    aria-label={isAr ? `إزالة ${c}` : `remove ${c}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {colors.length === 0 && (
                <span className="text-sm text-healthcare-muted">
                  {isAr ? 'لا توجد ألوان بعد' : 'No colors yet'}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="color"
                value={draftColor}
                onChange={(e) => setDraftColor(e.target.value)}
                className="h-10 w-14 rounded-lg border border-gray-200 cursor-pointer"
                aria-label={isAr ? 'اختر لون' : 'Pick color'}
              />
              <input
                type="text"
                value={draftColor}
                onChange={(e) => setDraftColor(e.target.value)}
                className="input max-w-[160px]"
                placeholder="#0ea5e9"
              />
              <button type="button" onClick={handleAddColor} className="btn-primary">
                <Plus className="h-4 w-4" />
                {isAr ? 'إضافة لون' : 'Add color'}
              </button>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-warning-50 flex items-center justify-center">
              <ImageIcon className="h-5 w-5 text-warning-500" />
            </div>
            <h2 className="text-lg font-heading font-semibold text-healthcare-text">
              {isAr ? 'الاسم بالعربية ونبرة العلامة' : 'Arabic name & brand voice'}
            </h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="input-label">
                {isAr ? 'اسم العيادة (العربية)' : 'Clinic name (Arabic)'}
              </label>
              <input
                type="text"
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                className="input max-w-md"
                placeholder={isAr ? 'مثلاً: مركز الصحة' : 'e.g. مركز الصحة'}
              />
            </div>
            <div>
              <label className="input-label">
                {isAr ? 'نبرة الصوت / الإحساس البصري' : 'Voice & visual tone'}
              </label>
              <textarea
                value={voiceTone}
                onChange={(e) => setVoiceTone(e.target.value)}
                rows={3}
                maxLength={500}
                className="input"
                placeholder={
                  isAr
                    ? 'مثلاً: عصري، هادئ، عائلي، يبعث على الثقة'
                    : 'e.g. modern, calm, family-friendly, trustworthy'
                }
              />
              <p className="text-xs text-healthcare-muted mt-1">
                {isAr
                  ? 'اختياري — يساعد الذكاء الاصطناعي على فهم الطابع البصري لإعلاناتك.'
                  : 'Optional — helps the AI match the visual feel of your ads.'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="btn-primary"
          >
            {saveMutation.isPending ? <LoadingSpinner size="sm" /> : <Save className="h-4 w-4" />}
            {saveMutation.isPending
              ? isAr
                ? 'جاري الحفظ...'
                : 'Saving...'
              : isAr
                ? 'حفظ'
                : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
