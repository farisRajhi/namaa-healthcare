import { Plus, Trash2, FlaskConical } from 'lucide-react'
import { cn } from '../../lib/utils'

export interface ScriptVariant {
  name: string
  scriptEn: string
  scriptAr: string
  weight: number
}

interface ABTestEditorProps {
  enabled: boolean
  onToggle: (enabled: boolean) => void
  variants: ScriptVariant[]
  onChange: (variants: ScriptVariant[]) => void
  isAr: boolean
}

export default function ABTestEditor({ enabled, onToggle, variants, onChange, isAr }: ABTestEditorProps) {
  const addVariant = () => {
    const letter = String.fromCharCode(65 + variants.length)
    const totalWeight = 100
    const perVariant = Math.floor(totalWeight / (variants.length + 1))
    const updated = variants.map((v) => ({ ...v, weight: perVariant }))
    updated.push({
      name: `${isAr ? 'متغير' : 'Variant'} ${letter}`,
      scriptEn: '',
      scriptAr: '',
      weight: totalWeight - perVariant * variants.length,
    })
    onChange(updated)
  }

  const removeVariant = (idx: number) => {
    if (variants.length <= 2) return
    const updated = variants.filter((_, i) => i !== idx)
    const perVariant = Math.floor(100 / updated.length)
    const rebalanced = updated.map((v, i) => ({
      ...v,
      weight: i === updated.length - 1 ? 100 - perVariant * (updated.length - 1) : perVariant,
    }))
    onChange(rebalanced)
  }

  const updateVariant = (idx: number, field: keyof ScriptVariant, value: string | number) => {
    const updated = [...variants]
    updated[idx] = { ...updated[idx], [field]: value }
    onChange(updated)
  }

  const updateWeight = (idx: number, weight: number) => {
    const updated = [...variants]
    updated[idx] = { ...updated[idx], weight }
    // Rebalance remaining among others
    const remaining = 100 - weight
    const others = updated.filter((_, i) => i !== idx)
    const perOther = others.length > 0 ? Math.floor(remaining / others.length) : 0
    let allocated = 0
    updated.forEach((_, i) => {
      if (i !== idx) {
        const w = i === updated.length - 1 ? remaining - allocated : perOther
        updated[i] = { ...updated[i], weight: Math.max(0, w) }
        allocated += w
      }
    })
    onChange(updated)
  }

  return (
    <div className="space-y-4">
      {/* Toggle */}
      <button
        type="button"
        onClick={() => {
          if (!enabled) {
            onChange([
              { name: isAr ? 'متغير A' : 'Variant A', scriptEn: '', scriptAr: '', weight: 50 },
              { name: isAr ? 'متغير B' : 'Variant B', scriptEn: '', scriptAr: '', weight: 50 },
            ])
          }
          onToggle(!enabled)
        }}
        className={cn(
          'flex items-center gap-3 p-3 rounded-xl border-2 w-full text-start transition-all',
          enabled ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:border-gray-300',
        )}
      >
        <FlaskConical className={cn('h-5 w-5', enabled ? 'text-purple-600' : 'text-gray-400')} />
        <div className="flex-1">
          <p className="text-sm font-medium">{isAr ? 'اختبار A/B' : 'A/B Testing'}</p>
          <p className="text-xs text-gray-500">
            {isAr ? 'اختبر نصوص مختلفة لمعرفة الأكثر فعالية' : 'Test different scripts to find what works best'}
          </p>
        </div>
        <div className={cn(
          'w-10 h-6 rounded-full transition-colors relative',
          enabled ? 'bg-purple-500' : 'bg-gray-300',
        )}>
          <div className={cn(
            'absolute top-1 w-4 h-4 bg-white rounded-full transition-all',
            enabled ? 'start-5' : 'start-1',
          )} />
        </div>
      </button>

      {/* Variants */}
      {enabled && (
        <div className="space-y-4">
          {/* Weight Distribution Bar */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">
              {isAr ? 'توزيع الوزن' : 'Weight Distribution'}
            </p>
            <div className="flex h-4 rounded-full overflow-hidden">
              {variants.map((v, idx) => {
                const colors = ['bg-purple-500', 'bg-blue-500', 'bg-teal-500', 'bg-amber-500', 'bg-pink-500']
                return (
                  <div
                    key={idx}
                    className={cn('transition-all', colors[idx % colors.length])}
                    style={{ width: `${v.weight}%` }}
                    title={`${v.name}: ${v.weight}%`}
                  />
                )
              })}
            </div>
            <div className="flex justify-between mt-1">
              {variants.map((v, idx) => (
                <span key={idx} className="text-[10px] text-gray-500">{v.name} ({v.weight}%)</span>
              ))}
            </div>
          </div>

          {/* Variant Editors */}
          {variants.map((v, idx) => (
            <div key={idx} className="border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <input
                  type="text"
                  value={v.name}
                  onChange={(e) => updateVariant(idx, 'name', e.target.value)}
                  className="text-sm font-semibold bg-transparent border-none focus:outline-none text-gray-800 w-auto"
                />
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs text-gray-500">{isAr ? 'الوزن' : 'Weight'}</label>
                    <input
                      type="number"
                      min={5}
                      max={95}
                      value={v.weight}
                      onChange={(e) => updateWeight(idx, Number(e.target.value))}
                      className="w-14 text-center text-sm border rounded-md px-1 py-0.5"
                    />
                    <span className="text-xs text-gray-400">%</span>
                  </div>
                  {variants.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeVariant(idx)}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{isAr ? 'النص العربي' : 'Arabic Script'}</label>
                <textarea
                  rows={3}
                  value={v.scriptAr}
                  onChange={(e) => updateVariant(idx, 'scriptAr', e.target.value)}
                  className="input w-full text-sm"
                  dir="rtl"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{isAr ? 'النص الإنجليزي' : 'English Script'}</label>
                <textarea
                  rows={3}
                  value={v.scriptEn}
                  onChange={(e) => updateVariant(idx, 'scriptEn', e.target.value)}
                  className="input w-full text-sm"
                />
              </div>
            </div>
          ))}

          {variants.length < 5 && (
            <button
              type="button"
              onClick={addVariant}
              className="w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-purple-400 hover:text-purple-600 transition-colors"
            >
              <Plus className="h-4 w-4" />
              {isAr ? 'إضافة متغير' : 'Add Variant'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
