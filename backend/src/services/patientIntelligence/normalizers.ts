/**
 * Normalizers — Pure utility functions for Patient Intelligence pipeline
 *
 * Extracted from pipelineOrchestrator.ts for testability.
 * Handles date parsing (ISO, DD/MM/YYYY, Hijri), phone normalization,
 * age calculation, and CSV row normalization.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface NormalizedRow {
  name: string | null;
  nameAr: string | null;
  phone: string | null;
  email: string | null;
  dateOfBirth: Date | null;
  sex: string | null;
  lastVisitDate: Date | null;
  lastService: string | null;
  lastServiceAr: string | null;
  totalVisits: number;
  services: string[];
  externalId: string | null;
}

// ── CSV row normalization ──────────────────────────────────────────

/**
 * Normalize a single CSV row using the AI-generated column mapping.
 *
 * @param row     - Raw CSV row as key-value pairs
 * @param mapping - Column mapping: csvColumnName → standardField
 */
export function normalizePatientRow(
  row: Record<string, string>,
  mapping: Record<string, string>,
): NormalizedRow {
  // Build a reverse map: standardField → csvValue
  const fieldValues: Record<string, string> = {};
  for (const [csvCol, standardField] of Object.entries(mapping)) {
    if (standardField !== 'ignore' && row[csvCol]) {
      fieldValues[standardField] = row[csvCol];
    }
  }

  return {
    name: fieldValues.name || null,
    nameAr: fieldValues.nameAr || null,
    phone: fieldValues.phone || null,
    email: fieldValues.email || null,
    dateOfBirth: parseDate(fieldValues.dateOfBirth),
    sex: fieldValues.sex || null,
    lastVisitDate: parseDate(fieldValues.lastVisitDate),
    lastService: fieldValues.lastService || null,
    lastServiceAr: fieldValues.lastServiceAr || null,
    totalVisits: parseInt(fieldValues.totalVisits, 10) || 0,
    services: fieldValues.services
      ? fieldValues.services.split(/[,،;]/).map((s) => s.trim()).filter(Boolean)
      : [],
    externalId: fieldValues.externalId || null,
  };
}

// ── Date parsing ────────────────────────────────────────────────────

/**
 * Parse dates from various formats common in Saudi clinic exports:
 * - YYYY-MM-DD (ISO)
 * - DD/MM/YYYY (common Arabic/European)
 * - DD-MM-YYYY
 * - Hijri approximation: 1445/06/15 (year > 1400 treated as Hijri)
 */
export function parseDate(value: string | undefined): Date | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  // Try ISO format first: YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    // Check if this might be a Hijri date (year > 1400 and < 1500)
    if (year > 1400 && year < 1500) {
      return hijriToGregorianApprox(year, parseInt(isoMatch[2], 10), parseInt(isoMatch[3], 10));
    }
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);

    if (year > 1400 && year < 1500) {
      return hijriToGregorianApprox(year, month, day);
    }

    // months are 0-indexed in JS Date
    const d = new Date(year, month - 1, day);
    return isNaN(d.getTime()) ? null : d;
  }

  // Hijri with slashes: 1445/06/15
  const hijriMatch = trimmed.match(/^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})$/);
  if (hijriMatch) {
    const year = parseInt(hijriMatch[1], 10);
    if (year > 1400 && year < 1500) {
      return hijriToGregorianApprox(year, parseInt(hijriMatch[2], 10), parseInt(hijriMatch[3], 10));
    }
  }

  // Last resort: let JS try to parse it
  const fallback = new Date(trimmed);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Approximate Hijri-to-Gregorian conversion.
 * Not precise (off by ±1-2 days) but sufficient for scoring purposes.
 * Formula: Gregorian year ≈ Hijri year × 0.970229 + 621.564
 */
export function hijriToGregorianApprox(hYear: number, hMonth: number, hDay: number): Date {
  const gYear = Math.round(hYear * 0.970229 + 621.564);
  // Approximate month/day — Hijri months are ~29.5 days
  const dayOfYear = (hMonth - 1) * 29.5 + hDay;
  const gMonth = Math.floor(dayOfYear / 30.44);
  const gDay = Math.round(dayOfYear - gMonth * 30.44);
  const d = new Date(gYear, Math.min(gMonth, 11), Math.max(gDay, 1));
  return isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Calculate days since a given date from today.
 */
export function daysSince(date: Date | null): number | null {
  if (!date) return null;
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

/**
 * Calculate age in years from a date of birth.
 */
export function calculateAge(dob: Date | null): number | null {
  if (!dob) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}
