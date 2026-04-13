/**
 * Riyadh timezone helpers for Tawafud.
 * Uses native Intl APIs — no external dependencies.
 * Asia/Riyadh is UTC+3 year-round (no DST).
 */

export const RIYADH_TZ = 'Asia/Riyadh';

/** Get the Riyadh UTC offset in milliseconds for a given instant. */
function getRiyadhOffsetMs(instant: Date): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: RIYADH_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(instant);
  const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value ?? '0', 10);
  const h = get('hour') === 24 ? 0 : get('hour'); // midnight edge case
  const riyadhAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), h, get('minute'), get('second'));
  return riyadhAsUtc - instant.getTime();
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Get current date/time components in Riyadh timezone. */
export function riyadhNow(): {
  dateStr: string;    // 'YYYY-MM-DD'
  timeStr: string;    // 'HH:MM'
  dayOfWeek: number;  // 0=Sunday … 6=Saturday
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: RIYADH_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';

  const year = parseInt(get('year'), 10);
  const month = parseInt(get('month'), 10);
  const day = parseInt(get('day'), 10);
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0;
  const minute = parseInt(get('minute'), 10);
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const dayOfWeek = WEEKDAY_MAP[get('weekday')] ?? now.getDay();

  return { dateStr, timeStr, dayOfWeek, year, month, day, hour, minute };
}

/**
 * Parse a Riyadh local date + time into a UTC Date.
 * @param date 'YYYY-MM-DD'
 * @param time 'HH:MM'
 */
export function riyadhToUtc(date: string, time: string): Date {
  const offsetMs = getRiyadhOffsetMs(new Date(`${date}T12:00:00Z`));
  const offsetSign = offsetMs >= 0 ? '+' : '-';
  const absMs = Math.abs(offsetMs);
  const offH = String(Math.floor(absMs / 3600000)).padStart(2, '0');
  const offM = String(Math.floor((absMs % 3600000) / 60000)).padStart(2, '0');
  return new Date(`${date}T${time}:00${offsetSign}${offH}:${offM}`);
}

/** 00:00 Riyadh on the given date, as a UTC Date. */
export function riyadhMidnight(dateStr: string): Date {
  return riyadhToUtc(dateStr, '00:00');
}

/** Specific hour:minute in Riyadh on the given date, as a UTC Date. */
export function riyadhDateWithTime(dateStr: string, h: number, m: number): Date {
  const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return riyadhToUtc(dateStr, time);
}

/** Get the day-of-week (0=Sunday) in Riyadh for a date string. */
export function riyadhDayOfWeek(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: RIYADH_TZ,
    weekday: 'short',
  }).formatToParts(d);
  const wd = parts.find(p => p.type === 'weekday')?.value ?? '';
  return WEEKDAY_MAP[wd] ?? d.getDay();
}

/** Convert a UTC Date to Riyadh date string 'YYYY-MM-DD'. */
export function utcToRiyadhDateStr(utcDate: Date): string {
  return utcDate.toLocaleDateString('en-CA', { timeZone: RIYADH_TZ });
}
