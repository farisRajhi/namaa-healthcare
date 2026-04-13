# Patient Intelligence — Improvement Plan

Based on running 500 real patients through the Gemini-powered pipeline.

---

## What's Working Well

| Area | Finding |
|------|---------|
| **DNC Enforcement** | 49/49 DNC patients scored exactly 0. 100% compliance. |
| **Root Canal Urgency** | needs_followup patients avg score 85.6 (range 75-95). Correctly highest priority. |
| **Segment Detection** | 7 out of 8 segments populated correctly. Distribution is realistic. |
| **Arabic Quality** | Gulf Arabic, warm tone, "السلام عليكم" greetings, clinic sign-off "فريق العيادة". |
| **Offer Calibration** | No discount for routine/followup, free_consultation for lapsed, loyalty_bonus for VIP. |
| **Campaign Priority** | follow_up (95) > seasonal (90) > routine (85) > lapsed (80) > VIP (75) > new (70). Correct. |
| **Score Range** | 48 unique scores across 500 patients. Range 0-95. Good differentiation. |
| **Performance** | 500 patients in ~4.7 minutes (20 Gemini API calls). Acceptable for async pipeline. |

---

## Issues Found — Ranked by Impact

### P0: Upsell Segment Not Detected (0 patients)

**Problem**: 41 patients were designed as upsell candidates (cleaning-only, 2-7 visits, no cosmetic history). The AI classified ALL of them as `overdue_routine` instead of `upsell_candidate`.

**Root Cause**: The AI sees "تنظيف الاسنان" as overdue and stops there. It doesn't check "has this patient ONLY had basic services? → upsell opportunity."

**Fix**: Move upsell detection into code (pre-processing), not AI. Before calling the AI, tag patients as `upsell_hint: true` if:
- totalVisits >= 2
- ALL services are basic (تنظيف, فحص, حشوة, أشعة, فلورايد, تلميع)
- NO cosmetic services (تبييض, فينير, تقويم, زراعة)
- Last visit < 180 days ago

Then pass this hint to the AI: "This patient has ONLY had basic services and may be an upsell candidate."

**File**: `pipelineOrchestrator.ts` (add upsell hint to NormalizedPatient)
**File**: `patientAnalyzer.ts` (include hint in user prompt)

### P1: High-Value Misclassified (25 detected, expected 50)

**Problem**: Only 25 of 50 high-value patients were correctly identified. The other 25 were classified as `lapsed_long` because the AI prioritized "days since visit" over "visit count + service value."

**Root Cause**: The segment rules say "5+ visits AND expensive services AND 120+ days inactive" but many high-value patients had 6-8 visits with mixed basic+expensive services. The AI saw "8 months gone" and went straight to `lapsed_long`.

**Fix**: Add a pre-computed `lifetimeValue` field:
- `high` if totalVisits >= 6 AND services include any of: فينير, تبييض, زراعة, تقويم, جسر
- `medium` if totalVisits >= 4
- `low` otherwise

Pass this to the AI prompt. Also strengthen the segment rules: "If lifetimeValue is 'high', classify as high_value_inactive even if the patient has been gone a long time."

**File**: `pipelineOrchestrator.ts` (compute lifetimeValue)
**File**: `patientAnalyzer.ts` (add to prompt data + segment rules)

### P2: Lapsed Long Over-Assigned (140 detected, expected ~75)

**Problem**: 140 patients classified as `lapsed_long` — almost double the expected ~75. Many of these should be `high_value_inactive` (see P1) or `overdue_routine` (patients who are 8-10 months overdue for cleaning aren't truly "lapsed" — they're in the late recall window).

**Fix**: Tighten the lapsed_long definition in the prompt:
- Current: "8+ months with few visits"
- Better: "10+ months AND totalVisits <= 3 AND no high-value services"
- Patients with 4+ visits who are 8-10 months gone should be `overdue_routine` with higher urgency

**File**: `patientAnalyzer.ts` (update segment rules)

### P3: Score Clustering in 61-80 Range (184/500 = 37%)

**Problem**: 37% of all patients score between 61-80. While there are 48 unique scores, the distribution is heavily skewed to this range. Too many patients look "equally important" to the clinic.

**Fix**: Spread the scores more:
- Adjust base scores: 31-90 days → base 45 (was 50), 91-180 days → base 60 (was 65)
- Add more differentiation modifiers:
  - Exact months overdue (6mo = +0, 7mo = +3, 8mo = +5, 9mo = +8)
  - Gender modifier: female patients +3 (they comply 10-15% more per dental.md)
  - Age relevance: pediatric + back-to-school season = +5

**File**: `patientAnalyzer.ts` (scoring guidelines section)

### P4: Batch Consistency Issues

**Problem**: Patients at batch boundaries (e.g., patient #7 in the 40-patient test got "تعذّر تحليل"). In the 500-patient run this didn't recur, but it's a risk.

**Fix**: Add retry logic in `analyzeBatch`. If any patient gets `defaultResult`, retry that single patient in a mini-batch of 1. Max 1 retry per patient.

**File**: `patientAnalyzer.ts` (add retry after main batch)

### P5: Campaign Scripts Too Similar

**Problem**: All 6 campaigns start with "السلام عليكم {patient_name}" and end with "فريق العيادة". The prompt says "make each script DISTINCT" but the AI still uses the same structure.

**Fix**: Provide explicit opening templates per campaign type in the prompt:
- follow_up: "مرحباً {patient_name}، نحرص على متابعة صحتك..."
- seasonal: "أهلاً وسهلاً {patient_name}، استعد للعيد!..."
- recall: "السلام عليكم {patient_name}، حان وقت..."
- re_engagement: "{patient_name}، اشتقنالك!..."
- new_patient: "أهلاً {patient_name}، سعدنا بزيارتك..."

**File**: `campaignGenerator.ts` (add opening templates section)

### P6: No Upsell Campaign Generated

**Problem**: Because no patients were classified as `upsell_candidate` (P0), no upsell campaign was generated. This is a missed revenue opportunity.

**Fix**: Depends on fixing P0 first. Once upsell patients are detected, the campaign generator should produce a campaign like:
- "جرب تبييض الأسنان" (Try whitening)
- Type: promotional
- Offer: package_deal (cleaning + whitening bundle)

### P7: English Scripts Sound Robotic

**Problem**: The English scripts start with "As-salamu alaykum" — this is odd for English text. And phrases like "one of our valued patients" sound template-ish.

**Fix**: Update prompt to say: "English scripts should use natural English greetings (Hello, Hi, Dear) — do NOT transliterate Arabic greetings. Keep the English version conversational and warm."

**File**: `campaignGenerator.ts`

### P8: Missing Patient Count in Campaign Context

**Problem**: The campaigns don't show how many patients each targets. The clinic staff reviewing suggestions need to know if a campaign hits 30 patients or 170.

**Fix**: Already handled in the pipeline (patientCount is saved). But the campaign generator prompt should mention the count in reasoning so staff understand scale:
"This campaign targets {patientCount} patients."

**File**: `campaignGenerator.ts` (add patient count to segment summary format)

---

## Implementation Priority

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| 1 | P0: Upsell pre-tagging in code | 1 hour | High — unlocks new revenue campaign |
| 2 | P1: Lifetime value pre-computation | 1 hour | High — fixes 50% misclassification |
| 3 | P2: Tighten lapsed_long definition | 30 min | Medium — cleaner segmentation |
| 4 | P3: Score spread improvement | 30 min | Medium — better prioritization |
| 5 | P5: Campaign opening templates | 30 min | Medium — better Arabic quality |
| 6 | P7: Fix English scripts | 15 min | Low — secondary language |
| 7 | P4: Batch retry logic | 1 hour | Low — rare edge case |
| 8 | P8: Patient count in reasoning | 15 min | Low — nice to have |

**Total estimated effort: ~5 hours for all improvements.**
