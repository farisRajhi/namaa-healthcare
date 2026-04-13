# Campaign Execution Best Practices

> **ALWAYS LOADED** — These rules govern how campaigns are constructed, personalized, timed, and delivered. The AI agent must follow these constraints when generating campaign content or recommending campaign parameters.

---

## Message Composition Rules

### Length Constraints
- **WhatsApp**: maximum 160 words per message. Shorter is better — aim for 60-100 words. If you need more, split into a main message + follow-up.
- **SMS**: maximum 160 characters (1 segment). Going beyond 160 characters splits into multiple segments and doubles/triples cost. Keep SMS ultra-concise.
- **Structure**: greeting → personalized context → value proposition → clear CTA → clinic name.

### Personalization (Required)
- **Always** include `{patient_name}` — messages without the patient's name have 40% lower response rates.
- **Mention the specific service** the patient is due for. "فحصك الدوري" (your routine checkup) outperforms "خدماتنا" (our services) by 3x.
- **Mention the doctor's name** if the patient has a preferred doctor on file.
- **Reference last visit** when appropriate: "It's been 6 months since your last visit" creates personal relevance.

### Call-to-Action (CTA)
- **Every message must have exactly one clear CTA.** Multiple CTAs dilute conversion.
- **Arabic CTA examples**:
  - للحجز أرسل: حجز — "To book, send: book"
  - للحجز اضغط الرابط — "To book, tap the link"
  - للتفاصيل أرسل: تفاصيل — "For details, send: details"
- **English CTA examples**:
  - Reply "BOOK" to schedule
  - Tap the link to book your appointment
- **Always include a booking link** when the system supports it. Direct links convert 2-3x better than "call us" CTAs.

### Bilingual Format
- Write the **Arabic version first**, then the English version below.
- Separate with a line break or "---".
- Do not interleave Arabic and English in the same paragraph — it is hard to read.

---

## Frequency & Contact Rules

### Frequency Caps
- **Same patient, same campaign type**: no more than once every 2 weeks.
- **Same patient, any campaign**: no more than 2 messages per week across all campaign types.
- **Post-appointment follow-up**: exempt from frequency cap (send within 24-48 hours of visit).
- **Appointment reminders**: exempt from frequency cap (24h and 2h before appointment).

### Do Not Contact (DNC)
- **Always respect DNC status.** Never override, never "just this once," never for "important" campaigns.
- If a patient replies "stop," "إلغاء," "وقف," or any unsubscribe keyword, immediately add to DNC.
- DNC is permanent until the patient explicitly opts back in.

### Contact Escalation
- If a patient does not respond after 2 campaign messages (over 4+ weeks), stop automated outreach for that campaign type for 90 days.
- After 90 days of silence, one "we miss you" re-engagement attempt is acceptable.
- If the re-engagement attempt gets no response, mark as dormant. Only manual (receptionist-initiated) outreach after this point.

---

## Optimal Send Times (Saudi Arabia, AST/UTC+3)

| Time Window | Quality | Notes |
|-------------|---------|-------|
| 9:00-11:30am | Best | Morning clarity, before Dhuhr prayer |
| 4:15-5:30pm | Good | After Asr prayer, before Maghrib |
| 8:30-10:00pm | Acceptable | After Isha prayer, evening browsing (avoid during Ramadan late nights) |
| 12:00-3:00pm | Poor | Lunch + Dhuhr/Asr prayer zone |
| 6:00-8:00pm | Avoid | Maghrib + Isha prayer zone (varies by season) |
| 11:00pm-8:00am | Never | Sleeping hours |
| Friday before 2pm | Never | Jumu'ah prayer and family time |

### Salary Day Override
- On the 25th-27th of the month, promotional/paid-service campaigns can be sent during any "Best" or "Good" window. These days get the highest conversion for revenue-generating campaigns.

---

## Channel Strategy

### Priority Order
1. **WhatsApp** (85-95% open rate, 15-25% response rate) — always the first choice.
2. **SMS** (20-30% open rate, 5-10% response rate) — fallback if WhatsApp is unavailable or undelivered.
3. **Phone call** (receptionist-initiated) — for high-value patients or urgent re-engagement only.

### Channel-Specific Rules
- **WhatsApp**: can be conversational, include emojis sparingly, support images/PDFs. Patients expect to reply and get a response.
- **SMS**: must be ultra-short, no images, include clinic name in message body (sender ID may not display on all devices). No expectation of two-way conversation.

---

## Campaign Types & Offer Strategy

### Campaign Types
| Type | Trigger | Goal |
|------|---------|------|
| **Recall** | Patient overdue for routine service | Bring back for scheduled care |
| **Preventive** | Upcoming need based on age/condition/season | Proactive health outreach |
| **Follow-up** | Recent visit/procedure | Post-care check-in, satisfaction |
| **Promotional** | Clinic offer, new service, seasonal | Revenue generation |
| **Re-engagement** | 6+ month gap, lapsed patient | Win back dormant patients |

### Offer Calibration by Lapse Severity

| Patient Status | Time Since Last Visit | Recommended Approach |
|---------------|----------------------|---------------------|
| Recently overdue | 0-30 days | Friendly reminder, no discount needed |
| Mildly lapsed | 30-90 days | Reminder + mention specific benefit ("your checkup is overdue") |
| Moderately lapsed | 90-180 days | Soft offer: 10-15% discount or free add-on (e.g., free vitamin D test with checkup) |
| Severely lapsed | 180-365 days | Stronger offer: 20% discount or free initial consultation |
| Dormant | 365+ days | "We miss you" + compelling offer (free consultation, significant discount on first-return visit) |

### Discount Guidelines
- **10-15%** for mild lapse — enough to nudge without devaluing the service.
- **20%+** for severe lapse — the patient needs a reason to return, and the lifetime value justifies it.
- **Free consultation** for new-patient re-engagement — removes the financial barrier entirely.
- **Never discount** appointment reminders or post-visit follow-ups — these are service, not sales.
- **Package discounts** (family checkup, annual wellness bundle) work better than single-service discounts.

---

## Tone & Messaging Psychology

### Urgency Without Fear
- **Do**: "حان وقت فحصك الدوري — صحتك أولوية" (It's time for your routine checkup — your health is a priority)
- **Don't**: "تأخرت عن موعدك! قد تكون في خطر" (You're late! You could be in danger)
- Focus on **benefits and prevention**, never on fear of disease or consequences of not visiting.
- Use "it's time" and "you're due" framing, not "you missed" or "you're overdue" framing.

### Social Proof (Honest Only)
- **Acceptable**: "Dr. Ahmad has limited availability this week" (if true).
- **Acceptable**: "Many of our patients complete this checkup annually" (general, honest).
- **Never fabricate**: fake reviews, invented statistics, or false scarcity ("only 2 slots left!" when there are 20).

---

## A/B Testing Guidelines

### What to Test
- **Offer vs no-offer**: does a discount actually improve conversion, or is the reminder alone sufficient?
- **Formal vs friendly tone**: which resonates with this clinic's patient base?
- **Arabic-only vs bilingual**: does adding English help or add clutter?
- **Short vs detailed**: does a 40-word message outperform an 80-word message?
- **CTA style**: "reply to book" vs "tap the link" vs "call us."

### Expected Conversion Rates (Benchmarks)
| Campaign Type | WhatsApp | SMS |
|--------------|----------|-----|
| Appointment reminder | 70-85% confirmation | 40-55% confirmation |
| Recall (recently overdue) | 15-25% booking | 5-10% booking |
| Re-engagement (lapsed) | 8-12% booking | 3-5% booking |
| Promotional (offer) | 10-18% booking | 4-8% booking |
| Preventive (proactive) | 12-20% booking | 5-8% booking |

### Testing Protocol
- Minimum sample: 100 patients per variant (A and B) for statistical significance.
- Run for at least 1 week to account for daily variation.
- Measure **booking rate** (not just open rate or click rate) — bookings are the only metric that matters.
- Apply the winning variant clinic-wide after the test concludes.
