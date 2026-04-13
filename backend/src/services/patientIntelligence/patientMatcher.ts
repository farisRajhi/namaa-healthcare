/**
 * Patient Matcher
 *
 * Matches external CSV patients to existing Patient records by phone number.
 * Uses E.164 normalization for reliable matching.
 */
import { PrismaClient } from '@prisma/client';

export interface MatchResult {
  patientId: string;
  confidence: number;
}

/**
 * Normalize a phone number to a comparable format.
 * Handles Saudi formats: 05x, +966, 966, 00966
 */
function normalizePhone(phone: string): string | null {
  if (!phone) return null;

  // Strip all non-digit characters
  let digits = phone.replace(/[^\d+]/g, '').replace(/^\+/, '');

  // Remove leading 00
  if (digits.startsWith('00')) digits = digits.slice(2);

  // Saudi number starting with 05 → add country code
  if (digits.startsWith('05') && digits.length === 10) {
    digits = '966' + digits.slice(1);
  }

  // Must be 12 digits for Saudi (966 + 9 digits)
  if (digits.startsWith('966') && digits.length === 12) {
    return digits;
  }

  // Return whatever we have for non-Saudi numbers
  return digits.length >= 8 ? digits : null;
}

/**
 * Match a batch of external patients to existing Patient records by phone.
 * Returns a map of externalPatientId → { patientId, confidence }.
 */
export async function matchPatientsByPhone(
  prisma: PrismaClient,
  orgId: string,
  externalPatients: { externalPatientId: string; phone: string | null }[],
): Promise<Map<string, MatchResult>> {
  const results = new Map<string, MatchResult>();

  // Collect normalized phones
  const phoneMap = new Map<string, string[]>(); // normalized → externalPatientIds
  for (const ep of externalPatients) {
    if (!ep.phone) continue;
    const normalized = normalizePhone(ep.phone);
    if (!normalized) continue;

    const existing = phoneMap.get(normalized) || [];
    existing.push(ep.externalPatientId);
    phoneMap.set(normalized, existing);
  }

  if (phoneMap.size === 0) return results;

  // Query all existing patient contacts for this org
  const normalizedPhones = Array.from(phoneMap.keys());

  // Build search patterns — we need to check both formats
  const searchPatterns: string[] = [];
  for (const phone of normalizedPhones) {
    searchPatterns.push(phone);
    // Also search with + prefix
    searchPatterns.push('+' + phone);
    // Also search with 0 prefix (local format)
    if (phone.startsWith('966')) {
      searchPatterns.push('0' + phone.slice(3));
    }
  }

  const contacts = await prisma.patientContact.findMany({
    where: {
      patient: { orgId },
      contactType: 'phone',
      contactValue: { in: searchPatterns },
    },
    select: {
      contactValue: true,
      patientId: true,
    },
  });

  // Map found contacts back to external patients
  for (const contact of contacts) {
    const contactNormalized = normalizePhone(contact.contactValue);
    if (!contactNormalized) continue;

    const externalIds = phoneMap.get(contactNormalized);
    if (!externalIds) continue;

    for (const externalId of externalIds) {
      results.set(externalId, {
        patientId: contact.patientId,
        confidence: 0.95, // Phone match is high confidence
      });
    }
  }

  return results;
}
