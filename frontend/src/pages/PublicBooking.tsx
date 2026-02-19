/**
 * PublicBooking – Patient self-booking page accessible via shareable clinic link.
 * Route: /book/:slug
 *
 * No login required. Patients select service → provider → slot → confirm.
 */

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  CalendarDays,
  Clock,
  Stethoscope,
  UserCog,
  ClipboardCheck,
  CheckCircle2,
  Building2,
  Phone,
  User,
} from 'lucide-react'
import { cn } from '../lib/utils'

const API = (path: string) => `/api/book${path}`

interface ClinicInfo {
  facilityId: string
  name: string
  city: string | null
  addressLine1: string | null
  clinicSlug: string
}

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
}

interface TimeSlot {
  start: string
  end: string
}

const STEPS = [
  { label: 'الخدمة', icon: Stethoscope },
  { label: 'الطبيب', icon: UserCog },
  { label: 'الموعد', icon: CalendarDays },
  { label: 'بياناتك', icon: User },
  { label: 'تأكيد', icon: ClipboardCheck },
]

export default function PublicBooking() {
  const { slug } = useParams<{ slug: string }>()

  const [clinic, setClinic] = useState<ClinicInfo | null>(null)
  const [services, setServices] = useState<ServiceItem[]>([])
  const [providers, setProviders] = useState<ProviderItem[]>([])
  const [slots, setSlots] = useState<TimeSlot[]>([])

  const [step, setStep] = useState(0)
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<ProviderItem | null>(null)
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [reason, setReason] = useState('')

  const [loading, setLoading] = useState(true)
  const [loadingProviders, setLoadingProviders] = useState(false)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load clinic info
  useEffect(() => {
    if (!slug) return
    fetch(API(`/${slug}`))
      .then((r) => r.json())
      .then((json) => {
        if (json.error) { setError('العيادة غير موجودة'); return }
        setClinic(json.data)
        return fetch(API(`/${slug}/services`))
      })
      .then((r) => r?.json())
      .then((json) => { if (json?.data) setServices(json.data) })
      .catch(() => setError('حدث خطأ في تحميل البيانات'))
      .finally(() => setLoading(false))
  }, [slug])

  // Load providers when service selected
  useEffect(() => {
    if (!selectedService || !slug) return
    setLoadingProviders(true)
    fetch(API(`/${slug}/providers?serviceId=${selectedService.serviceId}`))
      .then((r) => r.json())
      .then((json) => setProviders(json.data ?? []))
      .finally(() => setLoadingProviders(false))
  }, [selectedService, slug])

  // Load slots when date selected
  useEffect(() => {
    if (!selectedDate || !selectedProvider || !selectedService || !slug) return
    setLoadingSlots(true)
    const params = new URLSearchParams({
      providerId: selectedProvider.providerId,
      date: selectedDate,
      serviceId: selectedService.serviceId,
    })
    fetch(API(`/${slug}/slots?${params}`))
      .then((r) => r.json())
      .then((json) => setSlots(json.slots ?? []))
      .finally(() => setLoadingSlots(false))
  }, [selectedDate, selectedProvider, selectedService, slug])

  const handleSubmit = async () => {
    if (!slug || !selectedSlot || !selectedService || !selectedProvider) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(API(`/${slug}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: selectedProvider.providerId,
          serviceId: selectedService.serviceId,
          startTs: selectedSlot.start,
          firstName,
          lastName,
          phone,
          reason,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error ?? 'حدث خطأ أثناء الحجز')
      } else {
        setSuccess(true)
      }
    } catch {
      setError('تعذر الاتصال بالخادم')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-blue-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  if (error && !clinic) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-blue-50">
        <div className="text-center p-8 bg-white rounded-2xl shadow-lg">
          <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-800 mb-2">العيادة غير موجودة</h1>
          <p className="text-gray-500">تحقق من الرابط وحاول مرة أخرى</p>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-blue-50 p-4">
        <div className="text-center p-8 bg-white rounded-2xl shadow-lg max-w-md w-full">
          <CheckCircle2 className="w-20 h-20 text-teal-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-800 mb-2">تم تأكيد موعدك! 🎉</h1>
          <p className="text-gray-600 mb-4">
            ستصلك رسالة تأكيد على رقم هاتفك <strong>{phone}</strong>
          </p>
          <div className="bg-teal-50 rounded-xl p-4 text-right">
            <p className="text-sm text-teal-800 font-medium">{clinic?.name}</p>
            <p className="text-sm text-gray-600">{selectedService?.name} مع {selectedProvider?.displayName}</p>
            <p className="text-sm text-gray-600">
              {selectedSlot && new Date(selectedSlot.start).toLocaleDateString('ar-SA', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
              })}
              {' '} الساعة {selectedSlot && new Date(selectedSlot.start).toLocaleTimeString('ar-SA', {
                hour: '2-digit', minute: '2-digit',
              })}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const minDate = new Date().toISOString().split('T')[0]

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-blue-50 p-4" dir="rtl">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 pt-8">
          <div className="w-16 h-16 bg-teal-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800">{clinic?.name}</h1>
          {clinic?.city && <p className="text-gray-500 mt-1">{clinic.city}</p>}
          {clinic?.addressLine1 && <p className="text-gray-400 text-sm">{clinic.addressLine1}</p>}
          <p className="text-teal-600 font-semibold mt-2">احجز موعدك الآن</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-1 mb-8">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            return (
              <div key={i} className="flex items-center">
                <div className={cn(
                  'flex flex-col items-center gap-1',
                )}>
                  <div className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center transition-all',
                    i < step ? 'bg-teal-500 text-white' :
                    i === step ? 'bg-teal-600 text-white shadow-md scale-110' :
                    'bg-gray-200 text-gray-400',
                  )}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className={cn(
                    'text-xs font-medium hidden sm:block',
                    i === step ? 'text-teal-600' : 'text-gray-400',
                  )}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={cn(
                    'w-8 h-0.5 mb-5',
                    i < step ? 'bg-teal-500' : 'bg-gray-200',
                  )} />
                )}
              </div>
            )
          })}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          {/* Step 0: Service */}
          {step === 0 && (
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-4">اختر الخدمة</h2>
              <div className="grid gap-3">
                {services.map((s) => (
                  <button
                    key={s.serviceId}
                    onClick={() => { setSelectedService(s); setStep(1) }}
                    className="flex items-center justify-between p-4 rounded-xl border-2 border-gray-100 hover:border-teal-400 hover:bg-teal-50 transition-all text-right"
                  >
                    <div>
                      <p className="font-semibold text-gray-800">{s.name}</p>
                      <p className="text-sm text-gray-500">{s.durationMin} دقيقة</p>
                    </div>
                    <Stethoscope className="w-5 h-5 text-teal-500" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 1: Provider */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-4">اختر الطبيب</h2>
              {loadingProviders ? (
                <div className="text-center py-8 text-gray-500">جاري التحميل...</div>
              ) : providers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">لا يوجد أطباء متاحون لهذه الخدمة</div>
              ) : (
                <div className="grid gap-3">
                  {providers.map((p) => (
                    <button
                      key={p.providerId}
                      onClick={() => { setSelectedProvider(p); setStep(2) }}
                      className="flex items-center justify-between p-4 rounded-xl border-2 border-gray-100 hover:border-teal-400 hover:bg-teal-50 transition-all text-right"
                    >
                      <div>
                        <p className="font-semibold text-gray-800">{p.displayName}</p>
                        {p.credentials && <p className="text-sm text-gray-500">{p.credentials}</p>}
                        {p.department && <p className="text-xs text-teal-600">{p.department.name}</p>}
                      </div>
                      <UserCog className="w-5 h-5 text-teal-500" />
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setStep(0)} className="mt-4 text-sm text-gray-400 hover:text-gray-600">
                ← رجوع
              </button>
            </div>
          )}

          {/* Step 2: Date & Slot */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-4">اختر التاريخ والوقت</h2>
              <input
                type="date"
                min={minDate}
                value={selectedDate}
                onChange={(e) => { setSelectedDate(e.target.value); setSelectedSlot(null) }}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:border-teal-400 outline-none mb-4"
              />
              {selectedDate && (
                loadingSlots ? (
                  <div className="text-center py-4 text-gray-500">جاري تحميل المواعيد...</div>
                ) : slots.length === 0 ? (
                  <div className="text-center py-4 text-gray-500">لا توجد مواعيد متاحة في هذا اليوم</div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {slots.map((s, i) => {
                      const time = new Date(s.start).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
                      return (
                        <button
                          key={i}
                          onClick={() => setSelectedSlot(s)}
                          className={cn(
                            'flex items-center justify-center gap-1 p-3 rounded-xl border-2 transition-all text-sm font-medium',
                            selectedSlot?.start === s.start
                              ? 'border-teal-500 bg-teal-50 text-teal-700'
                              : 'border-gray-100 hover:border-teal-300 text-gray-700',
                          )}
                        >
                          <Clock className="w-3 h-3" />
                          {time}
                        </button>
                      )
                    })}
                  </div>
                )
              )}
              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep(1)} className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-medium hover:bg-gray-50">
                  رجوع
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!selectedSlot}
                  className="flex-1 py-3 rounded-xl bg-teal-500 text-white font-medium hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  التالي
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Patient info */}
          {step === 3 && (
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-4">بياناتك الشخصية</h2>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <input
                  placeholder="الاسم الأول *"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-teal-400 outline-none"
                />
                <input
                  placeholder="اسم العائلة *"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-teal-400 outline-none"
                />
              </div>
              <div className="relative mb-3">
                <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  placeholder="رقم الجوال * (مثال: 0512345678)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-xl pr-10 pl-4 py-3 focus:border-teal-400 outline-none"
                  type="tel"
                />
              </div>
              <textarea
                placeholder="سبب الزيارة (اختياري)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-teal-400 outline-none resize-none mb-4"
              />
              <div className="flex gap-3">
                <button onClick={() => setStep(2)} className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-medium hover:bg-gray-50">
                  رجوع
                </button>
                <button
                  onClick={() => setStep(4)}
                  disabled={!firstName || !lastName || !phone}
                  className="flex-1 py-3 rounded-xl bg-teal-500 text-white font-medium hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  مراجعة الحجز
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 4 && (
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-6">مراجعة وتأكيد الحجز</h2>
              <div className="space-y-3 mb-6">
                {[
                  { label: 'الخدمة', value: selectedService?.name },
                  { label: 'الطبيب', value: selectedProvider?.displayName },
                  { label: 'التاريخ', value: selectedSlot && new Date(selectedSlot.start).toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) },
                  { label: 'الوقت', value: selectedSlot && new Date(selectedSlot.start).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) },
                  { label: 'الاسم', value: `${firstName} ${lastName}` },
                  { label: 'الجوال', value: phone },
                  ...(reason ? [{ label: 'سبب الزيارة', value: reason }] : []),
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-800 font-medium">{value}</span>
                    <span className="text-gray-500 text-sm">{label}</span>
                  </div>
                ))}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 mb-4 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep(3)} className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-medium hover:bg-gray-50">
                  تعديل
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 py-3 rounded-xl bg-teal-500 text-white font-bold hover:bg-teal-600 disabled:opacity-60"
                >
                  {submitting ? 'جاري الحجز...' : '✓ تأكيد الحجز'}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6 pb-8">
          مدعوم بـ نماء للرعاية الصحية
        </p>
      </div>
    </div>
  )
}
