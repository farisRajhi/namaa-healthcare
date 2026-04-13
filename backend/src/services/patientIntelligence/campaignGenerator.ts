/**
 * Campaign Generator — AI Step 3
 *
 * Takes segment summaries from patient analysis and generates 3-7 campaign
 * suggestions with bilingual (Arabic + English) message scripts.
 *
 * Each campaign includes channel recommendations, offer suggestions,
 * priority scoring, and culturally appropriate messaging for Saudi clinics.
 */
import { geminiJsonChat, type GeminiConfig } from './geminiClient.js';

// ── Types ────────────────────────────────────────────────────────────

export interface SegmentSummary {
  segment: string;
  patientCount: number;
  avgScore: number;
  topServices: string[];
  sampleReasonings: string[];
}

export interface GeneratedCampaign {
  name: string;
  nameAr: string;
  type: string;                   // recall, preventive, follow_up, promotional
  segment: string;
  segmentDescAr: string;
  segmentDescEn: string;
  scriptAr: string;
  scriptEn: string;
  channelSequence: string[];
  suggestedOfferType: string | null;
  suggestedDiscount: number | null;
  reasoning: string;
  reasoningAr: string;
  expectedOutcome: string;
  priority: number;               // 1-100
  confidenceScore: number;        // 0-1
}

interface AIResponse {
  campaigns: GeneratedCampaign[];
}

const VALID_TYPES = ['recall', 'preventive', 'follow_up', 'promotional', 're_engagement'] as const;
const VALID_CHANNELS = ['whatsapp', 'sms'] as const;

// ── System prompt ────────────────────────────────────────────────────

function buildSystemPrompt(clinicType: string, skillContent: string): string {
  return `You are a healthcare marketing strategist for a ${clinicType} clinic in Saudi Arabia.

Your task is to generate targeted SERVICE-SPECIFIC campaigns based on patient segment data.
Each campaign should target patients who need a SPECIFIC service based on their service cycle gaps.

DOMAIN KNOWLEDGE:
${skillContent}

RULES:
1. Generate between 3 and 7 campaigns, ordered by priority (highest first).
2. Each campaign MUST have both Arabic and English message scripts.
3. Arabic scripts are PRIMARY — they should feel natural, warm, and culturally appropriate for Saudi patients. Use Gulf Arabic tone (مرحبا, أهلاً وسهلاً). English scripts are secondary translations.
4. Message scripts MUST use the {patient_name} placeholder for personalization.
5. Every message MUST include a clear call-to-action:
   - Arabic CTA example: "للحجز أرسل: حجز" or "احجز الآن: {booking_link}"
   - English CTA example: "Book now: {booking_link}" or "Reply BOOK to schedule"
6. Channel recommendation should be one of: ["whatsapp"], ["sms"], or ["whatsapp", "sms"].
   Prefer WhatsApp for richer engagement; use SMS as fallback or for older demographics.
7. Campaign types: "recall" (bring back lapsed patients), "preventive" (due for checkup/service), "follow_up" (post-treatment check), "promotional" (seasonal/new service), "re_engagement" (win back dormant 6+ month patients).
8. Priority: 1-100, higher = more impactful to the clinic's revenue and patient health.
9. Confidence score: 0-1, how confident you are this campaign will succeed given the data.
10. Do NOT suggest campaigns for segments with fewer than 2 patients.
11. Consider Saudi cultural context: Ramadan, Eid periods, summer heat, prayer times for scheduling.

## OFFER CALIBRATION (MANDATORY — match discount to lapse severity)
- **overdue_routine** (0-90 days overdue): NO discount needed. A friendly reminder is sufficient. Set suggestedOfferType and suggestedDiscount to null.
- **needs_followup**: NEVER discount. This is clinical care, not sales. Set both to null.
- **lapsed_long** (90-180 days): 10-15% discount or free add-on (e.g., free fluoride with checkup).
- **lapsed_long** (180-365 days): 20% discount or free_consultation.
- **lapsed_long** (365+ days): free_consultation + significant discount (25-30%).
- **high_value_inactive**: loyalty_bonus or package_deal (VIP treatment, not generic discount).
- **new_patient_dropout**: free_consultation to remove financial barrier.
- **seasonal_candidate**: package_deal preferred over flat discount (e.g., "cleaning + whitening bundle").
- **upsell_candidate**: package_deal (e.g., "cleaning + whitening" bundle at special price).

## SERVICE-SPECIFIC CAMPAIGNS (CRITICAL)
Each campaign MUST be about a SPECIFIC service, NOT generic "come visit us":
- "حملة تنظيف الأسنان" not "حملة استدعاء عامة"
- "تذكير تبييض الأسنان" not "عرض خاص"
- "استكمال التاج بعد علاج العصب" not "متابعة طبية"

The topServices in each segment tells you WHICH service most patients in that segment are overdue for. Use it!

### Service-specific rules:
- **Cleaning overdue**: "حان وقت تنظيف أسنانك — مر أكثر من 6 أشهر"
- **Root canal → crown**: "سنك يحتاج تاج لحمايته من الكسر" (clinical urgency, not fear)
- **Whitening renewal**: "حافظ على بياض ابتسامتك — حان وقت التجديد"
- **Botox renewal**: "وقت تجديد البوتوكس — حافظي على النتائج"
- **Implant follow-up**: "موعد فحص الزراعة السنوي"
- **Gum treatment**: "صحة لثتك تحتاج متابعة"
- **Upsell (cleaning→whitening)**: "أضف تبييض مع التنظيف — باقة خاصة"
- **VIP re-engagement**: "من عملائنا المميزين — باقة VIP"

## TONE & STYLE RULES
- Use "حان وقت" (it's time) framing, NOT "تأخرت" (you're late) framing.
- Focus on benefits and prevention, never on fear of disease.
- Keep WhatsApp messages under 100 words. SMS under 160 characters.
- End messages with the clinic identity: "عيادتكم" or "فريق العيادة".

### MANDATORY: Each campaign MUST use a DIFFERENT Arabic opening. Use these templates:
- **follow_up**: Start with "مرحباً {patient_name}، نحرص على متابعة صحتك..." (caring, concerned)
- **seasonal/promotional**: Start with "{patient_name}، استعد للعيد! ✨..." or "أهلاً وسهلاً {patient_name}،..." (excited)
- **recall/preventive**: Start with "السلام عليكم {patient_name}، حان وقت..." (formal, reminder)
- **re_engagement for lapsed**: Start with "{patient_name}، اشتقنالك! 💙..." (warm, emotional)
- **re_engagement for high_value**: Start with "{patient_name}، من عملائنا المميزين!..." (VIP recognition)
- **re_engagement for new_dropout**: Start with "أهلاً {patient_name}، سعدنا بزيارتك الأولى!..." (welcoming)
- **upsell**: Start with "مرحباً {patient_name}، عندنا عرض خاص لك!..." (special offer excitement)

### English Script Rules
- Use natural English greetings: "Hello", "Hi", "Dear". Do NOT transliterate Arabic (no "As-salamu alaykum" in English).
- Keep the English conversational and warm, not a literal translation.
- Each English script should also have a DIFFERENT opening matching the tone.

Respond ONLY with a JSON object in this exact format:
{
  "campaigns": [
    {
      "name": "Campaign name in English",
      "nameAr": "اسم الحملة بالعربي",
      "type": "recall|preventive|follow_up|promotional|re_engagement",
      "segment": "segment_key",
      "segmentDescAr": "وصف الشريحة بالعربي",
      "segmentDescEn": "Segment description in English",
      "scriptAr": "Arabic message with {patient_name} and CTA",
      "scriptEn": "English message with {patient_name} and CTA",
      "channelSequence": ["whatsapp"],
      "suggestedOfferType": "discount|free_consultation|package_deal|loyalty_bonus|null",
      "suggestedDiscount": null,
      "reasoning": "Why this campaign in English",
      "reasoningAr": "لماذا هذه الحملة بالعربي",
      "expectedOutcome": "Expected result description",
      "priority": 85,
      "confidenceScore": 0.8
    }
  ]
}`;
}

// ── Format segments for user prompt ──────────────────────────────────

function formatSegmentsForPrompt(segments: SegmentSummary[]): string {
  const today = new Date().toISOString().split('T')[0];
  const lines: string[] = [`Today's date: ${today}. Consider proximity to upcoming Eid, Ramadan, or seasonal events.`, '', 'Patient Segments Analysis:', ''];

  for (const seg of segments) {
    lines.push(`## Segment: ${seg.segment}`);
    lines.push(`- Patient count: ${seg.patientCount}`);
    lines.push(`- Average AI score: ${seg.avgScore.toFixed(1)}`);
    lines.push(`- Top services: ${seg.topServices.join(', ') || '(none detected)'}`);
    lines.push(`- Sample AI reasonings:`);
    for (const r of seg.sampleReasonings.slice(0, 3)) {
      lines.push(`  • ${r}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── Main function ────────────────────────────────────────────────────

/**
 * Generate campaign suggestions from patient segment summaries using Gemini.
 *
 * @param geminiConfig - Gemini API configuration
 * @param segments     - Summarized patient segments from analysis step
 * @param skillContent - Domain knowledge content loaded from skill files
 * @param clinicType   - Detected clinic type (dental, dermatology, etc.)
 * @returns Array of generated campaign suggestions
 */
export async function generateCampaigns(
  geminiConfig: GeminiConfig,
  segments: SegmentSummary[],
  skillContent: string,
  clinicType: string,
): Promise<GeneratedCampaign[]> {
  if (segments.length === 0) {
    return [];
  }

  const systemPrompt = buildSystemPrompt(clinicType, skillContent);
  const userPrompt = formatSegmentsForPrompt(segments);

  try {
    const content = await geminiJsonChat(geminiConfig, {
      systemPrompt,
      userPrompt,
      temperature: 0.4,
      maxOutputTokens: 8192,
    });

    const parsed: AIResponse = JSON.parse(content);

    if (!Array.isArray(parsed.campaigns)) {
      throw new Error('Gemini response missing "campaigns" array');
    }

    // Validate and sanitize each campaign
    const validated = parsed.campaigns
      .slice(0, 7) // Max 7 campaigns
      .map((c) => sanitizeCampaign(c))
      .filter((c): c is GeneratedCampaign => c !== null);

    // Sort by priority descending
    validated.sort((a, b) => b.priority - a.priority);

    return validated;
  } catch (error) {
    console.error('[CampaignGenerator] Gemini campaign generation failed:', error);

    // Return a single fallback campaign so the pipeline doesn't produce zero output
    return [
      {
        name: 'General Patient Recall',
        nameAr: 'استدعاء المرضى العام',
        type: 'recall',
        segment: segments[0]?.segment || 'all',
        segmentDescAr: 'جميع المرضى الذين لم يزوروا العيادة مؤخراً',
        segmentDescEn: 'All patients who have not visited the clinic recently',
        scriptAr: 'مرحباً {patient_name}، نتمنى لك دوام الصحة والعافية. لاحظنا أنه مضى وقت على آخر زيارة لك. ندعوك لحجز موعد فحص دوري. للحجز أرسل: حجز',
        scriptEn: 'Hello {patient_name}, we hope you are well. It has been a while since your last visit. We invite you to schedule a checkup. Reply BOOK to schedule.',
        channelSequence: ['whatsapp'],
        suggestedOfferType: null,
        suggestedDiscount: null,
        reasoning: 'Fallback campaign — AI generation encountered an error. This general recall targets all lapsed patients.',
        reasoningAr: 'حملة احتياطية — حدث خطأ في التوليد الذكي. هذه حملة استدعاء عامة لجميع المرضى المنقطعين.',
        expectedOutcome: 'Re-engage lapsed patients with a general recall message',
        priority: 50,
        confidenceScore: 0.3,
      },
    ];
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Validate and clamp campaign fields to expected ranges and types.
 * Returns null if the campaign is fundamentally invalid.
 */
function sanitizeCampaign(raw: Partial<GeneratedCampaign>): GeneratedCampaign | null {
  // Required string fields
  if (!raw.name || !raw.scriptAr || !raw.segment) {
    return null;
  }

  // Validate type
  const type = (VALID_TYPES as readonly string[]).includes(raw.type || '')
    ? raw.type!
    : 'recall';

  // Validate and sanitize channel sequence
  const channelSequence = Array.isArray(raw.channelSequence)
    ? raw.channelSequence.filter((ch) => (VALID_CHANNELS as readonly string[]).includes(ch))
    : ['whatsapp'];
  if (channelSequence.length === 0) {
    channelSequence.push('whatsapp');
  }

  // Clamp numeric fields
  const priority = typeof raw.priority === 'number'
    ? Math.max(1, Math.min(100, Math.round(raw.priority)))
    : 50;

  const confidenceScore = typeof raw.confidenceScore === 'number'
    ? Math.max(0, Math.min(1, raw.confidenceScore))
    : 0.5;

  const suggestedDiscount = typeof raw.suggestedDiscount === 'number'
    ? Math.max(0, Math.min(50, Math.round(raw.suggestedDiscount)))
    : null;

  return {
    name: raw.name,
    nameAr: raw.nameAr || raw.name,
    type,
    segment: raw.segment,
    segmentDescAr: raw.segmentDescAr || '',
    segmentDescEn: raw.segmentDescEn || '',
    scriptAr: raw.scriptAr,
    scriptEn: raw.scriptEn || '',
    channelSequence,
    suggestedOfferType: raw.suggestedOfferType || null,
    suggestedDiscount,
    reasoning: raw.reasoning || '',
    reasoningAr: raw.reasoningAr || '',
    expectedOutcome: raw.expectedOutcome || '',
    priority,
    confidenceScore,
  };
}
