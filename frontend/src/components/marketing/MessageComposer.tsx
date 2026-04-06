import { useRef, useCallback, useState } from 'react'
import { cn } from '../../lib/utils'

interface Variable {
  key: string
  ar: string
  desc: string
}

interface MessageComposerProps {
  bodyAr: string
  bodyEn: string
  onChangeAr: (value: string) => void
  onChangeEn: (value: string) => void
  variables?: Variable[]
  channel?: 'sms' | 'whatsapp' | 'both'
  isAr: boolean
  showPreview?: boolean
}

const SMS_SEGMENT_LENGTH = 160
const SMS_UNICODE_SEGMENT_LENGTH = 70

function countSmsSegments(text: string): { chars: number; segments: number; isUnicode: boolean } {
  if (!text) return { chars: 0, segments: 0, isUnicode: false }
  const isUnicode = /[^\x00-\x7F]/.test(text)
  const segLen = isUnicode ? SMS_UNICODE_SEGMENT_LENGTH : SMS_SEGMENT_LENGTH
  return {
    chars: text.length,
    segments: Math.ceil(text.length / segLen),
    isUnicode,
  }
}

export default function MessageComposer({
  bodyAr,
  bodyEn,
  onChangeAr,
  onChangeEn,
  variables = [],
  channel = 'whatsapp',
  isAr,
  showPreview = true,
}: MessageComposerProps) {
  const arRef = useRef<HTMLTextAreaElement>(null)
  const enRef = useRef<HTMLTextAreaElement>(null)
  const lastFocusRef = useRef<'ar' | 'en'>('ar')
  const [previewLang, setPreviewLang] = useState<'ar' | 'en'>('ar')

  const insertVariable = useCallback((v: Variable) => {
    const isArFocused = lastFocusRef.current === 'ar'
    const ref = isArFocused ? arRef.current : enRef.current
    const varText = isArFocused ? v.ar : v.key
    const onChange = isArFocused ? onChangeAr : onChangeEn
    const currentValue = isArFocused ? bodyAr : bodyEn

    if (ref) {
      const start = ref.selectionStart ?? currentValue.length
      const end = ref.selectionEnd ?? currentValue.length
      const newValue = currentValue.slice(0, start) + varText + currentValue.slice(end)
      onChange(newValue)
      requestAnimationFrame(() => {
        ref.focus()
        const cursor = start + varText.length
        ref.setSelectionRange(cursor, cursor)
      })
    } else {
      onChange(currentValue + varText)
    }
  }, [bodyAr, bodyEn, onChangeAr, onChangeEn])

  const arSegments = countSmsSegments(bodyAr)
  const enSegments = countSmsSegments(bodyEn)
  const previewBody = previewLang === 'ar' ? bodyAr : bodyEn
  const isWhatsApp = channel === 'whatsapp' || channel === 'both'

  return (
    <div className={cn('grid gap-6', showPreview ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1')}>
      {/* Editor Side */}
      <div className="space-y-4">
        {/* Variable Buttons */}
        {variables.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-2">{isAr ? 'متغيرات — اضغط للإدراج' : 'Variables — click to insert'}</p>
            <div className="flex flex-wrap gap-1.5">
              {variables.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertVariable(v)}
                  className="px-2 py-1 bg-primary-50 border border-primary-200 rounded-md text-xs text-primary-700 hover:bg-primary-100 transition-colors"
                  title={v.desc}
                >
                  {isAr ? v.ar : v.key}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Arabic Textarea */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-gray-700">
              {isAr ? 'النص العربي' : 'Arabic Message'}
            </label>
            <span className="text-[10px] text-gray-400">
              {arSegments.chars} {isAr ? 'حرف' : 'chars'} · {arSegments.segments} {isAr ? 'مقطع' : 'segment(s)'}
            </span>
          </div>
          <textarea
            ref={arRef}
            rows={4}
            value={bodyAr}
            onChange={(e) => onChangeAr(e.target.value)}
            onFocus={() => { lastFocusRef.current = 'ar' }}
            className="input w-full text-sm"
            dir="rtl"
          />
        </div>

        {/* English Textarea */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-gray-700">
              {isAr ? 'النص الإنجليزي' : 'English Message'}
            </label>
            <span className="text-[10px] text-gray-400">
              {enSegments.chars} {isAr ? 'حرف' : 'chars'} · {enSegments.segments} {isAr ? 'مقطع' : 'segment(s)'}
            </span>
          </div>
          <textarea
            ref={enRef}
            rows={4}
            value={bodyEn}
            onChange={(e) => onChangeEn(e.target.value)}
            onFocus={() => { lastFocusRef.current = 'en' }}
            className="input w-full text-sm"
          />
        </div>
      </div>

      {/* Preview Side */}
      {showPreview && (
        <div className="flex flex-col items-center">
          {/* Language Toggle */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 mb-3">
            <button
              type="button"
              onClick={() => setPreviewLang('ar')}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                previewLang === 'ar' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500',
              )}
            >
              عربي
            </button>
            <button
              type="button"
              onClick={() => setPreviewLang('en')}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                previewLang === 'en' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500',
              )}
            >
              English
            </button>
          </div>

          {/* Phone Mockup */}
          <div className="w-60 rounded-[2rem] border-[6px] border-gray-800 bg-gray-100 shadow-lg overflow-hidden">
            <div className="bg-gray-800 h-5 flex items-center justify-center">
              <div className="w-14 h-2.5 bg-gray-700 rounded-full" />
            </div>
            <div className={cn('px-3 py-1.5 text-white text-xs font-medium', isWhatsApp ? 'bg-green-600' : 'bg-blue-600')}>
              {isWhatsApp ? 'WhatsApp' : 'SMS'}
            </div>
            <div className="p-3 min-h-[180px] bg-[#ECE5DD]">
              {previewBody ? (
                <div
                  className="bg-white rounded-lg rounded-tl-none p-3 shadow-sm max-w-[90%]"
                  dir={previewLang === 'ar' ? 'rtl' : 'ltr'}
                >
                  <p className="text-[11px] text-gray-800 whitespace-pre-wrap leading-relaxed">
                    {previewBody.replace(
                      /\{([^}]+)\}/g,
                      (_, v) => `\u200B[${v}]\u200B`,
                    )}
                  </p>
                  <p className="text-[9px] text-gray-400 text-end mt-1">12:00 PM</p>
                </div>
              ) : (
                <p className="text-xs text-gray-400 text-center mt-16">
                  {isAr ? 'ابدأ بالكتابة...' : 'Start typing...'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
