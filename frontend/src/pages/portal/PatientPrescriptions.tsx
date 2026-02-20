import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { patientApi } from '../../context/PatientAuthContext'
import { Pill, RefreshCw, Check, Clock, AlertCircle } from 'lucide-react'
import { cn } from '../../lib/utils'

interface PrescriptionItem {
  prescriptionId: string
  medicationName: string
  medicationNameAr: string | null
  dosage: string
  frequency: string
  refillsRemaining: number
  refillsTotal: number
  status: string
  startDate: string
  endDate: string | null
  pharmacyName: string | null
  notes: string | null
  recentRefills: Array<{
    refillId: string
    status: string
    requestedAt: string
  }>
}

const statusIcons: Record<string, React.ElementType> = {
  active: Check,
  expired: AlertCircle,
  completed: Check,
  cancelled: AlertCircle,
}

const statusColorMap: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  expired: 'bg-red-100 text-red-700',
  completed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-slate-100 text-slate-500',
}

export default function PatientPrescriptions() {
  const { t, i18n } = useTranslation()
  const isRTL = i18n.language === 'ar'
  const [prescriptions, setPrescriptions] = useState<PrescriptionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refilling, setRefilling] = useState<string | null>(null)
  const [refillSuccess, setRefillSuccess] = useState<string | null>(null)

  const loadPrescriptions = async () => {
    setLoading(true)
    try {
      const api = patientApi()
      const res = await api.get('/api/patient-portal/prescriptions')
      setPrescriptions(res.data.data || [])
    } catch {
      setPrescriptions([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPrescriptions()
  }, [])

  const handleRefill = async (prescriptionId: string) => {
    setRefilling(prescriptionId)
    try {
      const api = patientApi()
      await api.post(`/api/patient-portal/prescriptions/${prescriptionId}/refill`)
      setRefillSuccess(prescriptionId)
      setTimeout(() => {
        loadPrescriptions()
        setRefillSuccess(null)
      }, 2000)
    } catch {
      // ignore
    } finally {
      setRefilling(null)
    }
  }

  const hasPendingRefill = (rx: PrescriptionItem) => {
    return rx.recentRefills.some((r) => r.status === 'pending')
  }

  const getFrequencyLabel = (freq: string) => {
    return t(`portal.prescriptions.frequencies.${freq}`, { defaultValue: freq })
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-slate-800">{t('portal.prescriptions.title')}</h2>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl p-4 border border-slate-100 animate-pulse">
              <div className="h-4 bg-slate-100 rounded w-2/5 mb-3" />
              <div className="h-3 bg-slate-100 rounded w-3/5 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : prescriptions.length === 0 ? (
        <div className="bg-white rounded-xl p-8 border border-slate-100 text-center">
          <Pill className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-600 font-medium">{t('portal.prescriptions.noPrescriptions')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {prescriptions.map((rx) => {
            const StatusIcon = statusIcons[rx.status] || Check
            const colorClass = statusColorMap[rx.status] || statusColorMap.active
            const canRefill = rx.status === 'active' && rx.refillsRemaining > 0 && !hasPendingRefill(rx)

            return (
              <div
                key={rx.prescriptionId}
                className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                        <Pill className="w-4.5 h-4.5 text-purple-600" />
                      </div>
                      <div>
                        <p className="font-medium text-sm text-slate-800">
                          {isRTL && rx.medicationNameAr ? rx.medicationNameAr : rx.medicationName}
                        </p>
                        {isRTL && rx.medicationNameAr && (
                          <p className="text-[10px] text-slate-400">{rx.medicationName}</p>
                        )}
                        {!isRTL && rx.medicationNameAr && (
                          <p className="text-[10px] text-slate-400">{rx.medicationNameAr}</p>
                        )}
                      </div>
                    </div>
                    <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1', colorClass)}>
                      <StatusIcon className="w-3 h-3" />
                      {t(`portal.prescriptions.statuses.${rx.status}`, { defaultValue: rx.status })}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div className="bg-slate-50 rounded-lg px-3 py-2">
                      <p className="text-slate-400 text-[10px]">{t('portal.prescriptions.dosage')}</p>
                      <p className="text-slate-700 font-medium">{rx.dosage}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg px-3 py-2">
                      <p className="text-slate-400 text-[10px]">{t('portal.prescriptions.frequency')}</p>
                      <p className="text-slate-700 font-medium">{getFrequencyLabel(rx.frequency)}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg px-3 py-2">
                      <p className="text-slate-400 text-[10px]">{t('portal.prescriptions.refillsRemaining')}</p>
                      <p className="text-slate-700 font-medium">
                        {rx.refillsRemaining} / {rx.refillsTotal}
                      </p>
                    </div>
                    {rx.pharmacyName && (
                      <div className="bg-slate-50 rounded-lg px-3 py-2">
                        <p className="text-slate-400 text-[10px]">{t('portal.prescriptions.pharmacy')}</p>
                        <p className="text-slate-700 font-medium">{rx.pharmacyName}</p>
                      </div>
                    )}
                  </div>

                  {/* Pending refill badge */}
                  {hasPendingRefill(rx) && (
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                      <Clock className="w-3.5 h-3.5" />
                      {t('portal.prescriptions.pendingRefill')}
                    </div>
                  )}

                  {/* Refill success */}
                  {refillSuccess === rx.prescriptionId && (
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-green-600 bg-green-50 px-3 py-2 rounded-lg">
                      <Check className="w-3.5 h-3.5" />
                      {t('portal.prescriptions.refillSuccess')}
                    </div>
                  )}
                </div>

                {/* Refill button */}
                {canRefill && (
                  <div className="border-t border-slate-100 px-4 py-3">
                    <button
                      onClick={() => handleRefill(rx.prescriptionId)}
                      disabled={refilling === rx.prescriptionId}
                      className="flex items-center gap-1.5 text-xs font-medium text-teal-600 hover:text-teal-700 disabled:opacity-60"
                    >
                      {refilling === rx.prescriptionId ? (
                        <div className="w-3.5 h-3.5 border-2 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      {t('portal.prescriptions.requestRefill')}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
