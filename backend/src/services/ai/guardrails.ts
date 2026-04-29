import { PrismaClient } from '@prisma/client';

// ────────────────────────────────────────────────────────
// Responsible AI Safeguards — Guardrails
// Section 23 of COMPETITOR_FEATURES_SPEC.md
// ────────────────────────────────────────────────────────

// ── Scope Boundaries ────────────────────────────────────

export const ALLOWED_ACTIONS = [
  'appointment_scheduling',
  'appointment_rescheduling',
  'appointment_cancellation',
  'faq_answering',
  'physician_search',
  'facility_directions',
  'operating_hours',
  'insurance_general_info',
  'portal_help',
  'transfer_to_human',
  'greeting_farewell',
] as const;

export const NOT_ALLOWED_ACTIONS = [
  'medical_diagnosis',
  'treatment_recommendation',
  'medication_dosage_advice',
  'test_result_interpretation',
  'prognosis_prediction',
  'mental_health_counseling',
  'emergency_triage_advice',
  'insurance_claim_adjudication',
  'legal_advice',
  'financial_advice',
] as const;

export type AllowedAction = (typeof ALLOWED_ACTIONS)[number];
export type NotAllowedAction = (typeof NOT_ALLOWED_ACTIONS)[number];

// ── Types ───────────────────────────────────────────────

export interface GuardrailResult {
  approved: boolean;
  confidence: number; // 0-1
  flags: GuardrailFlag[];
  sanitizedResponse: string | null; // null means use original, string means use this instead
}

export interface GuardrailFlag {
  type: 'hallucination' | 'medical_claim' | 'scope_violation' | 'wrong_patient' | 'low_confidence' | 'pii_leak';
  severity: 'block' | 'warn';
  description: string;
}

export interface ValidationContext {
  orgId: string;
  conversationId?: string;
  patientId?: string;
  userMessage: string;
  aiResponse: string;
  knowledgeBaseHits?: string[];  // RAG/FAQ matches used to generate the response
  dbEntitiesReferenced?: {       // Entities the AI claims to reference
    providerNames?: string[];
    serviceNames?: string[];
    facilityNames?: string[];
    appointmentIds?: string[];
  };
}

// ── Medical Claim Detection ─────────────────────────────

const MEDICAL_CLAIM_PATTERNS: { pattern: RegExp; description: string }[] = [
  {
    pattern: /\b(?:you (?:have|likely have|probably have|might have|seem to have)|(?:it (?:sounds|looks|seems) like(?: you have)?))\s+[A-Za-z\s]+(?:disease|syndrome|disorder|infection|condition|cancer|deficiency)\b/i,
    description: 'Appears to diagnose a medical condition',
  },
  {
    pattern: /\b(?:I (?:recommend|suggest|advise)(?: you)?|you should)\s+(?:take|start|stop|increase|decrease|try)\s+[A-Za-z\s]+(?:mg|ml|tablet|capsule|injection|dose)\b/i,
    description: 'Appears to give medication dosage/treatment advice',
  },
  {
    pattern: /\b(?:your (?:results|labs|blood work|x-ray|scan|MRI|CT|test) (?:shows?|indicates?|suggests?|reveals?))\b/i,
    description: 'Appears to interpret test/lab results',
  },
  {
    pattern: /\b(?:prognosis|life expectancy|survival rate|chance of recovery|you will (?:recover|get better|get worse))\b/i,
    description: 'Appears to make a prognosis',
  },
  {
    pattern: /(?:أنت مصاب|عندك مرض|تحتاج دواء|خذ حبة|الجرعة المناسبة|نتائجك تدل على|التشخيص هو)/,
    description: 'Arabic medical claim detected (MSA)',
  },
  {
    pattern: /(?:عندك|فيك)\s+(?:سكر|ضغط|كوليسترول|أنيميا|حساسية|التهاب|فايروس|ورم)/,
    description: 'Arabic diagnosis pattern (Gulf dialect)',
  },
  {
    pattern: /(?:خذ|اشرب|استخدم)\s+(?:حبة|حبتين|جرعة|ملعقة|إبرة)\s+(?:من|كل)/,
    description: 'Arabic medication dosage advice (Gulf dialect)',
  },
  {
    pattern: /(?:التحليل|الفحص|الأشعة)\s+(?:يبين|يدل|يوضح|يقول|طلع)/,
    description: 'Arabic test result interpretation (Gulf dialect)',
  },
  {
    pattern: /(?:لا تخاف|شي بسيط|ما فيها شي|ما عليك شي|شيء بسيط)/,
    description: 'Arabic minimization of medical concern (Gulf dialect)',
  },
  {
    pattern: /(?:أنصحك|انصحك|نصيحتي)\s+(?:تاخذ|تستخدم|تشرب|توقف|تترك)/,
    description: 'Arabic treatment recommendation (Gulf dialect)',
  },
  {
    pattern: /\b(?:don't (?:worry|panic)|it's nothing serious|it's just|this is normal|this is not serious)\b/i,
    description: 'Minimizes medical concern without qualification',
  },
];

/**
 * Detect medical claims in AI response.
 */
function detectMedicalClaims(text: string): GuardrailFlag[] {
  const flags: GuardrailFlag[] = [];

  for (const { pattern, description } of MEDICAL_CLAIM_PATTERNS) {
    if (pattern.test(text)) {
      flags.push({
        type: 'medical_claim',
        severity: 'block',
        description,
      });
    }
  }

  return flags;
}

// ── Hallucination Detection ─────────────────────────────

const FABRICATION_PATTERNS = [
  // Invented phone numbers / extensions
  /\b(?:call|reach|phone|contact)\s+(?:us\s+)?(?:at\s+)?\d{3,4}[\s\-]?\d{3,4}\b/i,
  // Invented URLs
  /\b(?:visit|go to|check)\s+(?:our\s+)?(?:website\s+)?(?:at\s+)?(?:www\.)?[a-z]+\.[a-z]{2,}/i,
  // Confident-sounding but vague claims
  /\b(?:studies show|research proves|it is proven|experts agree|according to research)\b/i,
];

/**
 * Check if AI response references data that doesn't exist in the org's database.
 */
async function checkForHallucinations(
  prisma: PrismaClient,
  context: ValidationContext,
): Promise<GuardrailFlag[]> {
  const flags: GuardrailFlag[] = [];
  const { orgId, aiResponse, dbEntitiesReferenced } = context;

  // Check fabrication patterns
  for (const pattern of FABRICATION_PATTERNS) {
    if (pattern.test(aiResponse)) {
      flags.push({
        type: 'hallucination',
        severity: 'warn',
        description: 'Response may contain fabricated information (phone/URL/claim)',
      });
      break;
    }
  }

  // Validate referenced providers exist in the org
  if (dbEntitiesReferenced?.providerNames?.length) {
    const realProviders = await prisma.provider.findMany({
      where: { orgId, active: true },
      select: { displayName: true },
    });
    const realNames = new Set(realProviders.map((p) => p.displayName.toLowerCase()));

    for (const name of dbEntitiesReferenced.providerNames) {
      if (!realNames.has(name.toLowerCase())) {
        flags.push({
          type: 'hallucination',
          severity: 'block',
          description: `Referenced provider "${name}" does not exist in organization`,
        });
      }
    }
  }

  // Validate referenced services
  if (dbEntitiesReferenced?.serviceNames?.length) {
    const realServices = await prisma.service.findMany({
      where: { orgId, active: true },
      select: { name: true },
    });
    const realNames = new Set(realServices.map((s) => s.name.toLowerCase()));

    for (const name of dbEntitiesReferenced.serviceNames) {
      if (!realNames.has(name.toLowerCase())) {
        flags.push({
          type: 'hallucination',
          severity: 'warn',
          description: `Referenced service "${name}" may not exist in organization`,
        });
      }
    }
  }

  // Validate referenced facilities
  if (dbEntitiesReferenced?.facilityNames?.length) {
    const realFacilities = await prisma.facility.findMany({
      where: { orgId },
      select: { name: true },
    });
    const realNames = new Set(realFacilities.map((f) => f.name.toLowerCase()));

    for (const name of dbEntitiesReferenced.facilityNames) {
      if (!realNames.has(name.toLowerCase())) {
        flags.push({
          type: 'hallucination',
          severity: 'block',
          description: `Referenced facility "${name}" does not exist in organization`,
        });
      }
    }
  }

  return flags;
}

// ── Wrong Patient Check ─────────────────────────────────

/**
 * Ensure the AI response doesn't contain data from a different patient.
 * Checks if any patient names/IDs in the response don't match the current patient.
 */
async function checkWrongPatient(
  prisma: PrismaClient,
  context: ValidationContext,
): Promise<GuardrailFlag[]> {
  const flags: GuardrailFlag[] = [];

  if (!context.patientId) return flags;

  const patient = await prisma.patient.findFirst({
    where: { patientId: context.patientId, orgId: context.orgId },
    select: { firstName: true, lastName: true, mrn: true },
  });

  if (!patient) return flags;

  // Check if the response mentions other patient MRNs
  // This is a safety check — AI shouldn't be leaking other patients' data
  const mrnPattern = /\bMRN[:\s#]*([A-Z0-9\-]{4,})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = mrnPattern.exec(context.aiResponse)) !== null) {
    const mentionedMrn = match[1];
    if (patient.mrn && mentionedMrn !== patient.mrn) {
      flags.push({
        type: 'wrong_patient',
        severity: 'block',
        description: 'Response contains MRN that does not match the current patient',
      });
    }
  }

  return flags;
}

// ── PII Leak Check ──────────────────────────────────────

const PII_IN_RESPONSE_PATTERNS = [
  /\b[12]\d{9}\b/, // Saudi National ID
  /\+966\d{8,9}/, // Saudi phone
];

function checkPIILeak(response: string): GuardrailFlag[] {
  const flags: GuardrailFlag[] = [];

  for (const pattern of PII_IN_RESPONSE_PATTERNS) {
    if (pattern.test(response)) {
      flags.push({
        type: 'pii_leak',
        severity: 'block',
        description: 'AI response may contain PII (National ID or phone number)',
      });
      break;
    }
  }

  return flags;
}

// ── Confidence Scoring ──────────────────────────────────

/**
 * Compute a confidence score (0-1) for the AI response.
 * Based on: hedging language, knowledge base coverage, response specificity.
 */
function computeConfidence(
  response: string,
  knowledgeBaseHits?: string[],
): number {
  let confidence = 0.8; // baseline

  // Penalize hedging language
  const hedgePatterns = [
    /\b(?:I think|I believe|maybe|perhaps|possibly|not sure|I'm not certain|ربما|أعتقد|غير متأكد)\b/gi,
  ];
  for (const pattern of hedgePatterns) {
    const matches = response.match(pattern);
    if (matches) {
      confidence -= Math.min(matches.length * 0.1, 0.3);
    }
  }

  // Penalize "I don't know" type responses
  const unknownPatterns = [
    /\b(?:I don't know|I'm not sure|I cannot find|no information|لا أعرف|لا أملك معلومات)\b/i,
  ];
  for (const pattern of unknownPatterns) {
    if (pattern.test(response)) {
      confidence -= 0.3;
    }
  }

  // Boost if knowledge base provided matches
  if (knowledgeBaseHits && knowledgeBaseHits.length > 0) {
    confidence += Math.min(knowledgeBaseHits.length * 0.05, 0.15);
  }

  // Penalize very short responses (likely unhelpful)
  if (response.length < 30) {
    confidence -= 0.1;
  }

  // Penalize very long responses (potential hallucination)
  if (response.length > 2000) {
    confidence -= 0.05;
  }

  return Math.max(0, Math.min(1, Math.round(confidence * 100) / 100));
}

// ── Scope Check ─────────────────────────────────────────

const SCOPE_VIOLATION_PATTERNS: { pattern: RegExp; action: NotAllowedAction }[] = [
  { pattern: /\b(?:your diagnosis|diagnosed with|the diagnosis is)\b/i, action: 'medical_diagnosis' },
  { pattern: /\b(?:I recommend|you should take|start (?:taking|using))\b/i, action: 'treatment_recommendation' },
  { pattern: /\b(?:dosage|take \d+ (?:mg|ml|pills?|tablets?))\b/i, action: 'medication_dosage_advice' },
  { pattern: /\b(?:your results (?:show|indicate|mean)|this means)\b/i, action: 'test_result_interpretation' },
  { pattern: /\b(?:recovery time|prognosis|survival)\b/i, action: 'prognosis_prediction' },
];

function checkScopeViolations(response: string): GuardrailFlag[] {
  const flags: GuardrailFlag[] = [];

  for (const { pattern, action } of SCOPE_VIOLATION_PATTERNS) {
    if (pattern.test(response)) {
      flags.push({
        type: 'scope_violation',
        severity: 'block',
        description: `Out of scope: ${action}`,
      });
    }
  }

  return flags;
}

// ── Safe Response Templates ─────────────────────────────

const SAFE_RESPONSES: Record<string, { en: string; ar: string }> = {
  medical_claim: {
    en: "I'm not qualified to provide medical advice. I'd be happy to schedule an appointment with a doctor who can help you with that. Would you like me to find an available appointment?",
    ar: 'الاستشارات الطبية ترجع للدكتور — أنا أقدر أحجزلك موعد فقط. تبغى أشوف لك أقرب موعد متاح؟',
  },
  low_confidence: {
    en: "I'm not entirely sure about that. Let me connect you with someone who can give you a more accurate answer. One moment please.",
    ar: 'ما أكدت من هالنقطة — خليني أحوّلك لأحد يساعدك أكثر، لحظة عليّ.',
  },
  hallucination: {
    en: "I want to make sure I give you accurate information. Let me verify that for you — could you hold for a moment?",
    ar: 'أبغى أعطيك معلومة دقيقة، خليني أتأكد من المعلومة الأول — لحظة عليّ.',
  },
};

// ── Main Guardrails Service ─────────────────────────────

export class GuardrailsService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Validate an AI response before sending it to the patient.
   * This is the main entry point — call this after generating every AI response.
   */
  async validateResponse(context: ValidationContext): Promise<GuardrailResult> {
    const allFlags: GuardrailFlag[] = [];

    // 1. Medical claim detection
    const medicalFlags = detectMedicalClaims(context.aiResponse);
    allFlags.push(...medicalFlags);

    // 2. Hallucination detection
    const hallucinationFlags = await checkForHallucinations(this.prisma, context);
    allFlags.push(...hallucinationFlags);

    // 3. Wrong patient check
    const wrongPatientFlags = await checkWrongPatient(this.prisma, context);
    allFlags.push(...wrongPatientFlags);

    // 4. PII leak check
    const piiFlags = checkPIILeak(context.aiResponse);
    allFlags.push(...piiFlags);

    // 5. Scope violation check
    const scopeFlags = checkScopeViolations(context.aiResponse);
    allFlags.push(...scopeFlags);

    // 6. Confidence scoring
    const confidence = computeConfidence(context.aiResponse, context.knowledgeBaseHits);
    if (confidence < 0.3) {
      allFlags.push({
        type: 'low_confidence',
        severity: 'block',
        description: `Very low confidence (${confidence}). Response likely unhelpful.`,
      });
    } else if (confidence < 0.6) {
      allFlags.push({
        type: 'low_confidence',
        severity: 'warn',
        description: `Low confidence (${confidence}). Consider transferring to human.`,
      });
    }

    // Determine if we should block
    const hasBlockingFlag = allFlags.some((f) => f.severity === 'block');
    const approved = !hasBlockingFlag;

    // Generate safe replacement if blocked
    let sanitizedResponse: string | null = null;
    if (!approved) {
      const blockTypes = allFlags.filter((f) => f.severity === 'block').map((f) => f.type);
      // Detect language from user message for appropriate response
      const isArabic = /[\u0600-\u06FF]/.test(context.userMessage);

      if (blockTypes.includes('medical_claim') || blockTypes.includes('scope_violation')) {
        sanitizedResponse = isArabic
          ? SAFE_RESPONSES.medical_claim.ar
          : SAFE_RESPONSES.medical_claim.en;
      } else if (blockTypes.includes('low_confidence')) {
        sanitizedResponse = isArabic
          ? SAFE_RESPONSES.low_confidence.ar
          : SAFE_RESPONSES.low_confidence.en;
      } else {
        sanitizedResponse = isArabic
          ? SAFE_RESPONSES.hallucination.ar
          : SAFE_RESPONSES.hallucination.en;
      }
    }

    return {
      approved,
      confidence,
      flags: allFlags,
      sanitizedResponse,
    };
  }

  /**
   * Quick check — is this response within allowed scope?
   */
  isWithinScope(response: string): boolean {
    return checkScopeViolations(response).length === 0 &&
           detectMedicalClaims(response).length === 0;
  }

  /**
   * Get confidence score only (lightweight check).
   */
  getConfidence(response: string, knowledgeBaseHits?: string[]): number {
    return computeConfidence(response, knowledgeBaseHits);
  }
}

/**
 * Quick scope/medical-claim check for intermediate assistant turns inside the
 * tool loop. Runs only the synchronous regex checks (scope + medical claims) —
 * the full validateResponse pipeline runs against the final reply.
 *
 * Returns { violation: true, reason } when the text crosses the line so the
 * caller can break out of the loop and surface a safe response.
 */
export function validateIntermediate(
  text: string,
  language: 'ar' | 'en' = 'ar',
): { violation: boolean; reason?: string; safeResponse?: string } {
  if (!text || !text.trim()) return { violation: false };

  const flags = [
    ...checkScopeViolations(text),
    ...detectMedicalClaims(text),
  ].filter(f => f.severity === 'block');

  if (flags.length === 0) return { violation: false };

  const safe = language === 'ar'
    ? SAFE_RESPONSES.medical_claim.ar
    : SAFE_RESPONSES.medical_claim.en;

  return {
    violation: true,
    reason: flags.map(f => f.description).join('; '),
    safeResponse: safe,
  };
}
