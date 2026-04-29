// ────────────────────────────────────────────────────────
// PII/PHI Redaction Service
// Section 21 of COMPETITOR_FEATURES_SPEC.md
// ────────────────────────────────────────────────────────

const REDACTED = '[REDACTED]';

// ── Arabic-Indic numeral normalization ──────────────────
// Converts Arabic-Indic numerals (٠١٢٣٤٥٦٧٨٩) to Western (0123456789)
function normalizeArabicNumerals(text: string): string {
  return text.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

// ── Pattern definitions ─────────────────────────────────

interface RedactionRule {
  name: string;
  patterns: RegExp[];
}

const RULES: RedactionRule[] = [
  {
    // Saudi National ID: 10 digits starting with 1 (citizen) or 2 (resident)
    name: 'saudi_national_id',
    patterns: [
      /\b[12]\d{9}\b/g,
    ],
  },
  {
    // Saudi phone numbers: +966XXXXXXXXX or 05XXXXXXXX or 966XXXXXXXXX
    // The 05XXXXXXXX form is anchored to exactly 10 digits so we don't
    // redact appointment times like "05:30 PM" or short durations.
    name: 'phone_number',
    patterns: [
      /\+966\s?\d[\d\s\-]{7,10}/g,
      /\b966\s?\d[\d\s\-]{7,10}/g,
      /\b05[0-9]{8}\b/g,
      // Generic international phone
      /\+\d{1,3}\s?\d[\d\s\-]{8,14}/g,
    ],
  },
  {
    // Date of Birth patterns (various formats)
    name: 'date_of_birth',
    patterns: [
      // "DOB: 01/15/1990" or "تاريخ الميلاد: 1990-01-15"
      /(?:DOB|date of birth|تاريخ الميلاد|تاريخ ميلاد)[:\s]*\d{1,4}[\/-]\d{1,2}[\/-]\d{1,4}/gi,
      // Hijri dates: 14/06/1415
      /(?:DOB|تاريخ الميلاد)[:\s]*\d{1,2}[\/-]\d{1,2}[\/-]\d{4}\s*(?:هـ|H)/gi,
    ],
  },
  {
    // Email addresses
    name: 'email',
    patterns: [
      /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
    ],
  },
  {
    // Medical Record Numbers (MRN)
    name: 'mrn',
    patterns: [
      /\b(?:MRN|Medical Record|رقم الملف الطبي)[:\s#]*[A-Z0-9\-]{4,}\b/gi,
    ],
  },
  {
    // Credit card numbers (basic pattern)
    name: 'credit_card',
    patterns: [
      /\b(?:\d{4}[\s\-]?){3}\d{4}\b/g,
    ],
  },
  {
    // IBAN (Saudi format SA + 22 digits)
    name: 'iban',
    patterns: [
      /\bSA\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/gi,
    ],
  },
  {
    // IP addresses
    name: 'ip_address',
    patterns: [
      /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    ],
  },
];

// ── Medical term patterns for PHI ───────────────────────
// These detect medical conditions/diagnoses that could be PHI when associated with identity

const MEDICAL_CONDITION_PATTERNS: RegExp[] = [
  // English medical conditions
  /\b(?:diagnosed with|suffering from|has|patient has)\s+[A-Za-z\s]{3,30}(?:disease|syndrome|disorder|cancer|diabetes|hypertension|failure)\b/gi,
  // Arabic medical terms
  /\b(?:مصاب بـ?|يعاني من|لديه|لديها)\s+[\u0600-\u06FF\s]{3,40}/g,
  // Lab values with patient context
  /\b(?:HbA1c|glucose|cholesterol|blood pressure|ضغط الدم|سكر الدم)[:\s]*\d+\.?\d*\s*(?:mg|mmol|%|mmHg)?/gi,
];

// ── Core redaction ──────────────────────────────────────

export interface RedactionResult {
  redactedText: string;
  redactionsApplied: {
    type: string;
    originalLength: number;
    position: number;
  }[];
  containsPII: boolean;
}

/**
 * Redact all PII/PHI from the given text.
 * Returns the redacted text plus metadata about what was redacted.
 */
export function redactPII(text: string): RedactionResult {
  // Normalize Arabic-Indic numerals so patterns catch e.g. ٠٥٣١٢٣٤٥٦٧
  let result = normalizeArabicNumerals(text);
  const redactions: RedactionResult['redactionsApplied'] = [];

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      // Reset regex state
      const regex = new RegExp(pattern.source, pattern.flags);
      let match: RegExpExecArray | null;

      // Collect all matches first to avoid mutation during iteration
      const matches: { index: number; length: number; value: string }[] = [];
      while ((match = regex.exec(result)) !== null) {
        matches.push({
          index: match.index,
          length: match[0].length,
          value: match[0],
        });
      }

      // Apply replacements in reverse order to preserve indices
      for (let i = matches.length - 1; i >= 0; i--) {
        const m = matches[i];

        // Skip false positives: very short matches or numbers that are clearly not PII
        if (rule.name === 'credit_card' && m.value.replace(/[\s\-]/g, '').length < 13) continue;
        if (rule.name === 'ip_address' && /^(?:0|127|192\.168|10\.|172\.(?:1[6-9]|2\d|3[01]))/.test(m.value)) {
          // Skip private/localhost IPs — they're not really PII
          continue;
        }

        result =
          result.slice(0, m.index) +
          REDACTED +
          result.slice(m.index + m.length);

        redactions.push({
          type: rule.name,
          originalLength: m.length,
          position: m.index,
        });
      }
    }
  }

  return {
    redactedText: result,
    redactionsApplied: redactions,
    containsPII: redactions.length > 0,
  };
}

/**
 * Redact medical conditions/PHI from text.
 * More aggressive — use for export/logs where medical context shouldn't be present.
 */
export function redactPHI(text: string): RedactionResult {
  // First apply PII redaction
  const piiResult = redactPII(text);
  let result = piiResult.redactedText;
  const redactions = [...piiResult.redactionsApplied];

  for (const pattern of MEDICAL_CONDITION_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    const matches: { index: number; length: number }[] = [];

    while ((match = regex.exec(result)) !== null) {
      matches.push({ index: match.index, length: match[0].length });
    }

    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      result =
        result.slice(0, m.index) +
        REDACTED +
        result.slice(m.index + m.length);

      redactions.push({
        type: 'medical_condition',
        originalLength: m.length,
        position: m.index,
      });
    }
  }

  return {
    redactedText: result,
    redactionsApplied: redactions,
    containsPII: redactions.length > 0,
  };
}

/**
 * Check if text contains PII without redacting.
 * Useful for quick checks/alerts.
 */
export function containsPII(text: string): boolean {
  const normalized = normalizeArabicNumerals(text);
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      if (regex.test(normalized)) return true;
    }
  }
  return false;
}

/**
 * Sanitize an object for export — recursively redact all string values.
 */
export function sanitizeForExport<T extends Record<string, unknown>>(
  obj: T,
  mode: 'pii' | 'phi' = 'phi',
): T {
  const redactFn = mode === 'phi' ? redactPHI : redactPII;

  function sanitizeValue(value: unknown): unknown {
    if (typeof value === 'string') {
      return redactFn(value).redactedText;
    }
    if (Array.isArray(value)) {
      return value.map(sanitizeValue);
    }
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      return sanitizeObject(value as Record<string, unknown>);
    }
    return value;
  }

  function sanitizeObject(o: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(o)) {
      result[key] = sanitizeValue(val);
    }
    return result;
  }

  return sanitizeObject(obj) as T;
}

/**
 * Detect which specific PII types are present in text.
 * Returns a list of detected PII type names.
 */
export function detectPIITypes(text: string): string[] {
  const normalized = normalizeArabicNumerals(text);
  const found: string[] = [];

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      if (regex.test(normalized)) {
        found.push(rule.name);
        break; // Only add once per rule
      }
    }
  }

  // Check medical conditions
  for (const pattern of MEDICAL_CONDITION_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    if (regex.test(text)) {
      found.push('medical_condition');
      break;
    }
  }

  return found;
}
