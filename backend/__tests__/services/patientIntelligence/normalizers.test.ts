import { describe, it, expect } from 'vitest';
import {
  parseDate,
  hijriToGregorianApprox,
  daysSince,
  calculateAge,
  normalizePatientRow,
} from '@/services/patientIntelligence/normalizers.js';

describe('parseDate', () => {
  it('should parse ISO format (YYYY-MM-DD)', () => {
    const result = parseDate('2025-06-15');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2025);
    expect(result!.getMonth()).toBe(5); // 0-indexed
    expect(result!.getDate()).toBe(15);
  });

  it('should parse DD/MM/YYYY format', () => {
    const result = parseDate('15/06/2025');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2025);
    expect(result!.getMonth()).toBe(5);
    expect(result!.getDate()).toBe(15);
  });

  it('should parse DD-MM-YYYY format', () => {
    const result = parseDate('15-06-2025');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2025);
    expect(result!.getMonth()).toBe(5);
    expect(result!.getDate()).toBe(15);
  });

  it('should parse DD.MM.YYYY format', () => {
    const result = parseDate('15.06.2025');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2025);
    expect(result!.getMonth()).toBe(5);
    expect(result!.getDate()).toBe(15);
  });

  it('should parse Hijri dates (year > 1400)', () => {
    const result = parseDate('1445/06/15');
    expect(result).toBeInstanceOf(Date);
    // 1445 Hijri ≈ 2023-2024 Gregorian
    expect(result!.getFullYear()).toBeGreaterThanOrEqual(2023);
    expect(result!.getFullYear()).toBeLessThanOrEqual(2024);
  });

  it('should parse Hijri dates in ISO-like format', () => {
    const result = parseDate('1410-05-22');
    expect(result).toBeInstanceOf(Date);
    // 1410 Hijri ≈ 1989-1990 Gregorian
    expect(result!.getFullYear()).toBeGreaterThanOrEqual(1989);
    expect(result!.getFullYear()).toBeLessThanOrEqual(1990);
  });

  it('should return null for undefined', () => {
    expect(parseDate(undefined)).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(parseDate('')).toBeNull();
  });

  it('should return null for whitespace-only string', () => {
    expect(parseDate('   ')).toBeNull();
  });

  it('should trim whitespace before parsing', () => {
    const result = parseDate('  2025-06-15  ');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2025);
  });
});

describe('hijriToGregorianApprox', () => {
  it('should convert 1445/01/01 to approximately 2023', () => {
    const result = hijriToGregorianApprox(1445, 1, 1);
    expect(result.getFullYear()).toBeGreaterThanOrEqual(2023);
    expect(result.getFullYear()).toBeLessThanOrEqual(2024);
  });

  it('should convert 1410/05/22 to approximately 1989-1990', () => {
    const result = hijriToGregorianApprox(1410, 5, 22);
    expect(result.getFullYear()).toBeGreaterThanOrEqual(1989);
    expect(result.getFullYear()).toBeLessThanOrEqual(1990);
  });

  it('should return a valid Date object', () => {
    const result = hijriToGregorianApprox(1440, 6, 15);
    expect(result).toBeInstanceOf(Date);
    expect(isNaN(result.getTime())).toBe(false);
  });
});

describe('daysSince', () => {
  it('should return 0 for today', () => {
    const today = new Date();
    expect(daysSince(today)).toBe(0);
  });

  it('should return correct days for a past date', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 30);
    expect(daysSince(pastDate)).toBe(30);
  });

  it('should return null for null input', () => {
    expect(daysSince(null)).toBeNull();
  });

  it('should return 0 for future dates (clamped)', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    expect(daysSince(futureDate)).toBe(0);
  });
});

describe('calculateAge', () => {
  it('should calculate age correctly for a past date', () => {
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 30);
    dob.setMonth(0, 1); // Jan 1, 30 years ago
    const age = calculateAge(dob);
    expect(age).toBeGreaterThanOrEqual(29);
    expect(age).toBeLessThanOrEqual(30);
  });

  it('should return null for null input', () => {
    expect(calculateAge(null)).toBeNull();
  });

  it('should handle birthday not yet passed this year', () => {
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 25);
    dob.setMonth(11, 31); // Dec 31, 25 years ago
    const age = calculateAge(dob);
    // If today is before Dec 31, age should be 24
    // If today is Dec 31, age should be 25
    expect(age).toBeGreaterThanOrEqual(24);
    expect(age).toBeLessThanOrEqual(25);
  });

  it('should return null for negative age (future dates)', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 5);
    expect(calculateAge(futureDate)).toBeNull();
  });
});

describe('normalizePatientRow', () => {
  const mapping: Record<string, string> = {
    'اسم المريض': 'nameAr',
    'رقم الجوال': 'phone',
    'البريد الإلكتروني': 'email',
    'تاريخ الميلاد': 'dateOfBirth',
    'الجنس': 'sex',
    'تاريخ آخر زيارة': 'lastVisitDate',
    'آخر خدمة': 'lastServiceAr',
    'عدد الزيارات': 'totalVisits',
    'الخدمات': 'services',
    'ملاحظات': 'notes',
    'رقم المريض': 'externalId',
  };

  it('should map Arabic columns to standard fields', () => {
    const row: Record<string, string> = {
      'اسم المريض': 'فاطمة الحربي',
      'رقم الجوال': '0551234567',
      'البريد الإلكتروني': 'fatima@email.com',
      'تاريخ الميلاد': '1985-03-15',
      'الجنس': 'أنثى',
      'تاريخ آخر زيارة': '2025-10-05',
      'آخر خدمة': 'تنظيف الاسنان',
      'عدد الزيارات': '4',
      'الخدمات': 'تنظيف الاسنان, فحص',
      'ملاحظات': 'مريضة منتظمة',
      'رقم المريض': '1001',
    };

    const result = normalizePatientRow(row, mapping);

    expect(result.nameAr).toBe('فاطمة الحربي');
    expect(result.phone).toBe('0551234567');
    expect(result.email).toBe('fatima@email.com');
    expect(result.dateOfBirth).toBeInstanceOf(Date);
    expect(result.sex).toBe('أنثى');
    expect(result.lastVisitDate).toBeInstanceOf(Date);
    expect(result.lastServiceAr).toBe('تنظيف الاسنان');
    expect(result.totalVisits).toBe(4);
    expect(result.externalId).toBe('1001');
  });

  it('should split services on commas', () => {
    const row: Record<string, string> = {
      'الخدمات': 'تنظيف الاسنان, فحص, حشوة',
      'عدد الزيارات': '3',
    };
    const result = normalizePatientRow(row, mapping);
    expect(result.services).toEqual(['تنظيف الاسنان', 'فحص', 'حشوة']);
  });

  it('should split services on Arabic comma (،)', () => {
    const row: Record<string, string> = {
      'الخدمات': 'تنظيف الاسنان، فحص، حشوة',
      'عدد الزيارات': '3',
    };
    const result = normalizePatientRow(row, mapping);
    expect(result.services).toEqual(['تنظيف الاسنان', 'فحص', 'حشوة']);
  });

  it('should split services on semicolons', () => {
    const row: Record<string, string> = {
      'الخدمات': 'تنظيف الاسنان; فحص; حشوة',
      'عدد الزيارات': '2',
    };
    const result = normalizePatientRow(row, mapping);
    expect(result.services).toEqual(['تنظيف الاسنان', 'فحص', 'حشوة']);
  });

  it('should handle missing fields with null', () => {
    const row: Record<string, string> = {
      'اسم المريض': 'محمد',
      'عدد الزيارات': '1',
    };
    const result = normalizePatientRow(row, mapping);
    expect(result.nameAr).toBe('محمد');
    expect(result.phone).toBeNull();
    expect(result.email).toBeNull();
    expect(result.dateOfBirth).toBeNull();
    expect(result.lastVisitDate).toBeNull();
    expect(result.services).toEqual([]);
  });

  it('should default totalVisits to 0 for non-numeric values', () => {
    const row: Record<string, string> = {
      'عدد الزيارات': 'غير معروف',
    };
    const result = normalizePatientRow(row, mapping);
    expect(result.totalVisits).toBe(0);
  });

  it('should ignore unmapped columns', () => {
    const row: Record<string, string> = {
      'اسم المريض': 'أحمد',
      'عمود إضافي': 'قيمة',
      'عدد الزيارات': '2',
    };
    const mappingWithIgnore = {
      ...mapping,
      'عمود إضافي': 'ignore',
    };
    const result = normalizePatientRow(row, mappingWithIgnore);
    expect(result.nameAr).toBe('أحمد');
  });
});
