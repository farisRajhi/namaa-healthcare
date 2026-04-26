// ────────────────────────────────────────────────────────
// Patient Name Validator
// Rejects greetings, fillers, and obvious non-names so the
// LLM (or any other caller) cannot save them as a real name.
// ────────────────────────────────────────────────────────

export type NameValidationResult =
  | { ok: true }
  | { ok: false; reason: 'too_short' | 'invalid_chars' | 'greeting' | 'filler' };

// Strip Arabic diacritics (tashkeel U+064B–U+065F) and tatweel (U+0640)
// so "السَّلام" and "السلام" compare equal.
function normalizeArabic(s: string): string {
  return s.replace(/[\u064B-\u065F\u0640]/g, '');
}

function normalizeToken(s: string): string {
  return normalizeArabic(s.trim().toLowerCase());
}

const GREETING_TOKENS = new Set<string>([
  // Arabic greetings / responses / time-of-day
  'السلام', 'سلام', 'عليكم', 'وعليكم', 'مرحبا', 'مرحبًا', 'أهلا', 'أهلاً', 'اهلا',
  'هلا', 'حياك', 'صباح', 'مساء', 'الخير', 'النور',
  // Filler / affirmation / thanks
  'نعم', 'لا', 'تمام', 'طيب', 'زين', 'أوكي', 'اوكي', 'شكرا', 'شكرًا',
  'الله', 'يعطيك', 'العافية',
  // English
  'hi', 'hello', 'hey', 'ok', 'okay', 'yes', 'no', 'thanks', 'thank',
  'bye', 'peace',
]);

const GREETING_PHRASES = new Set<string>([
  'السلام عليكم',
  'وعليكم السلام',
  'صباح الخير',
  'مساء الخير',
  'حياك الله',
  'اهلا وسهلا',
  'أهلا وسهلا',
]);

// Reject names containing digits or punctuation that real names never contain.
const INVALID_CHAR_RE = /[0-9٠-٩@#!?؟/\\<>{}\[\]()=+*&^%$~`|]/;

export function validatePatientName(
  firstName: unknown,
  lastName: unknown,
): NameValidationResult {
  if (typeof firstName !== 'string' || typeof lastName !== 'string') {
    return { ok: false, reason: 'invalid_chars' };
  }

  const fnTrim = firstName.trim();
  const lnTrim = lastName.trim();

  if (fnTrim.length < 2 || lnTrim.length < 2) {
    return { ok: false, reason: 'too_short' };
  }

  if (INVALID_CHAR_RE.test(fnTrim) || INVALID_CHAR_RE.test(lnTrim)) {
    return { ok: false, reason: 'invalid_chars' };
  }

  const fnNorm = normalizeToken(fnTrim);
  const lnNorm = normalizeToken(lnTrim);
  const combined = `${fnNorm} ${lnNorm}`;

  if (GREETING_PHRASES.has(combined)) {
    return { ok: false, reason: 'greeting' };
  }

  if (GREETING_TOKENS.has(fnNorm) || GREETING_TOKENS.has(lnNorm)) {
    return { ok: false, reason: 'greeting' };
  }

  return { ok: true };
}
