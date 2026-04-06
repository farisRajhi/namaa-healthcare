// ─────────────────────────────────────────────────────────
// Prayer Times Utility
// Approximate prayer time calculation for Saudi Arabia.
// Uses simplified astronomical formulas for Fajr, Dhuhr,
// Asr, Maghrib, and Isha based on Umm al-Qura method.
// ─────────────────────────────────────────────────────────

export interface PrayerTime {
  name: string;
  nameAr: string;
  start: Date;
  end: Date; // Approximate end (next prayer or +30min for Isha)
}

interface Coordinates {
  latitude: number;
  longitude: number;
}

// Major Saudi city coordinates
const CITY_COORDS: Record<string, Coordinates> = {
  riyadh: { latitude: 24.7136, longitude: 46.6753 },
  jeddah: { latitude: 21.4858, longitude: 39.1925 },
  makkah: { latitude: 21.3891, longitude: 39.8579 },
  madinah: { latitude: 24.4672, longitude: 39.6112 },
  dammam: { latitude: 26.4207, longitude: 50.0888 },
  tabuk: { latitude: 28.3838, longitude: 36.5550 },
  abha: { latitude: 18.2164, longitude: 42.5053 },
  default: { latitude: 24.7136, longitude: 46.6753 }, // Riyadh fallback
};

/**
 * Get prayer times for a given date and location.
 * Uses Umm al-Qura method angles (Fajr: 18.5°, Isha: 90min after Maghrib).
 */
export function getPrayerTimes(date: Date, city?: string): PrayerTime[] {
  const coords = CITY_COORDS[city?.toLowerCase() ?? ''] ?? CITY_COORDS.default;
  const { latitude, longitude } = coords;

  // Julian date
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  const jd = julianDate(year, month, day);
  const D = jd - 2451545.0; // Days since J2000.0

  // Sun's position
  const g = (357.529 + 0.98560028 * D) % 360;
  const q = (280.459 + 0.98564736 * D) % 360;
  const gRad = g * Math.PI / 180;
  const L = q + 1.915 * Math.sin(gRad) + 0.020 * Math.sin(2 * gRad);
  const e = 23.439 - 0.00000036 * D;
  const eRad = e * Math.PI / 180;
  const LRad = L * Math.PI / 180;

  let RA = Math.atan2(Math.cos(eRad) * Math.sin(LRad), Math.cos(LRad)) * 180 / Math.PI;
  // Normalize RA to same quadrant as L
  RA = ((RA % 360) + 360) % 360;
  const dec = Math.asin(Math.sin(eRad) * Math.sin(LRad)) * 180 / Math.PI;
  const decRad = dec * Math.PI / 180;
  const latRad = latitude * Math.PI / 180;

  // Equation of time in minutes: difference between mean solar time and apparent solar time
  let eqtDeg = q - RA;
  // Normalize to [-180, 180] range
  while (eqtDeg > 180) eqtDeg -= 360;
  while (eqtDeg < -180) eqtDeg += 360;
  const eqtMinutes = eqtDeg * 4; // 1 degree = 4 minutes of time

  // Dhuhr time (solar noon) in AST hours (UTC+3)
  // Formula: 12:00 - EqT(minutes)/60 - longitude/15 + timezone_offset
  const AST_OFFSET = 3; // Saudi Arabia = UTC+3
  const dhuhrHours = 12 - eqtMinutes / 60 - longitude / 15 + AST_OFFSET;

  // Sunrise & Sunset (sun at -0.833° below horizon)
  const sunAngle = -0.833;
  const cosHA = (Math.sin(sunAngle * Math.PI / 180) - Math.sin(latRad) * Math.sin(decRad)) /
    (Math.cos(latRad) * Math.cos(decRad));
  const HA = Math.acos(Math.min(Math.max(cosHA, -1), 1)) * 180 / Math.PI / 15;

  const sunrise = dhuhrHours - HA;
  const sunset = dhuhrHours + HA;

  // Fajr: sun at -18.5° (Umm al-Qura)
  const fajrAngle = -18.5;
  const cosFajr = (Math.sin(fajrAngle * Math.PI / 180) - Math.sin(latRad) * Math.sin(decRad)) /
    (Math.cos(latRad) * Math.cos(decRad));
  const fajrHA = Math.acos(Math.min(Math.max(cosFajr, -1), 1)) * 180 / Math.PI / 15;
  const fajr = dhuhrHours - fajrHA;

  // Asr: shadow = object length + shadow at noon (Hanafi: 2x, standard: 1x)
  const asrFactor = 1; // Standard method
  const asrAngle = Math.atan(1 / (asrFactor + Math.tan(Math.abs(latRad - decRad))));
  const cosAsr = (Math.sin(asrAngle) - Math.sin(latRad) * Math.sin(decRad)) /
    (Math.cos(latRad) * Math.cos(decRad));
  const asrHA = Math.acos(Math.min(Math.max(cosAsr, -1), 1)) * 180 / Math.PI / 15;
  const asr = dhuhrHours + asrHA;

  // Maghrib = sunset
  const maghrib = sunset;

  // Isha: 90 minutes after Maghrib (Umm al-Qura method)
  const isha = maghrib + 1.5;

  // Convert decimal AST hours to Date objects in UTC
  // Prayer times are computed in AST (UTC+3), store as UTC for comparison with DB timestamps
  const toDate = (h: number): Date => {
    const d = new Date(date);
    const utcH = h - AST_OFFSET; // Convert AST → UTC
    const hours = Math.floor(utcH);
    const minutes = Math.round((utcH - hours) * 60);
    d.setUTCHours(hours, minutes, 0, 0);
    return d;
  };

  const prayerTimes: PrayerTime[] = [
    {
      name: 'Fajr',
      nameAr: 'الفجر',
      start: toDate(fajr),
      end: toDate(sunrise),
    },
    {
      name: 'Dhuhr',
      nameAr: 'الظهر',
      start: toDate(dhuhrHours),
      end: toDate(dhuhrHours + 0.5), // ~30 min prayer window
    },
    {
      name: 'Asr',
      nameAr: 'العصر',
      start: toDate(asr),
      end: toDate(asr + 0.5),
    },
    {
      name: 'Maghrib',
      nameAr: 'المغرب',
      start: toDate(maghrib),
      end: toDate(maghrib + 0.5),
    },
    {
      name: 'Isha',
      nameAr: 'العشاء',
      start: toDate(isha),
      end: toDate(isha + 0.5),
    },
  ];

  return prayerTimes;
}

/**
 * Check if a time range overlaps with any prayer time.
 * Returns the overlapping prayer time if found, null otherwise.
 */
export function findPrayerTimeConflict(
  slotStart: Date,
  slotEnd: Date,
  city?: string,
): PrayerTime | null {
  const prayers = getPrayerTimes(slotStart, city);

  for (const prayer of prayers) {
    // Check overlap
    if (slotStart < prayer.end && slotEnd > prayer.start) {
      return prayer;
    }
  }

  return null;
}

// Julian date calculation
function julianDate(year: number, month: number, day: number): number {
  if (month <= 2) {
    year -= 1;
    month += 12;
  }
  const A = Math.floor(year / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5;
}
