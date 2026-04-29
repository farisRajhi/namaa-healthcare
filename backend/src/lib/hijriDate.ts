// Hijri (Umm al-Qura) date formatting helpers.
// Saudi clinics often confirm appointments in both Hijri and Gregorian.
// Uses native Intl with the Umm al-Qura calendar — no external deps.

import { RIYADH_TZ } from '../utils/riyadhTime.js';

/**
 * Format a Date as Hijri (Umm al-Qura) in Arabic, e.g. "١ شوال ١٤٤٧".
 */
export function formatHijriDateAr(date: Date): string {
  const formatter = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-arab', {
    timeZone: RIYADH_TZ,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const parts = formatter.formatToParts(date);
  const day = parts.find(p => p.type === 'day')?.value ?? '';
  const month = parts.find(p => p.type === 'month')?.value ?? '';
  const year = parts.find(p => p.type === 'year')?.value ?? '';
  return `${day} ${month} ${year}`;
}

/**
 * Format a Date as Gregorian in Arabic, e.g. "٢٨ أبريل ٢٠٢٦".
 */
export function formatGregorianDateAr(date: Date): string {
  return new Intl.DateTimeFormat('ar-SA', {
    timeZone: RIYADH_TZ,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/**
 * Combined Hijri + Gregorian formatter — a single string suitable for
 * booking confirmations: "الأحد ١ شوال ١٤٤٧ هـ / ٢٨ أبريل ٢٠٢٦".
 */
export function formatBookingDateAr(date: Date): string {
  const weekday = new Intl.DateTimeFormat('ar-SA', {
    timeZone: RIYADH_TZ,
    weekday: 'long',
  }).format(date);
  return `${weekday} ${formatHijriDateAr(date)} هـ / ${formatGregorianDateAr(date)}`;
}
