import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date))
}

export function formatTime(date: string | Date) {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

// Hijri date formatting (Umm al-Qura calendar used in Saudi Arabia)
export function formatHijriDate(date: string | Date): string {
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(date))
  } catch {
    return ''
  }
}

// Combined Gregorian + Hijri display
export function formatDateWithHijri(date: string | Date, locale: string = 'en'): string {
  const d = new Date(date)
  if (isNaN(d.getTime())) return '\u2014'

  const gregorian =
    locale === 'ar'
      ? new Intl.DateTimeFormat('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }).format(d)
      : new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(d)

  const hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d)

  return `${gregorian} / ${hijri}`
}

// Locale-aware date (Gregorian only, respects AR/EN)
export function formatDateLocale(date: string | Date, locale: string = 'en'): string {
  const d = new Date(date)
  if (isNaN(d.getTime())) return '\u2014'
  const loc = locale === 'ar' ? 'ar-SA' : 'en-US'
  return new Intl.DateTimeFormat(loc, { year: 'numeric', month: 'short', day: 'numeric' }).format(d)
}

// Locale-aware time
export function formatTimeLocale(date: string | Date, locale: string = 'en'): string {
  const d = new Date(date)
  if (isNaN(d.getTime())) return '\u2014'
  const loc = locale === 'ar' ? 'ar-SA' : 'en-US'
  return new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit' }).format(d)
}
