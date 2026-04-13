/**
 * Saudi Seasonal Calendar
 *
 * Returns a score boost multiplier (1.0-1.2) for services based on
 * Saudi cultural calendar: pre-Eid, Ramadan, wedding season, summer.
 *
 * Eid dates are approximate Gregorian equivalents — update annually.
 */

// ---------------------------------------------------------------------------
// Approximate Eid / Ramadan dates (Gregorian) — update each Hijri year
// These shift ~11 days earlier each Gregorian year.
// Current values are for 1447-1448 AH (2025-2026 Gregorian).
// ---------------------------------------------------------------------------

interface SeasonalWindow {
  /** Start month (1-12) and day */
  startMonth: number;
  startDay: number;
  /** End month (1-12) and day */
  endMonth: number;
  endDay: number;
}

// 2026 approximate dates (Ramadan starts ~Feb 18, Eid al-Fitr ~Mar 20, Eid al-Adha ~May 27)
const EID_FITR_DATE = { month: 3, day: 20 };
const EID_ADHA_DATE = { month: 5, day: 27 };
const RAMADAN_START = { month: 2, day: 18 };

const SEASONAL_WINDOWS: Array<{
  name: string;
  window: SeasonalWindow;
  /** Categories that get boosted */
  categories: string[];
  /** Specific service English names that get boosted (if empty, all in category) */
  serviceNames?: string[];
  boost: number;
}> = [
  // Pre-Eid al-Fitr: 6 weeks before Eid
  {
    name: 'pre_eid_fitr',
    window: {
      startMonth: EID_FITR_DATE.month === 1 ? 11 : EID_FITR_DATE.month - 1,
      startDay: EID_FITR_DATE.day,
      endMonth: EID_FITR_DATE.month,
      endDay: EID_FITR_DATE.day,
    },
    categories: ['cosmetic', 'dental'],
    serviceNames: ['Teeth Whitening', 'Botox', 'Lip Filler', 'Cheek Filler', 'Jawline Filler', 'HydraFacial', 'Chemical Peel'],
    boost: 1.2,
  },
  // Pre-Eid al-Adha: 4 weeks before
  {
    name: 'pre_eid_adha',
    window: {
      startMonth: EID_ADHA_DATE.month - 1,
      startDay: EID_ADHA_DATE.day,
      endMonth: EID_ADHA_DATE.month,
      endDay: EID_ADHA_DATE.day,
    },
    categories: ['dental', 'cosmetic'],
    serviceNames: ['Dental Cleaning', 'Teeth Whitening', 'Botox'],
    boost: 1.15,
  },
  // Pre-Ramadan: 2 weeks before
  {
    name: 'pre_ramadan',
    window: {
      startMonth: RAMADAN_START.month,
      startDay: Math.max(1, RAMADAN_START.day - 14),
      endMonth: RAMADAN_START.month,
      endDay: RAMADAN_START.day,
    },
    categories: ['dental', 'cosmetic'],
    serviceNames: ['Dental Cleaning', 'Botox', 'IV Therapy'],
    boost: 1.15,
  },
  // Summer / wedding season: June-August
  {
    name: 'summer_wedding',
    window: { startMonth: 6, startDay: 1, endMonth: 8, endDay: 31 },
    categories: ['cosmetic', 'dental'],
    serviceNames: ['Teeth Whitening', 'Veneers', 'Botox', 'Lip Filler', 'Cheek Filler', 'Jawline Filler', 'HydraFacial', 'Laser Hair Removal', 'Thread Lift', 'Skin Tightening'],
    boost: 1.1,
  },
];

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Get the seasonal score boost multiplier for a service.
 *
 * @param serviceNameEn English name of the service
 * @param category 'dental' | 'cosmetic' | null
 * @param date Current date (defaults to now)
 * @returns Multiplier (1.0 = no boost, up to 1.2)
 */
export function getSeasonalBoost(
  serviceNameEn: string | null,
  category: string | null,
  date: Date = new Date(),
): number {
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();

  let maxBoost = 1.0;

  for (const seasonal of SEASONAL_WINDOWS) {
    if (!isDateInWindow(month, day, seasonal.window)) continue;

    // Check if this service matches the seasonal window
    const categoryMatch = category && seasonal.categories.includes(category);
    const nameMatch = serviceNameEn && seasonal.serviceNames?.includes(serviceNameEn);

    // If specific service names are listed, require name match. Otherwise, category match.
    if (seasonal.serviceNames && seasonal.serviceNames.length > 0) {
      if (nameMatch) {
        maxBoost = Math.max(maxBoost, seasonal.boost);
      }
    } else if (categoryMatch) {
      maxBoost = Math.max(maxBoost, seasonal.boost);
    }
  }

  return maxBoost;
}

/**
 * Get all currently active seasonal windows (for campaign suggestions).
 */
export function getActiveSeasons(date: Date = new Date()): string[] {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return SEASONAL_WINDOWS
    .filter(s => isDateInWindow(month, day, s.window))
    .map(s => s.name);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isDateInWindow(month: number, day: number, window: SeasonalWindow): boolean {
  const current = month * 100 + day;
  const start = window.startMonth * 100 + window.startDay;
  const end = window.endMonth * 100 + window.endDay;

  if (start <= end) {
    return current >= start && current <= end;
  }
  // Window wraps around year boundary (e.g., Nov-Jan)
  return current >= start || current <= end;
}
