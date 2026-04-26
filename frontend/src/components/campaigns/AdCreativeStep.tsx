import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Sparkles, Loader2, Image as ImageIcon, RefreshCw, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/utils'
import {
  fetchBranding,
  generateAdImage,
  type AdImage,
} from '../../lib/branding'

interface Props {
  isAr: boolean
  adImageId: string | null
  adImageUrl: string | null
  onChange: (image: { adImageId: string; url: string } | null) => void
}

const SIZE_OPTIONS: Array<{ key: 'square' | 'portrait' | 'landscape'; en: string; ar: string }> = [
  { key: 'square', en: 'Square', ar: 'مربع' },
  { key: 'portrait', en: 'Portrait', ar: 'طولي' },
  { key: 'landscape', en: 'Landscape', ar: 'عرضي' },
]

export default function AdCreativeStep({ isAr, adImageId, adImageUrl, onChange }: Props) {
  const [instruction, setInstruction] = useState('')
  const [size, setSize] = useState<'square' | 'portrait' | 'landscape'>('square')
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<AdImage[]>([])

  const { data: branding } = useQuery({
    queryKey: ['branding'],
    queryFn: fetchBranding,
  })

  const generateMutation = useMutation({
    mutationFn: () => generateAdImage({ instruction: instruction.trim(), size }),
    onSuccess: (img) => {
      setError(null)
      setHistory((prev) => [img, ...prev].slice(0, 6))
      onChange({ adImageId: img.adImageId, url: img.url })
    },
    onError: (err: any) => {
      const code = err?.response?.data?.error
      if (code === 'medical_claim_blocked') {
        setError(
          isAr
            ? 'يحظر النص ادعاءات طبية (شفاء، تشخيص...). أعد صياغته.'
            : 'Instruction contains a blocked medical claim. Reword it.',
        )
      } else if (code === 'daily_generation_limit_reached') {
        setError(isAr ? 'تم بلوغ الحد اليومي للتوليد.' : 'Daily generation limit reached.')
      } else {
        setError(isAr ? 'تعذر توليد الصورة.' : 'Could not generate the image.')
      }
    },
  })

  const brandReady = !!(branding?.colors?.length || branding?.logoUrl || branding?.voiceTone)

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">
          {isAr ? 'صورة الإعلان (اختياري)' : 'Ad Image (optional)'}
        </h3>
        <p className="text-xs text-gray-500">
          {isAr
            ? 'صف الإعلان وسيقوم الذكاء الاصطناعي بتوليد صورة متوافقة مع علامتك.'
            : 'Describe your ad and we’ll generate an on-brand image with AI.'}
        </p>
      </div>

      {!brandReady && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {isAr
            ? 'لتحسين النتائج، أضف الشعار والألوان من '
            : 'For best results, add a logo and colors in '}
          <Link to="/dashboard/settings/branding" className="underline font-medium">
            {isAr ? 'إعدادات الهوية' : 'Brand Identity'}
          </Link>
          .
        </div>
      )}

      <div className="space-y-3">
        <label className="text-xs font-medium text-gray-700">
          {isAr ? 'وصف الإعلان (Brief)' : 'Ad brief'}
        </label>
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          rows={4}
          maxLength={800}
          className="input w-full text-sm"
          placeholder={
            isAr
              ? 'مثال: عرض خاص لتبييض الأسنان بمناسبة العيد بخصم ٣٠٪'
              : 'e.g. Eid teeth-whitening promo, 30% off, family-friendly'
          }
        />
        <div className="text-xs text-gray-400 text-end">{instruction.length}/800</div>

        <div className="flex flex-wrap items-center gap-2">
          {SIZE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setSize(opt.key)}
              className={cn(
                'px-3 py-1.5 rounded-full border text-xs font-medium',
                size === opt.key
                  ? 'border-healthcare-primary bg-healthcare-primary/5 text-healthcare-primary'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300',
              )}
            >
              {isAr ? opt.ar : opt.en}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || instruction.trim().length < 8}
            className="btn-primary flex items-center gap-2"
          >
            {generateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {generateMutation.isPending
              ? isAr
                ? 'جاري التوليد...'
                : 'Generating...'
              : adImageId
                ? isAr
                  ? 'توليد بديل'
                  : 'Regenerate'
                : isAr
                  ? 'توليد صورة'
                  : 'Generate image'}
          </button>
          {adImageId && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="btn-ghost text-red-600 flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {isAr ? 'إزالة الصورة' : 'Remove image'}
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      {adImageUrl && (
        <div className="rounded-xl border border-gray-200 p-3 bg-white flex items-start gap-3">
          <img
            src={adImageUrl}
            alt="ad preview"
            className="w-32 h-32 object-cover rounded-lg border"
          />
          <div className="flex-1">
            <p className="text-xs font-medium text-gray-700 mb-1">
              {isAr ? 'المعاينة الحالية' : 'Current preview'}
            </p>
            <p className="text-xs text-gray-500">
              {isAr
                ? 'سترفق هذه الصورة مع رسالة الواتساب لكل مستلم.'
                : 'This image will be attached to each WhatsApp message.'}
            </p>
          </div>
        </div>
      )}

      {history.length > 1 && (
        <div>
          <p className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-1">
            <RefreshCw className="h-3 w-3" />
            {isAr ? 'محاولات سابقة' : 'Earlier generations'}
          </p>
          <div className="flex gap-2 overflow-x-auto">
            {history.map((img) => (
              <button
                key={img.adImageId}
                type="button"
                onClick={() => onChange({ adImageId: img.adImageId, url: img.url })}
                className={cn(
                  'shrink-0 rounded-lg border-2 overflow-hidden transition-colors',
                  adImageId === img.adImageId
                    ? 'border-healthcare-primary'
                    : 'border-transparent hover:border-gray-200',
                )}
              >
                <img src={img.url} alt="" className="w-16 h-16 object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      {!adImageUrl && !generateMutation.isPending && (
        <div className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 flex flex-col items-center gap-2">
          <ImageIcon className="h-8 w-8 text-gray-300" />
          {isAr
            ? 'لم تُولّد صورة بعد. هذه الخطوة اختيارية ويمكن تخطيها.'
            : 'No image generated yet. This step is optional — feel free to skip.'}
        </div>
      )}
    </div>
  )
}
