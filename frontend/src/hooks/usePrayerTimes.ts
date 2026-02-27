import { useState, useEffect } from 'react'

interface PrayerTimes {
  Fajr: string
  Sunrise: string
  Dhuhr: string
  Asr: string
  Maghrib: string
  Isha: string
}

interface PrayerTimeSlot {
  name: string
  nameAr: string
  start: string
  end: string
}

export function usePrayerTimes(date: string, city: string = 'Riyadh') {
  const [prayerTimes, setPrayerTimes] = useState<PrayerTimeSlot[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!date) return

    const fetchPrayers = async () => {
      setLoading(true)
      try {
        const d = new Date(date)
        const formatted = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`

        const res = await fetch(
          `https://api.aladhan.com/v1/timingsByCity/${formatted}?city=${encodeURIComponent(city)}&country=SA&method=4`
        )
        const data = await res.json()

        if (data.code === 200 && data.data?.timings) {
          const t = data.data.timings as PrayerTimes

          const addMinutes = (time: string, min: number): string => {
            const [h, m] = time.split(':').map(Number)
            const total = h * 60 + m + min
            return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
          }

          setPrayerTimes([
            { name: 'Fajr', nameAr: '?????', start: t.Fajr.split(' ')[0], end: addMinutes(t.Fajr.split(' ')[0], 30) },
            { name: 'Dhuhr', nameAr: '?????', start: t.Dhuhr.split(' ')[0], end: addMinutes(t.Dhuhr.split(' ')[0], 30) },
            { name: 'Asr', nameAr: '?????', start: t.Asr.split(' ')[0], end: addMinutes(t.Asr.split(' ')[0], 30) },
            { name: 'Maghrib', nameAr: '??????', start: t.Maghrib.split(' ')[0], end: addMinutes(t.Maghrib.split(' ')[0], 30) },
            { name: 'Isha', nameAr: '??????', start: t.Isha.split(' ')[0], end: addMinutes(t.Isha.split(' ')[0], 30) },
          ])
        }
      } catch {
        setPrayerTimes(null)
      } finally {
        setLoading(false)
      }
    }

    fetchPrayers()
  }, [date, city])

  const isDuringPrayer = (time: string): PrayerTimeSlot | null => {
    if (!prayerTimes) return null
    return prayerTimes.find(p => time >= p.start && time < p.end) || null
  }

  return { prayerTimes, loading, isDuringPrayer }
}
