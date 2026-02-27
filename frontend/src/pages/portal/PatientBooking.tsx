import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { patientApi } from '../../context/PatientAuthContext'
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Stethoscope,
  UserCog,
  CalendarDays,
  ClipboardCheck,
  Clock,
} from 'lucide-react'
import { cn, formatDateLocale, formatHijriDate } from '../../lib/utils'

interface ServiceItem {
  serviceId: string
  name: string
  durationMin: number
}

interface ProviderItem {
  providerId: string
  displayName: string
  credentials: string | null
  department: { name: string } | null
  services: Array<{ serviceId: string; name: string }>
}

interface TimeSlot {
  time: string
  available: boolean
}

export default function PatientBooking() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const isRTL = i18n.language === 'ar'
  const [step, setStep] = useState(0)
  const [services, setServices] = useState<ServiceItem[]>([])
  const [providers, setProviders] = useState<ProviderItem[]>([])
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [loadingServices, setLoadingServices] = useState(true)
  const [loadingProviders, setLoadingProviders] = useState(false)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [bookingError, setBookingError] = useState<string | null>(null)

  // Selections
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<ProviderItem | null>(null)
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [reason, setReason] = useState('')

  const STEPS = [
    { label: t('portal.booking.steps.service'), icon: Stethoscope },
    { label: t('portal.booking.steps.provider'), icon: UserCog },
    { label: t('portal.booking.steps.datetime'), icon: CalendarDays },
    { label: t('portal.booking.steps.confirm'), icon: ClipboardCheck },
  ]

  // Load services on mount
  useEffect(() => {
    const load = async () => {
      try {
        const api = patientApi()
        const res = await api.get('/api/patient-portal/services')
        setServices(res.data.data || [])
      } catch {
        // ignore
      } finally {
        setLoadingServices(false)
      }
    }
    load()
  }, [])

  // Load providers when service selected
  useEffect(() => {
    if (!selectedService) return
    const load = async () => {
      setLoadingProviders(true)
      try {
        const api = patientApi()
        const res = await api.get(`/api/patient-portal/providers?serviceId=${selectedService.serviceId}`)
        setProviders(res.data.data || [])
      } catch {
        setProviders([])
      } finally {
        setLoadingProviders(false)
      }
    }
    load()
  }, [selectedService])

  // Load availability when provider + date selected
  useEffect(() => {
    if (!selectedProvider || !selectedDate || !selectedService) return
    const load = async () => {
      setLoadingSlots(true)
      setSelectedTime('')
      try {
        const api = patientApi()
        const res = await api.get(
          `/api/patient-portal/availability?providerId=${selectedProvider.providerId}&date=${selectedDate}&serviceId=${selectedService.serviceId}`
        )
        setSlots(res.data.slots || [])
      } catch {
        setSlots([])
      } finally {
        setLoadingSlots(false)
      }
    }
    load()
  }, [selectedProvider, selectedDate, selectedService])

  const canProceed = () => {
    switch (step) {
      case 0: return !!selectedService
      case 1: return !!selectedProvider
      case 2: return !!selectedDate && !!selectedTime
      case 3: return true
      default: return false
    }
  }

  const handleSubmit = async () => {
    if (!selectedService || !selectedProvider || !selectedDate || !selectedTime) return
    setSubmitting(true)
    setBookingError(null)
    try {
      const api = patientApi()
      const startTs = `${selectedDate}T${selectedTime}:00Z`
      await api.post('/api/patient-portal/appointments', {
        providerId: selectedProvider.providerId,
        serviceId: selectedService.serviceId,
        startTs,
        reason: reason || undefined,
      })
      setSuccess(true)
    } catch (error: any) {
      const msg =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        t('portal.booking.errorDefault')
      setBookingError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const { prayerTimes, isDuringPrayer } = usePrayerTimes(selectedDate)

  const today = new Date().toISOString().split('T')[0]
  const maxDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-lg font-bold text-slate-800 mb-1">{t('portal.booking.success')}</h2>
        <p className="text-sm text-slate-500 mb-1">{t('portal.booking.successEn')}</p>
        <p className="text-xs text-slate-400 mb-6">
          {selectedService?.name} {t('portal.booking.with')} {selectedProvider?.displayName}
          <br />
          {selectedDate} — {selectedTime}
        </p>
        <button
          onClick={() => navigate('/patient/dashboard/appointments')}
          className="bg-teal-500 text-white px-6 py-2.5 rounded-xl text-sm font-medium"
        >
          {t('portal.booking.viewAppointments')}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <h2 className="text-lg font-bold text-slate-800">{t('portal.booking.title')}</h2>

      {/* Steps indicator */}
      <div className="flex items-center gap-1 bg-white rounded-xl p-3 border border-slate-100">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center flex-1">
            <div
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors w-full justify-center',
                i === step
                  ? 'bg-teal-50 text-teal-700'
                  : i < step
                  ? 'text-teal-600'
                  : 'text-slate-400'
              )}
            >
              <s.icon className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn('w-3 h-0.5 mx-0.5 rounded flex-shrink-0', i < step ? 'bg-teal-300' : 'bg-slate-200')} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="min-h-[300px]">
        {/* Step 0: Select Service */}
        {step === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 mb-2">{t('portal.booking.selectService')}</p>
            {loadingServices ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white rounded-xl p-4 border animate-pulse">
                    <div className="h-4 bg-slate-100 rounded w-1/3 mb-2" />
                    <div className="h-3 bg-slate-100 rounded w-1/4" />
                  </div>
                ))}
              </div>
            ) : (
              services.map((svc) => (
                <button
                  key={svc.serviceId}
                  onClick={() => {
                    setSelectedService(svc)
                    setSelectedProvider(null)
                    setSelectedDate('')
                    setSelectedTime('')
                  }}
                  className={cn(
                    'w-full text-start bg-white rounded-xl p-4 border transition-all',
                    selectedService?.serviceId === svc.serviceId
                      ? 'border-teal-500 ring-2 ring-teal-100'
                      : 'border-slate-100 hover:border-slate-200'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                      <Stethoscope className="w-5 h-5 text-teal-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm text-slate-800">{svc.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {svc.durationMin} {t('portal.booking.minutes')}
                      </p>
                    </div>
                    {selectedService?.serviceId === svc.serviceId && (
                      <Check className="w-5 h-5 text-teal-500" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {/* Step 1: Select Provider */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 mb-2">{t('portal.booking.selectProvider')}</p>
            {loadingProviders ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-white rounded-xl p-4 border animate-pulse">
                    <div className="h-4 bg-slate-100 rounded w-1/3 mb-2" />
                    <div className="h-3 bg-slate-100 rounded w-1/4" />
                  </div>
                ))}
              </div>
            ) : providers.length === 0 ? (
              <div className="bg-white rounded-xl p-6 border text-center">
                <p className="text-sm text-slate-500">{t('portal.booking.noProviders')}</p>
              </div>
            ) : (
              providers.map((prov) => (
                <button
                  key={prov.providerId}
                  onClick={() => {
                    setSelectedProvider(prov)
                    setSelectedDate('')
                    setSelectedTime('')
                  }}
                  className={cn(
                    'w-full text-start bg-white rounded-xl p-4 border transition-all',
                    selectedProvider?.providerId === prov.providerId
                      ? 'border-teal-500 ring-2 ring-teal-100'
                      : 'border-slate-100 hover:border-slate-200'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <UserCog className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-slate-800">{prov.displayName}</p>
                      {prov.credentials && (
                        <p className="text-xs text-slate-400">{prov.credentials}</p>
                      )}
                      {prov.department && (
                        <p className="text-[10px] text-slate-400 mt-0.5">{prov.department.name}</p>
                      )}
                    </div>
                    {selectedProvider?.providerId === prov.providerId && (
                      <Check className="w-5 h-5 text-teal-500 flex-shrink-0" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {/* Step 2: Select Date + Time */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('portal.booking.selectDate')}
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                min={today}
                max={maxDate}
                dir="ltr"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors text-left"
              />
              {selectedDate && (
                <p className="text-xs text-slate-500 mt-1 text-start">
                  {formatHijriDate(selectedDate)}
                </p>
              )}
            </div>

            {selectedDate && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {t('portal.booking.availableSlots')}
                </label>
                {loadingSlots ? (
                  <div className="grid grid-cols-4 gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                      <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : slots.filter((s) => s.available).length === 0 ? (
                  <div className="bg-slate-50 rounded-xl p-4 text-center">
                    <p className="text-sm text-slate-500">{t('portal.booking.noSlots')}</p>
                  </div>
                ) : (
                  <>
                    {selectedDate && prayerTimes && (
                      <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-3">
                        <p className="text-xs font-medium text-amber-800 mb-2 flex items-center gap-1">
                          ?? {t('portal.booking.prayerTimes')}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {prayerTimes.map(p => (
                            <span key={p.name} className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                              {i18n.language === 'ar' ? p.nameAr : p.name} {p.start}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-4 gap-2">
                      {slots.map((slot) => {
                        const prayerConflict = isDuringPrayer(slot.time)
                        return (
                          <button
                            key={slot.time}
                            onClick={() => slot.available && setSelectedTime(slot.time)}
                            disabled={!slot.available}
                            className={cn(
                              'py-2.5 text-xs font-medium rounded-lg transition-all border relative',
                              !slot.available && 'opacity-30 cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400',
                              slot.available && selectedTime === slot.time
                                ? 'bg-teal-500 text-white border-teal-500'
                                : slot.available
                                ? prayerConflict
                                  ? 'bg-amber-50 border-amber-200 text-amber-700 hover:border-amber-300'
                                  : 'bg-white border-slate-200 text-slate-700 hover:border-teal-300'
                                : ''
                            )}
                            title={prayerConflict ? `${prayerConflict.nameAr} - ${prayerConflict.name}` : undefined}
                          >
                            {slot.time}
                            {prayerConflict && slot.available && (
                              <span className="absolute -top-1 -end-1 w-3 h-3 text-[8px] bg-amber-400 text-white rounded-full flex items-center justify-center">??</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
              <div className="bg-teal-50 px-4 py-3">
                <h3 className="text-sm font-bold text-teal-800">{t('portal.booking.summary')}</h3>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">{t('portal.booking.service')}</span>
                  <span className="font-medium text-slate-800">{selectedService?.name}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">{t('portal.booking.provider')}</span>
                  <span className="font-medium text-slate-800">{selectedProvider?.displayName}</span>
                </div>
                <div className="flex items-start justify-between text-sm">
                  <span className="text-slate-500">{t('portal.booking.date')}</span>
                  <span className="font-medium text-slate-800 text-end">
                    {formatDateLocale(selectedDate, i18n.language)}
                    <span className="block text-xs text-slate-500 font-normal">{formatHijriDate(selectedDate)}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">{t('portal.booking.time')}</span>
                  <span className="font-medium text-slate-800" dir="ltr">{selectedTime}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">{t('portal.booking.duration')}</span>
                  <span className="font-medium text-slate-800">{selectedService?.durationMin} {t('portal.booking.minutes')}</span>
                </div>
              </div>
            </div>

            {/* Reason (optional) */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('portal.booking.reason')} <span className="text-slate-400 text-xs">{t('portal.booking.reasonOptional')}</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder={t('portal.booking.reasonPlaceholder')}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Booking error */}
      {bookingError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <p className="font-medium">{t('portal.booking.errorOccurred')}</p>
          <p className="text-xs mt-0.5 text-red-500">{bookingError}</p>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex items-center gap-3 pt-2">
        {step > 0 && (
          <button
            onClick={() => { setStep(step - 1); setBookingError(null) }}
            className="flex items-center gap-1 text-sm text-slate-600 px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50"
          >
            {isRTL ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
            {t('portal.booking.previous')}
          </button>
        )}
        <div className="flex-1" />
        {step < 3 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
            className="flex items-center gap-1 text-sm text-white bg-teal-500 px-6 py-2.5 rounded-xl font-medium hover:bg-teal-600 disabled:opacity-40 transition-all"
          >
            {t('portal.booking.next')}
            {isRTL ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-1 text-sm text-white bg-teal-500 px-6 py-2.5 rounded-xl font-medium hover:bg-teal-600 disabled:opacity-60 transition-all"
          >
            {submitting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Check className="w-4 h-4" />
                {t('portal.booking.confirmBooking')}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}



