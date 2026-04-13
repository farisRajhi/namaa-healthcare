/**
 * Patient Analyzer — AI Step 2
 *
 * Processes batches of 25 normalized patients through Gemini to:
 *   1. Score each patient 0–100 for re-engagement likelihood
 *   2. Assign a behavioral segment
 *   3. Suggest an action (recall, offer, reminder, upsell, do_not_contact)
 *   4. Provide Arabic-language reasoning
 *
 * Contact history from the feedback collector is injected so the AI
 * avoids re-recommending recently contacted or DNC patients.
 */
import { geminiJsonChat, type GeminiConfig } from './geminiClient.js';
import type { ContactHistorySummary } from './feedbackCollector.js';
import type { ServiceGap } from './serviceCycleMap.js';

// ── Types ────────────────────────────────────────────────────────────

export interface NormalizedPatient {
  index: number;
  name: string | null;
  lastVisitDate: string | null;
  daysSinceLastVisit: number | null;
  lastService: string | null;
  totalVisits: number;
  services: string[];
  age: number | null;
  sex: string | null;
  /** Pre-computed: patient has ONLY basic services, could be upsold to cosmetic */
  upsellCandidate?: boolean;
  /** Pre-computed: high/medium/low based on visit count + service value */
  lifetimeValue?: 'high' | 'medium' | 'low';
  /** Pre-computed: per-service gap analysis (most urgent first) */
  serviceGaps?: ServiceGap[];
}

export interface PatientAnalysisResult {
  patientIndex: number;
  score: number;        // 0-100
  segment: string;
  reasoning: string;    // Arabic
  suggestedAction: string;
}

interface AIPatientResult {
  patientIndex: number;
  score: number;
  segment: string;
  reasoning: string;
  suggestedAction: string;
}

interface AIBatchResponse {
  patients: AIPatientResult[];
}

// ── Constants ────────────────────────────────────────────────────────

const VALID_SEGMENTS = [
  'overdue_routine',
  'lapsed_long',
  'needs_followup',
  'high_value_inactive',
  'new_patient_dropout',
  'seasonal_candidate',
  'upsell_candidate',
  'do_not_contact',
] as const;

const VALID_ACTIONS = [
  'recall',
  'offer',
  'reminder',
  'upsell',
  'do_not_contact',
] as const;

// ── Prompt builder ───────────────────────────────────────────────────

function buildSystemPrompt(clinicType: string, skillContent: string): string {
  return `You are a patient re-engagement analyst for a ${clinicType} clinic in Saudi Arabia.

Your task is to analyze each patient and determine which SPECIFIC SERVICE they need NOW, based on service cycle data provided.

## DOMAIN KNOWLEDGE
${skillContent}

## CORE CONCEPT: SERVICE-CYCLE-BASED SCORING
Each patient has "Service Gaps" — pre-computed data showing which services they're due or overdue for, based on each service's recommended cycle:
- Cleaning cycle = 6 months. If last cleaning was 8 months ago → 2 months overdue.
- Whitening cycle = 6 months. If last whitening was 3 months ago → NOT overdue.
- Botox cycle = 3 months. If last botox was 4 months ago → 1 month overdue.
- Root canal → needs crown within 30 days. If root canal was 40 days ago → CRITICAL.

**The score represents: "This patient needs THIS service NOW."**
- The patient's score should be driven by their MOST URGENT service gap.
- A patient can be overdue for cleaning (score 70) but not yet due for whitening — the score reflects the most urgent need.

## SCORING RULES
Use the pre-computed "Service Gaps" data. The score comes from the HIGHEST serviceScore in the gaps:
- **critical** (serviceScore 95): One-time procedure needs urgent follow-up (root canal → crown)
- **urgent** (serviceScore 90-95): Service severely overdue (cleaning 10+ months late)
- **overdue** (serviceScore 70-89): Past the recommended cycle
- **due** (serviceScore 50-69): At or near the cycle boundary, time for reminder
- **approaching** (serviceScore 30-49): Getting close, early reminder
- **not_due** (serviceScore 0-25): Not yet time

### Modifiers (apply on top of serviceScore):
- Lifetime value = "high": +10
- Visit count 5+: +5
- Upsell candidate hint: +5
- Single visit only: -5
- Female patient: +3
- DNC: force 0
- Recently contacted <14 days: force 0

## FEEDBACK LOOP RULES (MANDATORY)
1. **DNC**: If marked DNC → score = 0, segment = "do_not_contact", action = "do_not_contact".
2. **Recently contacted (<14 days)**: score = 0. Do not re-contact.
3. **3+ no-answer**: subtract 30 from score.
4. **Previous campaign booker**: +15.
5. **Offer redeemer**: +10, prefer "offer" action.

## SEGMENT SELECTION (use FIRST match)
1. **do_not_contact** — DNC or "لا تتواصل" in data → score 0.
2. **needs_followup** — Most urgent gap is a follow-up (root canal→crown, post-surgery). Status: critical/overdue.
3. **high_value_inactive** — Lifetime value "high" AND most urgent gap is overdue/urgent.
4. **new_patient_dropout** — totalVisits = 1.
5. **seasonal_candidate** — Has cosmetic service gap AND upcoming seasonal event (Eid, Ramadan, summer).
6. **upsell_candidate** — Marked as upsell candidate (only basic services). Suggest cosmetic upgrade.
7. **lapsed_long** — Most urgent gap is "urgent" and patient gone 10+ months with low visit count.
8. **overdue_routine** — Default. Most urgent gap is a routine service (cleaning, checkup) that's due/overdue.

## VALID SEGMENTS
overdue_routine, lapsed_long, needs_followup, high_value_inactive, new_patient_dropout, seasonal_candidate, upsell_candidate, do_not_contact

## VALID ACTIONS
recall — Bring back for the specific overdue service
offer — Send offer tied to the overdue service
reminder — Remind about the specific due service
upsell — Suggest a new service they haven't tried
do_not_contact — Do not reach out

## OUTPUT RULES
- "reasoning" must be 1-2 sentences in Arabic. MUST mention the specific service that's overdue and how long overdue. Example: "المريضة متأخرة عن تنظيف الأسنان بشهرين — حان وقت التذكير"
- Score is an integer 0–100 driven by the most urgent service gap.
- Respond ONLY with a JSON object: { "patients": [ ... ] }
- Each entry: patientIndex, score, segment, reasoning, suggestedAction.`;
}

// ── Contact history formatter ────────────────────────────────────────

function formatContactHistory(history: ContactHistorySummary | null | undefined): string {
  if (!history) return 'No previous contact history.';

  const parts: string[] = [];

  // Explicit status flags first — AI must not miss these
  if (history.isDnc) {
    parts.push('STATUS: DO NOT CONTACT (DNC)');
  }
  if (history.daysSinceLastContact !== null && history.daysSinceLastContact < 14) {
    parts.push('STATUS: RECENTLY CONTACTED — DO NOT RE-CONTACT');
  }

  // Check for repeated no-answer
  if (history.totalAttempts >= 3 && history.lastResult === 'no_answer') {
    parts.push('WARNING: 3+ no-answer attempts — reduce score by 30');
  }

  parts.push(`Campaigns: ${history.totalCampaigns}`);
  parts.push(`Total attempts: ${history.totalAttempts}`);

  if (history.lastContactDate) {
    parts.push(`Last contact: ${history.daysSinceLastContact} days ago (result: ${history.lastResult || 'unknown'})`);
  }
  if (history.offersRedeemed > 0) {
    parts.push(`Offers redeemed: ${history.offersRedeemed} — patient is offer-responsive`);
  }

  return parts.join(' | ');
}

// ── User prompt builder ──────────────────────────────────────────────

function buildUserPrompt(
  patients: NormalizedPatient[],
  contactHistory: Map<number, ContactHistorySummary | null>,
): string {
  const lines = patients.map((p) => {
    const history = contactHistory.get(p.index);
    const contactInfo = formatContactHistory(history);

    // Format service gaps
    const gapLines: string[] = [];
    if (p.serviceGaps && p.serviceGaps.length > 0) {
      for (const g of p.serviceGaps.slice(0, 4)) { // Top 4 most urgent
        const overdue = g.overdueDays > 0 ? `${g.overdueDays} days overdue` : `${Math.abs(g.overdueDays)} days until due`;
        gapLines.push(`${g.serviceEn}(${g.serviceAr}): ${g.status.toUpperCase()} — score ${g.serviceScore}, ${overdue}${g.followUpNeeded ? ` → needs ${g.followUpNeeded}` : ''}`);
      }
    }

    const fields = [
      `#${p.index}`,
      p.age !== null ? `Age: ${p.age}` : null,
      p.sex ? `Sex: ${p.sex}` : null,
      `Total visits: ${p.totalVisits}`,
      p.lifetimeValue ? `Lifetime value: ${p.lifetimeValue}` : null,
      p.lastVisitDate ? `Last visit: ${p.lastVisitDate} (${p.daysSinceLastVisit} days ago)` : null,
      p.services.length > 0 ? `Services history: ${p.services.join(', ')}` : null,
      gapLines.length > 0 ? `SERVICE GAPS:\n    ${gapLines.join('\n    ')}` : 'No service gaps detected',
      p.upsellCandidate ? 'HINT: Patient has ONLY basic services — consider upsell_candidate' : null,
      p.lifetimeValue === 'high' ? 'HINT: High-value patient — consider high_value_inactive' : null,
      `Contact history: ${contactInfo}`,
    ].filter(Boolean);

    return fields.join(' | ');
  });

  const today = new Date().toISOString().split('T')[0];
  return `Today's date is ${today}. Consider proximity to upcoming Eid, Ramadan, or seasonal events when scoring seasonal_candidate.\n\nAnalyze these ${patients.length} patients and return scores, segments, and actions:\n\n${lines.join('\n')}`;
}

// ── Default result for failed/missing entries ────────────────────────

function defaultResult(patientIndex: number): PatientAnalysisResult {
  return {
    patientIndex,
    score: 0,
    segment: 'do_not_contact',
    reasoning: 'تعذّر تحليل بيانات المريض',
    suggestedAction: 'do_not_contact',
  };
}

// ── Main function ────────────────────────────────────────────────────

/**
 * Analyze a batch of up to 25 patients using Gemini.
 *
 * @param geminiConfig   - Gemini API configuration
 * @param patients       - Normalized patient records with index references
 * @param skillContent   - Domain knowledge text from skill loader
 * @param contactHistory - Campaign/contact history keyed by patient index
 * @param clinicType     - Detected clinic specialty
 * @returns Analysis results for each patient in the batch
 */
export async function analyzeBatch(
  geminiConfig: GeminiConfig,
  patients: NormalizedPatient[],
  skillContent: string,
  contactHistory: Map<number, ContactHistorySummary | null>,
  clinicType: string,
): Promise<PatientAnalysisResult[]> {
  if (patients.length === 0) return [];

  const systemPrompt = buildSystemPrompt(clinicType, skillContent);
  const userPrompt = buildUserPrompt(patients, contactHistory);

  try {
    const content = await geminiJsonChat(geminiConfig, {
      systemPrompt,
      userPrompt,
      temperature: 0.2,
      maxOutputTokens: 4096,
    });

    const parsed: AIBatchResponse = JSON.parse(content);

    if (!Array.isArray(parsed.patients)) {
      throw new Error('Response missing "patients" array');
    }

    // Build a lookup for quick access
    const patientIndices = new Set(patients.map((p) => p.index));
    const resultMap = new Map<number, PatientAnalysisResult>();

    for (const entry of parsed.patients) {
      // Skip entries not in our batch
      if (!patientIndices.has(entry.patientIndex)) continue;

      // Validate segment
      const segment = (VALID_SEGMENTS as readonly string[]).includes(entry.segment)
        ? entry.segment
        : 'do_not_contact';

      // Validate action
      const suggestedAction = (VALID_ACTIONS as readonly string[]).includes(entry.suggestedAction)
        ? entry.suggestedAction
        : 'do_not_contact';

      // Validate and clamp score — enforce DNC=0 in code (LLMs sometimes don't comply)
      let score = typeof entry.score === 'number'
        ? Math.max(0, Math.min(100, Math.round(entry.score)))
        : 0;
      if (segment === 'do_not_contact' || suggestedAction === 'do_not_contact') {
        score = 0;
      }

      // Reasoning fallback
      const reasoning = typeof entry.reasoning === 'string' && entry.reasoning.length > 0
        ? entry.reasoning
        : 'لا يتوفر تحليل';

      resultMap.set(entry.patientIndex, {
        patientIndex: entry.patientIndex,
        score,
        segment,
        reasoning,
        suggestedAction,
      });
    }

    // Ensure every input patient has a result (fill gaps with defaults)
    return patients.map((p) => resultMap.get(p.index) || defaultResult(p.index));
  } catch (error) {
    console.error('[PatientAnalyzer] Gemini batch analysis failed:', error);

    // Return safe defaults for all patients in the batch
    return patients.map((p) => defaultResult(p.index));
  }
}
