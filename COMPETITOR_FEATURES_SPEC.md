# Competitor Features Research & Implementation Spec for Namaa
# Based on: Hyro Health + Syllable AI (ActiumHealth)

> **Purpose**: This document maps every feature from Hyro Health and Syllable AI into actionable implementation tasks for the Namaa (ai-agent) project. Each feature includes what it does, why it matters, and exactly how to build it in the existing Namaa stack (Fastify + Prisma + PostgreSQL + Twilio + OpenAI/Gemini + React frontend).

---

## Table of Contents

1. [Current Namaa State](#1-current-namaa-state)
2. [INBOUND — Call Center AI](#2-inbound--call-center-ai)
3. [INBOUND — Appointment Scheduling](#3-inbound--appointment-scheduling)
4. [INBOUND — Patient Identification & Verification](#4-inbound--patient-identification--verification)
5. [INBOUND — Prescription Management (Rx)](#5-inbound--prescription-management-rx)
6. [INBOUND — Physician & Location Search](#6-inbound--physician--location-search)
7. [INBOUND — FAQ & Triage](#7-inbound--faq--triage)
8. [INBOUND — Smart Routing & Handoff](#8-inbound--smart-routing--handoff)
9. [INBOUND — SMS Deflection & Text Workflows](#9-inbound--sms-deflection--text-workflows)
10. [INBOUND — Web Chat Widget](#10-inbound--web-chat-widget)
11. [OUTBOUND — Proactive Patient Outreach](#11-outbound--proactive-patient-outreach)
12. [OUTBOUND — Appointment Reminders & No-Show Prevention](#12-outbound--appointment-reminders--no-show-prevention)
13. [OUTBOUND — Campaign Management](#13-outbound--campaign-management)
14. [OUTBOUND — Predictive Analytics (CENTARI-like)](#14-outbound--predictive-analytics-centari-like)
15. [ANALYTICS — Conversational Intelligence Dashboard](#15-analytics--conversational-intelligence-dashboard)
16. [ANALYTICS — Automated QA/QM](#16-analytics--automated-qaqm)
17. [ANALYTICS — Call Driver Analysis](#17-analytics--call-driver-analysis)
18. [PLATFORM — Multi-Tenant Fleet Management](#18-platform--multi-tenant-fleet-management)
19. [PLATFORM — No-Code Agent Builder](#19-platform--no-code-agent-builder)
20. [PLATFORM — Integrations (EMR/CRM/Contact Center)](#20-platform--integrations-emrcrm-contact-center)
21. [PLATFORM — Security & Compliance](#21-platform--security--compliance)
22. [PLATFORM — Multi-Language & Dialect Support](#22-platform--multi-language--dialect-support)
23. [AI — Responsible AI Safeguards](#23-ai--responsible-ai-safeguards)
24. [AI — Patient Memory & Context](#24-ai--patient-memory--context)
25. [Implementation Priority Matrix](#25-implementation-priority-matrix)
26. [Database Schema Additions](#26-database-schema-additions)
27. [New API Routes Needed](#27-new-api-routes-needed)
28. [New Frontend Pages Needed](#28-new-frontend-pages-needed)

---

## 1. Current Namaa State

**What Namaa already has:**
- ✅ Multi-org/multi-facility architecture (Prisma schema)
- ✅ Appointment booking with provider availability rules
- ✅ Patient management with contacts & memory
- ✅ Voice calls via Twilio (inbound, STT, TTS, Gemini Live)
- ✅ WhatsApp messaging via Twilio
- ✅ Web chat (WebSocket)
- ✅ Conversation tracking with messages & summaries
- ✅ Arabic dialect detection
- ✅ LLM integration (OpenAI + Gemini)
- ✅ ElevenLabs TTS
- ✅ Auth system (JWT)
- ✅ Analytics route (basic)
- ✅ Dashboard frontend
- ✅ i18n (Arabic + English)

**What Namaa is missing (from Hyro + Syllable):**
- ❌ Prescription/medication management
- ❌ Smart call routing with escalation rules
- ❌ SMS deflection (call-to-text)
- ❌ Outbound calling campaigns
- ❌ Proactive patient outreach
- ❌ Appointment reminders (automated)
- ❌ Predictive analytics
- ❌ QA/QM system for call quality
- ❌ No-code flow builder
- ❌ EMR/CRM integrations layer
- ❌ PII/PHI redaction
- ❌ Embeddable chat widget
- ❌ Campaign management
- ❌ Call driver analytics
- ❌ Waitlist management
- ❌ Multi-location fleet dashboard

---

## 2. INBOUND — Call Center AI

### What Hyro Does:
- Answers 100% of incoming calls with AI (no busy signal ever)
- Resolves up to 85% of calls without human
- Handles unlimited parallel calls
- Sub-second response latency
- Natural conversation with interruption handling

### What Syllable Does:
- Millisecond response times for natural flow
- Infinite parallel call capacity
- 70% of calls fully routed by AI
- 40% reduction in abandoned calls
- Learns from interactions over time

### Implementation Tasks:

```
FILE: backend/src/services/voice/callRouter.ts (NEW)
```
- [ ] **Call Queue Manager** — Track all active calls, distribute across Twilio channels
- [ ] **Intent Detection Engine** — Classify caller intent within first 5 seconds:
  - `scheduling` — book/reschedule/cancel appointment
  - `prescription` — refill/status check
  - `physician_search` — find a doctor
  - `faq` — general questions
  - `billing` — payment/insurance questions
  - `urgent` — emergency triage
  - `it_support` — portal/app help
  - `unknown` — needs human
- [ ] **Interruption Handling** — Detect when caller speaks over AI, pause TTS immediately
- [ ] **Conversation State Machine** — Track step-by-step flow per call:
  ```
  greeting → intent_detection → identity_verification → task_execution → wrap_up → survey
  ```
- [ ] **Auto-Retry on Failure** — If STT/TTS fails, retry with fallback provider
- [ ] **Call Recording** — Record all calls (already have `recordingUrl` in schema)

```
FILE: backend/src/routes/callCenter.ts (NEW)
```
- [ ] `POST /api/call-center/status` — Real-time call center dashboard data
- [ ] `GET /api/call-center/active-calls` — List all active AI calls
- [ ] `GET /api/call-center/queue` — Show waiting/in-progress/completed
- [ ] `POST /api/call-center/transfer` — Transfer call to human agent

---

## 3. INBOUND — Appointment Scheduling

### What Hyro Does:
- End-to-end scheduling over phone, chat, SMS, web
- Open scheduling (new patients) + direct scheduling (existing)
- Reschedule and cancel by voice
- Waitlist management — auto-fill cancelled slots
- 47% more appointments booked online (Tampa General case)

### What Syllable Does:
- Auto-sends SMS with booking link during call
- Connects to existing scheduling systems
- Handles complex multi-step booking (specialty + location + insurance + time)

### Implementation Tasks:

```
FILE: backend/src/services/scheduling/smartScheduler.ts (NEW)
```
- [ ] **Intelligent Slot Matching** — Match patient to best slot based on:
  - Preferred provider/department
  - Location proximity
  - Insurance compatibility
  - Time preference (morning/afternoon/evening)
  - Urgency level
- [ ] **Waitlist System** — When no slot available:
  - Add patient to waitlist with priority score
  - Auto-notify when cancellation creates opening
  - First-come-first-served or priority-based
- [ ] **Multi-Step Booking Flow** (voice/chat):
  ```
  1. What service do you need? → AI suggests based on symptoms
  2. Any preferred doctor? → Show available providers
  3. When works for you? → Suggest 3 best slots
  4. Confirm details → Book + send confirmation SMS
  ```
- [ ] **Reschedule by Voice** — "I need to move my Tuesday appointment"
  - AI finds the appointment, offers alternatives, confirms
- [ ] **Cancel by Voice** — With optional reason capture
- [ ] **Smart Suggestions** — AI suggests follow-up appointments based on history

```
FILE: backend/src/routes/waitlist.ts (NEW)
```
- [ ] `POST /api/waitlist/add` — Add patient to waitlist
- [ ] `GET /api/waitlist/:orgId` — List waitlist entries
- [ ] `POST /api/waitlist/notify` — Trigger notification for opening
- [ ] `DELETE /api/waitlist/:id` — Remove from waitlist

### Schema Addition:
```prisma
model Waitlist {
  waitlistId    String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId         String   @db.Uuid
  patientId     String   @db.Uuid
  serviceId     String?  @db.Uuid
  providerId    String?  @db.Uuid
  facilityId    String?  @db.Uuid
  priority      Int      @default(0)
  preferredDate DateTime? @db.Date
  preferredTime String?  // "morning" | "afternoon" | "evening"
  status        String   @default("waiting") // waiting | notified | booked | expired
  notifiedAt    DateTime? @db.Timestamptz(6)
  createdAt     DateTime @default(now()) @db.Timestamptz(6)
  @@map("waitlist")
}
```

---

## 4. INBOUND — Patient Identification & Verification

### What Hyro Does:
- Automated patient record identification via voice
- DOB + name + MRN verification
- MyChart account troubleshooting (password reset, login help)
- HIPAA-compliant identity verification before sharing any PHI

### What Syllable Does:
- Voice-based identity verification
- Links caller phone number to patient record
- Supports family members calling on behalf of patients

### Implementation Tasks:

```
FILE: backend/src/services/patient/identityVerifier.ts (NEW)
```
- [ ] **Phone Number Lookup** — Match incoming caller ID to `PatientContact`
  - If found: greet by name, ask to confirm DOB
  - If not found: start new patient registration flow
- [ ] **Multi-Factor Verification** (pick 2 of 3):
  - Full name (Arabic + English)
  - Date of birth
  - National ID / MRN
- [ ] **Family/Guardian Access** — "I'm calling for my mother"
  - Check `MessagingUserPatientLink.relationship`
  - Allow authorized family members to manage appointments
- [ ] **Verification Levels**:
  ```
  Level 0: Anonymous (FAQ only)
  Level 1: Phone matched (view appointments)
  Level 2: DOB confirmed (modify appointments)
  Level 3: Full verified (access medical records)
  ```
- [ ] **Failed Verification Handling** — After 3 failed attempts, transfer to human
- [ ] **Session Token** — Once verified, don't re-verify within same conversation

### Schema Addition:
```prisma
model PatientVerification {
  verificationId String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  patientId      String   @db.Uuid
  conversationId String?  @db.Uuid
  method         String   // "phone_match" | "dob" | "mrn" | "national_id"
  level          Int      @default(0)
  verified       Boolean  @default(false)
  attempts       Int      @default(0)
  verifiedAt     DateTime? @db.Timestamptz(6)
  expiresAt      DateTime  @db.Timestamptz(6)
  createdAt      DateTime @default(now()) @db.Timestamptz(6)
  @@map("patient_verifications")
}
```

---

## 5. INBOUND — Prescription Management (Rx)

### What Hyro Does:
- Prescription refill requests via voice/chat/SMS
- Prescription status check
- Pharmacy routing
- Medication reminders

### What Syllable Does:
- Automated prescription renewal
- Medication status inquiries
- Transfer to pharmacy for complex requests

### Implementation Tasks:

```
FILE: backend/src/routes/prescriptions.ts (NEW)
```
- [ ] `POST /api/prescriptions` — Create prescription record
- [ ] `GET /api/prescriptions/patient/:patientId` — List patient prescriptions
- [ ] `POST /api/prescriptions/:id/refill` — Request refill
- [ ] `GET /api/prescriptions/:id/status` — Check refill status
- [ ] `PATCH /api/prescriptions/:id` — Update prescription

```
FILE: backend/src/services/prescription/rxManager.ts (NEW)
```
- [ ] **Refill Request Flow** (voice/chat):
  ```
  1. Verify patient identity (Level 2+)
  2. "Which medication?" → List active prescriptions
  3. "Panadol 500mg, right?" → Confirm
  4. Check if refills remaining
  5. If yes → Submit to pharmacy, send SMS confirmation
  6. If no → "You'll need to see your doctor. Want to schedule?"
  ```
- [ ] **Medication Reminders** — Scheduled SMS/WhatsApp reminders
- [ ] **Drug Interaction Check** — Basic flag if patient has multiple meds
- [ ] **Pharmacy Routing** — Direct complex requests to pharmacy staff

### Schema Addition:
```prisma
model Prescription {
  prescriptionId   String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId            String   @db.Uuid
  patientId        String   @db.Uuid
  providerId       String   @db.Uuid
  medicationName   String
  medicationNameAr String?
  dosage           String
  frequency        String   // "once_daily" | "twice_daily" | "as_needed"
  refillsRemaining Int      @default(0)
  refillsTotal     Int      @default(0)
  status           String   @default("active") // active | completed | cancelled | expired
  startDate        DateTime @db.Date
  endDate          DateTime? @db.Date
  pharmacyName     String?
  pharmacyPhone    String?
  notes            String?
  createdAt        DateTime @default(now()) @db.Timestamptz(6)
  updatedAt        DateTime @default(now()) @updatedAt @db.Timestamptz(6)
  @@map("prescriptions")
}

model PrescriptionRefill {
  refillId        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  prescriptionId  String   @db.Uuid
  requestedVia    String   // "voice" | "whatsapp" | "web" | "sms"
  conversationId  String?  @db.Uuid
  status          String   @default("pending") // pending | approved | dispensed | denied
  requestedAt     DateTime @default(now()) @db.Timestamptz(6)
  processedAt     DateTime? @db.Timestamptz(6)
  processedBy     String?
  notes           String?
  @@map("prescription_refills")
}

model MedicationReminder {
  reminderId     String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  patientId      String   @db.Uuid
  prescriptionId String   @db.Uuid
  channel        String   // "sms" | "whatsapp"
  scheduleTime   String   // "08:00" | "20:00"
  isActive       Boolean  @default(true)
  lastSentAt     DateTime? @db.Timestamptz(6)
  createdAt      DateTime @default(now()) @db.Timestamptz(6)
  @@map("medication_reminders")
}
```

---

## 6. INBOUND — Physician & Location Search

### What Hyro Does:
- "Find me a dermatologist near Riyadh"
- Search by specialty, location, language, gender, insurance
- Returns physician profiles with availability
- Uses small language models for specific medical vocabulary

### What Syllable Does:
- Provider directory search
- Route to correct department/specialist
- Location-based facility finder

### Implementation Tasks:

```
FILE: backend/src/services/search/providerSearch.ts (NEW)
```
- [ ] **Natural Language Doctor Search** — Parse queries like:
  - "أبي دكتور جلدية في جدة" → specialty=dermatology, city=Jeddah
  - "طبيبة نساء تتكلم عربي" → specialty=OBGYN, gender=female, lang=Arabic
- [ ] **Search Filters**:
  - Specialty / department
  - City / facility location
  - Language spoken
  - Gender preference
  - Insurance accepted
  - Next available slot
  - Rating (future)
- [ ] **Search Results Format** (voice-friendly):
  ```
  "Found 3 dermatologists near you:
   1. Dr. Ahmed Al-Rashid at King Fahad Hospital — next available Thursday 2pm
   2. Dr. Sara Al-Harbi at Medical City — next available tomorrow 10am
   Want me to book with one of them?"
  ```
- [ ] **Facility Finder** — "Where's the nearest lab?" with address + directions link

### Schema Addition:
```prisma
// Add to existing Provider model:
// gender         String?
// languages      String[]  @default(["ar"])
// insuranceAccepted String[]  @default([])
// bio            String?
// bioAr          String?
// rating         Float?    @default(0)
// reviewCount    Int       @default(0)
```

---

## 7. INBOUND — FAQ & Triage

### What Hyro Does:
- Auto-answers common healthcare questions from knowledge base
- Symptom-based basic triage (not diagnosis)
- Operating hours, parking, visiting policies
- COVID/vaccine information
- Insurance & billing FAQs

### What Syllable Does:
- Pre-visit information delivery
- Clinic policies and procedures
- Directions and parking info
- Post-visit care instructions

### Implementation Tasks:

```
FILE: backend/src/services/knowledge/faqEngine.ts (NEW)
```
- [ ] **Knowledge Base System**:
  - Org-specific FAQ entries (Arabic + English)
  - Category-based: general, insurance, procedures, locations, policies
  - Vector search with embeddings for semantic matching
  - Admin can add/edit/delete FAQs from dashboard
- [ ] **Basic Symptom Triage** (NOT diagnosis):
  ```
  Patient: "I have chest pain"
  AI: "Chest pain can be serious. If severe or sudden, please call 997 (Saudi emergency).
       For non-emergency, I can schedule an urgent appointment with a cardiologist.
       Would you like me to do that?"
  ```
  - **Red flag symptoms** → Immediately suggest emergency services
  - **Moderate symptoms** → Suggest urgent appointment
  - **Mild symptoms** → Suggest regular appointment
- [ ] **Operating Hours Bot** — Auto-respond with facility hours
- [ ] **Pre-Visit Info** — After booking, send prep instructions for the visit type

### Schema Addition:
```prisma
model FaqEntry {
  faqId       String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId       String   @db.Uuid
  category    String   // "general" | "insurance" | "procedures" | "locations" | "policies"
  questionEn  String
  questionAr  String
  answerEn    String
  answerAr    String
  embedding   Float[]? // Vector embedding for semantic search
  priority    Int      @default(0)
  isActive    Boolean  @default(true)
  viewCount   Int      @default(0)
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime @default(now()) @updatedAt @db.Timestamptz(6)
  @@map("faq_entries")
}

model TriageRule {
  ruleId      String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId       String   @db.Uuid
  keywords    String[] // ["chest pain", "ألم في الصدر"]
  severity    String   // "emergency" | "urgent" | "routine"
  responseEn  String
  responseAr  String
  action      String   // "call_emergency" | "schedule_urgent" | "schedule_routine" | "transfer_nurse"
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  @@map("triage_rules")
}
```

---

## 8. INBOUND — Smart Routing & Handoff

### What Hyro Does:
- AI resolves what it can, escalates what it can't
- Contextual handoff — human agent gets full conversation summary
- Skill-based routing (billing → billing dept, scheduling → scheduling)
- Warm transfer with AI briefing the agent

### What Syllable Does:
- Seamless escalation to live staff
- Complex issues auto-routed to right department
- AI continues assisting human agent in background

### Implementation Tasks:

```
FILE: backend/src/services/routing/smartRouter.ts (NEW)
```
- [ ] **Escalation Rules Engine**:
  ```json
  {
    "rules": [
      { "trigger": "angry_sentiment_3x", "action": "transfer_supervisor" },
      { "trigger": "billing_dispute", "action": "transfer_billing" },
      { "trigger": "medical_emergency", "action": "transfer_nurse" },
      { "trigger": "ai_confidence_below_0.6", "action": "transfer_general" },
      { "trigger": "patient_requests_human", "action": "transfer_general" },
      { "trigger": "3_failed_attempts", "action": "transfer_general" }
    ]
  }
  ```
- [ ] **Warm Handoff** — When transferring:
  1. AI generates conversation summary
  2. Summary appears on agent's screen before they pick up
  3. Patient hears "Please hold while I connect you"
  4. Agent sees: intent, patient info, what was already tried
- [ ] **Agent Assist Mode** — AI stays on the line to help human agent:
  - Real-time suggestions
  - Auto-pull patient records
  - Draft responses for agent to approve
- [ ] **Routing Table** — Map intents to departments/agents:
  ```
  scheduling → Booking Team
  billing → Finance
  rx_refill → Pharmacy
  medical_question → Nurse Hotline
  technical → IT Support
  complaint → Patient Relations
  ```
- [ ] **After-Hours Routing** — Different rules outside business hours

### Schema Addition:
```prisma
model EscalationRule {
  ruleId       String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId        String   @db.Uuid
  triggerType  String   // "intent" | "sentiment" | "confidence" | "keyword" | "patient_request"
  triggerValue String   // The specific trigger value
  action       String   // "transfer" | "notify" | "escalate"
  targetType   String   // "department" | "agent" | "phone_number" | "queue"
  targetValue  String
  priority     Int      @default(0)
  isActive     Boolean  @default(true)
  schedule     Json?    // Time-based rules {"afterHours": true}
  createdAt    DateTime @default(now()) @db.Timestamptz(6)
  @@map("escalation_rules")
}

model Handoff {
  handoffId      String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  conversationId String   @db.Uuid
  reason         String
  summary        String   // AI-generated summary
  patientContext Json     // Key info for agent
  assignedTo     String?  // Agent ID or department
  status         String   @default("pending") // pending | accepted | completed | abandoned
  waitTimeSec    Int?
  createdAt      DateTime @default(now()) @db.Timestamptz(6)
  acceptedAt     DateTime? @db.Timestamptz(6)
  completedAt    DateTime? @db.Timestamptz(6)
  @@map("handoffs")
}
```

---

## 9. INBOUND — SMS Deflection & Text Workflows

### What Hyro Does:
- During phone call, deflect simple tasks to SMS
- "I'll text you a link to reset your password"
- Send appointment confirmation via SMS after voice booking
- Call-to-text for self-service tasks

### What Syllable Does:
- Automated SMS based on call context
- Send booking links mid-call
- Post-call follow-up texts with resources
- Customizable scenarios in plain English

### Implementation Tasks:

```
FILE: backend/src/services/messaging/smsDeflector.ts (NEW)
```
- [ ] **Mid-Call SMS Triggers**:
  ```
  Intent: "scheduling" → SMS: booking link
  Intent: "password_reset" → SMS: reset link
  Intent: "directions" → SMS: Google Maps link
  Intent: "forms" → SMS: pre-visit form link
  Intent: "results" → SMS: patient portal link
  ```
- [ ] **Post-Call SMS**:
  - Appointment confirmation with details
  - Satisfaction survey link
  - Follow-up instructions
  - Prescription pickup reminder
- [ ] **Template Engine** — Org-customizable SMS templates (Arabic + English):
  ```
  "مرحباً {patient_name}، تم حجز موعدك مع {doctor_name} يوم {date} الساعة {time} في {facility}. للإلغاء أرسل 'إلغاء'"
  ```
- [ ] **WhatsApp Rich Messages** — Same flows but with buttons + images on WhatsApp

```
FILE: backend/src/routes/smsTemplates.ts (NEW)
```
- [ ] `GET /api/sms-templates/:orgId` — List templates
- [ ] `POST /api/sms-templates` — Create template
- [ ] `PATCH /api/sms-templates/:id` — Update template
- [ ] `POST /api/sms-templates/:id/send` — Send template to patient

### Schema Addition:
```prisma
model SmsTemplate {
  templateId   String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId        String   @db.Uuid
  name         String
  trigger      String   // "post_booking" | "reminder" | "mid_call_link" | "survey" | "custom"
  bodyEn       String
  bodyAr       String
  variables    String[] // ["patient_name", "doctor_name", "date", "time"]
  channel      String   @default("sms") // "sms" | "whatsapp" | "both"
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now()) @db.Timestamptz(6)
  @@map("sms_templates")
}

model SmsLog {
  logId        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId        String   @db.Uuid
  templateId   String?  @db.Uuid
  patientId    String?  @db.Uuid
  phone        String
  channel      String   // "sms" | "whatsapp"
  body         String
  status       String   @default("sent") // sent | delivered | failed | read
  twilioSid    String?
  triggeredBy  String   // "ai_call" | "ai_chat" | "scheduled" | "manual"
  createdAt    DateTime @default(now()) @db.Timestamptz(6)
  @@map("sms_logs")
}
```

---

## 10. INBOUND — Web Chat Widget

### What Hyro Does:
- Embeddable chat widget on hospital website
- Same AI brain as voice (omnichannel)
- Patient can start on chat, continue on phone
- Rich elements: buttons, carousels, forms

### What Syllable Does:
- Web-based chat assistant
- Integrated with same backend as voice

### Implementation Tasks:

```
FILE: frontend/src/components/chat/EmbeddableWidget.tsx (NEW)
```
- [ ] **Standalone Chat Widget** — `<script>` embed for any website:
  ```html
  <script src="https://namaa.ai/widget.js" data-org="ORG_ID" data-lang="ar"></script>
  ```
- [ ] **Widget Features**:
  - Floating button (bottom-right)
  - Chat window with message history
  - Rich elements: quick-reply buttons, date picker, doctor cards
  - File upload (lab results, insurance card photos)
  - Typing indicator
  - Persistent across page navigation
  - Mobile responsive
- [ ] **Cross-Channel Continuity** — If patient starts on chat, can continue on WhatsApp:
  - "Want to continue this on WhatsApp? I'll send you a link"
  - Conversation context preserved across channels

```
FILE: backend/src/routes/widget.ts (NEW)
```
- [ ] `GET /api/widget/config/:orgId` — Widget configuration (theme, greeting, language)
- [ ] `POST /api/widget/init` — Initialize widget session
- [ ] `POST /api/widget/message` — Send message (REST fallback for WebSocket)

---

## 11. OUTBOUND — Proactive Patient Outreach

### What Syllable/Actium Does:
- AI calls patients who are overdue for care
- "You're due for your annual checkup — want to schedule?"
- Proactive outreach for:
  - Annual physicals
  - Vaccination due dates
  - Chronic condition follow-ups
  - Post-surgery follow-ups
  - Preventive screenings (mammogram, colonoscopy)
- Created new revenue channels through targeted outreach
- 1,395 lives positively affected by early breast cancer diagnoses

### What Hyro Does:
- Care gap closure outreach
- Proactive patient engagement
- Reduce readmissions via follow-up calls

### Implementation Tasks:

```
FILE: backend/src/services/outbound/outboundCaller.ts (NEW)
```
- [ ] **Outbound Call Engine**:
  1. System identifies patients needing outreach (see Predictive Analytics)
  2. Queue outbound calls with priority
  3. AI calls patient using Twilio
  4. Natural conversation: "Hi {name}, this is Namaa from {facility}..."
  5. Purpose: schedule appointment, remind about medication, follow-up
  6. If patient wants to book → transition to scheduling flow
  7. If no answer → try again later, or send SMS/WhatsApp
- [ ] **Outbound Call Script Builder**:
  ```json
  {
    "campaign": "annual_checkup_reminder",
    "greeting_ar": "السلام عليكم {patient_name}، معك نماء من {facility_name}",
    "purpose_ar": "نود تذكيرك بموعد الفحص السنوي. هل تود حجز موعد؟",
    "if_yes": "scheduling_flow",
    "if_no": "thank_and_end",
    "if_no_answer": "send_sms",
    "max_attempts": 3,
    "retry_interval_hours": 24
  }
  ```
- [ ] **Time-Aware Calling** — Only call during appropriate hours (configurable per org)
- [ ] **Do Not Call List** — Respect patient preferences

```
FILE: backend/src/routes/outbound.ts (NEW)
```
- [ ] `POST /api/outbound/campaigns` — Create campaign
- [ ] `GET /api/outbound/campaigns/:orgId` — List campaigns
- [ ] `POST /api/outbound/campaigns/:id/start` — Start campaign
- [ ] `POST /api/outbound/campaigns/:id/pause` — Pause campaign
- [ ] `GET /api/outbound/campaigns/:id/results` — Campaign analytics

---

## 12. OUTBOUND — Appointment Reminders & No-Show Prevention

### What Both Do:
- Automated reminders at configurable intervals (48h, 24h, 2h before)
- Multi-channel: SMS, WhatsApp, voice call
- Easy confirm/reschedule/cancel via reply
- Reduce no-shows by up to 50%

### Implementation Tasks:

```
FILE: backend/src/services/reminders/appointmentReminder.ts (NEW)
```
- [ ] **Reminder Scheduler** (cron-based):
  ```
  48h before: SMS reminder with confirm/cancel buttons
  24h before: WhatsApp reminder with appointment details
  2h before: Final SMS reminder
  Post-appointment: Satisfaction survey
  ```
- [ ] **Confirm/Cancel via Reply**:
  - Patient replies "تأكيد" or "1" → Mark confirmed
  - Patient replies "إلغاء" or "2" → Cancel + offer reschedule
  - Patient replies "تغيير" or "3" → Start reschedule flow
- [ ] **No-Show Prediction** — Flag patients with history of no-shows:
  - Extra reminder call for high-risk patients
  - Overbook slots for habitual no-shows
- [ ] **Waitlist Auto-Fill** — When cancellation happens, notify waitlist patients

### Schema Addition:
```prisma
model AppointmentReminder {
  reminderId    String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  appointmentId String   @db.Uuid
  channel       String   // "sms" | "whatsapp" | "voice"
  scheduledFor  DateTime @db.Timestamptz(6)
  sentAt        DateTime? @db.Timestamptz(6)
  status        String   @default("pending") // pending | sent | confirmed | cancelled | rescheduled
  response      String?  // Patient's reply
  createdAt     DateTime @default(now()) @db.Timestamptz(6)
  @@map("appointment_reminders")
}
```

---

## 13. OUTBOUND — Campaign Management

### What Syllable/Actium Does:
- Health system-wide outreach campaigns
- Target specific patient populations
- Multi-wave campaigns (call → SMS → WhatsApp)
- Results tracking per campaign
- A/B testing of scripts

### Implementation Tasks:

```
FILE: backend/src/services/campaigns/campaignManager.ts (NEW)
```
- [ ] **Campaign Builder**:
  ```
  1. Define target audience (filters: age, condition, last visit, etc.)
  2. Choose channel sequence: Voice → SMS → WhatsApp
  3. Set schedule and throttling (max calls/hour)
  4. Write scripts (Arabic + English)
  5. Launch
  ```
- [ ] **Campaign Types**:
  - `recall` — Bring back patients overdue for visits
  - `preventive` — Screening campaigns (mammogram, diabetes check)
  - `follow_up` — Post-procedure follow-ups
  - `satisfaction` — NPS/satisfaction surveys
  - `announcement` — New services, new doctors, Ramadan hours
- [ ] **Campaign Analytics Dashboard**:
  - Patients contacted / reached / booked
  - Conversion rate
  - Revenue generated
  - Best performing scripts
  - Channel effectiveness comparison

### Schema Addition:
```prisma
model Campaign {
  campaignId     String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId          String   @db.Uuid
  name           String
  nameAr         String?
  type           String   // "recall" | "preventive" | "follow_up" | "satisfaction" | "announcement"
  status         String   @default("draft") // draft | active | paused | completed
  targetFilter   Json     // Patient selection criteria
  channelSequence String[] // ["voice", "sms", "whatsapp"]
  scriptEn       String?
  scriptAr       String?
  maxCallsPerHour Int     @default(50)
  startDate      DateTime? @db.Timestamptz(6)
  endDate        DateTime? @db.Timestamptz(6)
  createdAt      DateTime @default(now()) @db.Timestamptz(6)
  updatedAt      DateTime @default(now()) @updatedAt @db.Timestamptz(6)
  @@map("campaigns")
}

model CampaignTarget {
  targetId     String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  campaignId   String   @db.Uuid
  patientId    String   @db.Uuid
  status       String   @default("pending") // pending | calling | reached | no_answer | booked | declined | dnc
  attempts     Int      @default(0)
  lastChannel  String?  // Last channel used
  bookedApptId String?  @db.Uuid
  notes        String?
  createdAt    DateTime @default(now()) @db.Timestamptz(6)
  updatedAt    DateTime @default(now()) @updatedAt @db.Timestamptz(6)
  @@map("campaign_targets")
}
```

---

## 14. OUTBOUND — Predictive Analytics (CENTARI-like)

### What Syllable/Actium CENTARI Does:
- Predicts which patients need specific medical services
- Identifies care gaps (missed screenings, overdue checkups)
- Risk progression modeling (who's likely to get worse)
- Prioritizes outreach by medical need urgency
- Measurable impact: 1,395 lives affected by early cancer detection

### Implementation Tasks:

```
FILE: backend/src/services/analytics/predictiveEngine.ts (NEW)
```
- [ ] **Care Gap Detection** — Scan patient records for:
  - Last visit > 12 months → Annual checkup due
  - Age 40+ female, no mammogram > 1 year → Screening due
  - Diabetic, no HbA1c > 6 months → Follow-up due
  - Post-surgery > 2 weeks, no follow-up → Follow-up due
  - Chronic condition, no visit > 3 months → Review due
- [ ] **Risk Scoring** — Score patients 0-100 based on:
  - Number of missed appointments
  - Time since last visit
  - Known conditions severity
  - Age-based risk factors
  - Medication adherence
- [ ] **Priority Queue** — Sort outreach list by risk score
- [ ] **Configurable Rules** — Org can define their own care gap rules:
  ```json
  {
    "rule": "annual_physical",
    "condition": "last_visit_days > 365",
    "priority": "medium",
    "action": "outbound_call",
    "message_ar": "حان موعد فحصك السنوي"
  }
  ```

### Schema Addition:
```prisma
model CareGapRule {
  ruleId       String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId        String   @db.Uuid
  name         String
  nameAr       String?
  condition    Json     // Rule definition
  priority     String   @default("medium") // low | medium | high | critical
  action       String   // "outbound_call" | "sms" | "whatsapp" | "flag_only"
  messageEn    String?
  messageAr    String?
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now()) @db.Timestamptz(6)
  @@map("care_gap_rules")
}

model PatientCareGap {
  careGapId    String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  patientId    String   @db.Uuid
  ruleId       String   @db.Uuid
  riskScore    Int      @default(0) // 0-100
  status       String   @default("open") // open | contacted | scheduled | resolved | dismissed
  detectedAt   DateTime @default(now()) @db.Timestamptz(6)
  resolvedAt   DateTime? @db.Timestamptz(6)
  @@map("patient_care_gaps")
}
```

---

## 15. ANALYTICS — Conversational Intelligence Dashboard

### What Hyro Does:
- Real-time analytics on all patient interactions
- Call volume trends
- Resolution rates
- Patient journey mapping
- Knowledge gap identification (what AI couldn't answer)
- Call driver analysis (why patients are calling)
- Conversion rate: calls → appointments booked

### What Syllable Does:
- Insights with automated QA/QM
- Centralized control across locations
- Performance metrics per facility/department

### Implementation Tasks:

```
FILE: backend/src/routes/analytics.ts (ENHANCE existing)
```
- [ ] `GET /api/analytics/overview` — Key metrics:
  ```json
  {
    "totalCalls": 1250,
    "aiResolved": 1062,     // 85%
    "humanEscalated": 188,  // 15%
    "avgCallDuration": 180, // seconds
    "appointmentsBooked": 450,
    "conversionRate": 0.36,
    "avgWaitTime": 5,       // seconds
    "satisfactionScore": 4.2,
    "topCallDrivers": [
      {"reason": "scheduling", "count": 520, "pct": 41.6},
      {"reason": "prescription", "count": 275, "pct": 22.0},
      {"reason": "faq", "count": 200, "pct": 16.0}
    ]
  }
  ```
- [ ] `GET /api/analytics/trends` — Time-series data (hourly/daily/weekly/monthly)
- [ ] `GET /api/analytics/knowledge-gaps` — Questions AI couldn't answer (for improving FAQ)
- [ ] `GET /api/analytics/call-drivers` — Why patients are calling
- [ ] `GET /api/analytics/patient-journey` — Funnel: call → verification → intent → resolution
- [ ] `GET /api/analytics/facility/:facilityId` — Per-facility breakdown
- [ ] `GET /api/analytics/revenue-impact` — Appointments booked = revenue generated

```
FILE: frontend/src/pages/Analytics.tsx (NEW — full page)
```
- [ ] **Dashboard Cards**: Total calls, AI resolution rate, appointments booked, avg wait time
- [ ] **Call Volume Chart**: Line chart by hour/day/week
- [ ] **Call Drivers Pie Chart**: Why patients call
- [ ] **Resolution Funnel**: Sankey diagram of call outcomes
- [ ] **Knowledge Gaps Table**: Unanswered questions + add-to-FAQ button
- [ ] **Facility Comparison**: Bar chart comparing facilities
- [ ] **Revenue Impact Card**: Estimated revenue from AI-booked appointments
- [ ] **Real-Time Monitor**: Live active calls ticker

---

## 16. ANALYTICS — Automated QA/QM

### What Syllable/Actium Does:
- Automated Quality Assurance on every call
- Score calls on: accuracy, tone, resolution, compliance
- Flag problematic calls for human review
- Track agent performance (AI + human)

### Implementation Tasks:

```
FILE: backend/src/services/analytics/qualityAnalyzer.ts (NEW)
```
- [ ] **Post-Call Analysis** (run async after each call):
  - **Accuracy Score** — Did AI give correct information?
  - **Tone Score** — Was the interaction professional and empathetic?
  - **Resolution Score** — Was the caller's issue resolved?
  - **Compliance Score** — Were HIPAA/privacy rules followed?
  - **Overall Score** — Weighted average (0-100)
- [ ] **Auto-Flag for Review**:
  - Score < 60 → Flag for human review
  - Patient expressed frustration → Flag
  - Call ended abruptly → Flag
  - PHI potentially exposed → Flag + alert
- [ ] **Trend Analysis** — Track quality scores over time to spot degradation

### Schema Addition:
```prisma
model CallQualityScore {
  scoreId         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  callId          String?  @db.Uuid
  conversationId  String?  @db.Uuid
  accuracyScore   Int      // 0-100
  toneScore       Int      // 0-100
  resolutionScore Int      // 0-100
  complianceScore Int      // 0-100
  overallScore    Int      // 0-100
  flagged         Boolean  @default(false)
  flagReason      String?
  reviewedBy      String?
  reviewNotes     String?
  analyzedAt      DateTime @default(now()) @db.Timestamptz(6)
  @@map("call_quality_scores")
}
```

---

## 17. ANALYTICS — Call Driver Analysis

### What Hyro Does:
- Automatically categorizes WHY patients call
- Identifies trending issues (flu season = more sick visits)
- Recommends operational changes based on patterns
- Surfaces gaps in AI coverage

### Implementation Tasks:

```
FILE: backend/src/services/analytics/callDriverAnalyzer.ts (NEW)
```
- [ ] **Auto-Categorize Every Interaction**:
  ```
  call_drivers = [
    "appointment_new", "appointment_reschedule", "appointment_cancel",
    "prescription_refill", "prescription_status",
    "billing_question", "insurance_verification",
    "physician_search", "location_search",
    "test_results", "referral_status",
    "portal_help", "password_reset",
    "general_question", "complaint",
    "emergency_triage", "other"
  ]
  ```
- [ ] **Trending Topics** — Detect spikes (e.g., suddenly many calls about "flu vaccine")
- [ ] **Gap Detection** — Topics where AI fails most → suggest new FAQ entries
- [ ] **Recommendations Engine**:
  - "40% of calls are about scheduling → improve online booking visibility"
  - "Password reset calls spiked 200% → add self-service reset to website"

---

## 18. PLATFORM — Multi-Tenant Fleet Management

### What Syllable/Actium Does:
- Manage AI agents across dozens/hundreds of locations
- Central dashboard, per-site customization
- Define behavior once, deploy everywhere
- Unique greetings, languages, FAQs per site
- Automated failover

### What Hyro Does:
- No-code configuration changes
- Bulk updates across locations
- Individual and system-wide tuning

### Implementation Tasks:

```
FILE: frontend/src/pages/FleetDashboard.tsx (NEW)
```
- [ ] **Fleet Overview**: Map view of all facilities with status indicators
- [ ] **Per-Facility Cards**: Active calls, resolution rate, queue length
- [ ] **Bulk Operations**: Update greeting, hours, FAQ across all or selected facilities
- [ ] **Config Inheritance**: Global defaults → Org overrides → Facility overrides
- [ ] **Health Monitor**: Green/yellow/red status per facility AI agent
- [ ] **Alerts**: Notify when a facility's AI is underperforming

```
FILE: backend/src/routes/fleet.ts (NEW)
```
- [ ] `GET /api/fleet/overview` — All facilities with live metrics
- [ ] `POST /api/fleet/bulk-update` — Apply config to multiple facilities
- [ ] `GET /api/fleet/health` — System health check per facility

### Schema Addition:
```prisma
model FacilityConfig {
  configId     String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  facilityId   String   @unique @db.Uuid
  greetingEn   String?
  greetingAr   String?
  businessHours Json?   // {"sun": {"open": "08:00", "close": "22:00"}, ...}
  languages    String[] @default(["ar", "en"])
  aiEnabled    Boolean  @default(true)
  maxWaitSec   Int      @default(30)
  afterHoursMsg String?
  customFaqs   Json?    // Facility-specific FAQs
  createdAt    DateTime @default(now()) @db.Timestamptz(6)
  updatedAt    DateTime @default(now()) @updatedAt @db.Timestamptz(6)
  @@map("facility_configs")
}
```

---

## 19. PLATFORM — No-Code Agent Builder

### What Hyro Does:
- No-code platform — admins configure AI without developers
- Drag-and-drop conversation flow builder
- Plain English/Arabic descriptions → AI behavior
- Quick deploy (3 days from zero to live)
- Dashboard for config changes without coding

### Implementation Tasks:

```
FILE: frontend/src/pages/AgentBuilder.tsx (NEW)
```
- [ ] **Visual Flow Builder** (React Flow / reactflow library):
  - Drag-and-drop nodes: Greeting, Question, Action, Condition, Transfer
  - Connect nodes with arrows
  - Preview conversation in simulator
- [ ] **Template Library**: Pre-built flows for common scenarios:
  - Appointment booking flow
  - Prescription refill flow
  - FAQ answering flow
  - After-hours flow
- [ ] **Plain Language Config**: 
  ```
  "When a patient calls about scheduling, greet them in Arabic,
   verify their identity, then show available slots for their
   requested specialty within the next 7 days."
  ```
- [ ] **Test Simulator**: Chat with the AI agent to test before going live
- [ ] **Version Control**: Save and rollback flow versions

---

## 20. PLATFORM — Integrations (EMR/CRM/Contact Center)

### What Hyro Integrates With:
- **Epic EMR** (MyChart) — Patient records, scheduling, prescriptions
- **eClinicalWorks** — EMR
- **Salesforce Health Cloud** — CRM
- **Genesys Cloud CX** — Contact center
- **Cisco Webex** — Contact center
- **Twilio Flex** — Contact center
- **Zendesk** — Ticketing

### Implementation Tasks:

```
FILE: backend/src/services/integrations/ (NEW DIRECTORY)
```
- [ ] **Integration Framework** — Plugin architecture for EMR/CRM connectors:
  ```typescript
  interface EMRConnector {
    getPatient(mrn: string): Promise<Patient>
    getAppointments(patientId: string): Promise<Appointment[]>
    bookAppointment(data: BookingData): Promise<Appointment>
    getPrescriptions(patientId: string): Promise<Prescription[]>
    requestRefill(prescriptionId: string): Promise<RefillStatus>
  }
  ```
- [ ] **Webhook System** — Send events to external systems:
  ```
  Events: appointment.booked, appointment.cancelled, patient.verified,
          prescription.refill_requested, call.completed, handoff.created
  ```
- [ ] **API Key Management** — Secure storage of third-party credentials per org
- [ ] **Saudi-Specific Integrations** (priority):
  - **Nphies** — Health insurance claims
  - **Absher** — National ID verification
  - **Tawakkalna** — Health status
  - **Seha** — MOH virtual hospital

### Schema Addition:
```prisma
model Integration {
  integrationId String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId         String   @db.Uuid
  type          String   // "emr" | "crm" | "contact_center" | "sms" | "custom"
  provider      String   // "epic" | "salesforce" | "genesys" | "nphies" | "custom"
  config        Json     // Encrypted credentials and settings
  isActive      Boolean  @default(true)
  lastSyncAt    DateTime? @db.Timestamptz(6)
  createdAt     DateTime @default(now()) @db.Timestamptz(6)
  @@map("integrations")
}

model WebhookSubscription {
  webhookId   String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId       String   @db.Uuid
  event       String   // "appointment.booked" etc.
  url         String
  secret      String
  isActive    Boolean  @default(true)
  lastFiredAt DateTime? @db.Timestamptz(6)
  failCount   Int      @default(0)
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  @@map("webhook_subscriptions")
}
```

---

## 21. PLATFORM — Security & Compliance

### What Hyro Does:
- HIPAA compliant
- SOC2 certified
- GDPR / CCPA compliant
- PII/PHI automatic redaction in logs
- Data source control (AI only uses approved sources)
- Explainability (show why AI said what it said)
- SSO support

### Implementation Tasks:

```
FILE: backend/src/services/security/piiRedactor.ts (NEW)
```
- [ ] **PII/PHI Auto-Redaction**:
  - Scan all logged text for: National ID, phone, DOB, medical conditions
  - Replace with `[REDACTED]` in logs, keep original in encrypted field
  - Arabic + English pattern matching
  - Regex patterns for Saudi ID (10 digits starting with 1 or 2), phone (+966)
- [ ] **Data Encryption**:
  - At rest: Encrypt sensitive columns (already using PostgreSQL)
  - In transit: TLS everywhere (enforce HTTPS)
  - Conversation logs: Encrypted at application level
- [ ] **Audit Trail**:
  - Log every data access with who/what/when
  - Track admin config changes
  - Exportable audit reports
- [ ] **Role-Based Access Control (RBAC)**:
  ```
  Roles: super_admin, org_admin, facility_admin, agent, viewer
  Permissions: manage_org, manage_facilities, view_analytics,
               manage_patients, manage_appointments, view_calls,
               manage_campaigns, manage_integrations
  ```
- [ ] **Session Management**: JWT with refresh tokens, session timeout, force logout

### Schema Addition:
```prisma
model AuditLog {
  auditId    String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId      String   @db.Uuid
  userId     String?  @db.Uuid
  action     String   // "patient.viewed" | "config.changed" | "call.accessed"
  resource   String   // "patient" | "appointment" | "conversation"
  resourceId String?
  details    Json?
  ipAddress  String?
  createdAt  DateTime @default(now()) @db.Timestamptz(6)
  @@map("audit_logs")
}

model Role {
  roleId      String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId       String   @db.Uuid
  name        String
  permissions String[]
  isSystem    Boolean  @default(false)
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  @@map("roles")
}
```

---

## 22. PLATFORM — Multi-Language & Dialect Support

### What Namaa Already Has:
- Arabic dialect detection (Gulf, Egyptian, Levantine, MSA)
- i18n (AR + EN)

### What Syllable Does:
- 5 languages supported
- Language detection on call

### Enhancement Tasks:

```
FILE: backend/src/services/voice/dialectDetector.ts (ENHANCE)
```
- [ ] **Add Languages**: Urdu, Hindi, Tagalog, Bengali (common in Saudi healthcare)
- [ ] **Auto-Switch**: Detect language in first sentence, switch AI response language
- [ ] **Per-Facility Language Config**: Some facilities may need Urdu more than others
- [ ] **Translation Layer**: Real-time translation for human agent handoff
  - Patient speaks Urdu → AI translates to Arabic for the doctor

---

## 23. AI — Responsible AI Safeguards

### What Hyro Does:
- **Control**: AI only acts within defined boundaries
- **Clarity**: Explains its reasoning, admits when unsure
- **Compliance**: Never shares unauthorized information
- Prevents hallucinations via knowledge graph
- Fine-tuned small language models for medical accuracy

### Implementation Tasks:

```
FILE: backend/src/services/ai/guardrails.ts (NEW)
```
- [ ] **Hallucination Prevention**:
  - AI can ONLY reference data from the org's knowledge base + database
  - Never invent doctor names, availability, or medical advice
  - If unsure: "I'm not sure about that. Let me connect you with someone who can help."
- [ ] **Response Validation**:
  - Post-generate check: Does response contain real data from DB?
  - Medical claim detection → "I can't provide medical advice, but I can schedule you with a doctor"
  - Block responses that include data from wrong patient
- [ ] **Confidence Scoring**:
  - Each AI response gets a confidence score (0-1)
  - Below 0.6 → Transfer to human
  - Below 0.3 → "I didn't quite understand. Could you rephrase?"
- [ ] **Scope Boundaries**:
  ```
  ALLOWED: Scheduling, prescription status, FAQ, directions, hours
  NOT ALLOWED: Medical diagnosis, treatment advice, test result interpretation
  ```

---

## 24. AI — Patient Memory & Context

### What Namaa Already Has:
- `PatientMemory` model (preference, condition, allergy, medication, etc.)
- Conversation summaries

### Enhancement Tasks:

```
FILE: backend/src/services/ai/contextBuilder.ts (NEW)
```
- [ ] **Cross-Conversation Memory**:
  - Remember patient preferences across all interactions
  - "Last time you preferred morning appointments — want me to look for mornings again?"
  - Track preferred provider, facility, language
- [ ] **Conversation Continuity**:
  - If patient calls back same day → "Welcome back! Are you calling about the appointment we discussed earlier?"
  - Load last conversation summary into context
- [ ] **Family Context**:
  - "I'm also booking for my kids" → Remember family members
  - Suggest family bundled appointments

---

## 25. Implementation Priority Matrix

### 🔴 Phase 1 — Core (Weeks 1-4) — Must Have
| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 1 | Smart Call Routing & Handoff | Medium | High |
| 2 | Patient Identity Verification | Medium | High |
| 3 | Enhanced Appointment Scheduling (waitlist, reschedule by voice) | Medium | High |
| 4 | Appointment Reminders (SMS/WhatsApp) | Low | Very High |
| 5 | SMS Deflection (send links during calls) | Low | High |
| 6 | PII/PHI Redaction | Medium | Critical |
| 7 | Basic Analytics Dashboard | Medium | High |

### 🟡 Phase 2 — Growth (Weeks 5-8) — Important
| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 8 | FAQ Knowledge Base | Medium | High |
| 9 | Prescription Management | High | High |
| 10 | Physician & Location Search | Medium | Medium |
| 11 | Embeddable Chat Widget | Medium | High |
| 12 | Call Quality Scoring (QA) | Medium | Medium |
| 13 | Call Driver Analytics | Low | High |
| 14 | Multi-Facility Config | Medium | High |

### 🟢 Phase 3 — Scale (Weeks 9-16) — Competitive Edge
| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 15 | Outbound Calling Engine | Very High | Very High |
| 16 | Campaign Management | High | High |
| 17 | Predictive Analytics (Care Gaps) | High | Very High |
| 18 | No-Code Flow Builder | Very High | Medium |
| 19 | Integration Framework (EMR/CRM) | High | High |
| 20 | RBAC & Audit Trails | Medium | High |
| 21 | Fleet Management Dashboard | Medium | Medium |
| 22 | Multi-Language Expansion | Medium | Medium |
| 23 | AI Guardrails & Responsible AI | Medium | Critical |

---

## 26. Database Schema Additions

All new models to add to `backend/prisma/schema.prisma`:

```
New Models (17):
1.  Waitlist
2.  PatientVerification
3.  Prescription
4.  PrescriptionRefill
5.  MedicationReminder
6.  FaqEntry
7.  TriageRule
8.  EscalationRule
9.  Handoff
10. SmsTemplate
11. SmsLog
12. AppointmentReminder
13. Campaign
14. CampaignTarget
15. CareGapRule
16. PatientCareGap
17. CallQualityScore
18. FacilityConfig
19. Integration
20. WebhookSubscription
21. AuditLog
22. Role

Modified Models:
- Provider: Add gender, languages, insuranceAccepted, bio, bioAr, rating
- Patient: Add nationalId, insuranceId, preferredLanguage, doNotCall
```

---

## 27. New API Routes Needed

```
Backend Routes to Create:
├── src/routes/
│   ├── callCenter.ts      — Call center management
│   ├── waitlist.ts        — Waitlist management
│   ├── prescriptions.ts   — Rx management
│   ├── faq.ts             — FAQ CRUD
│   ├── smsTemplates.ts    — SMS template management
│   ├── outbound.ts        — Outbound campaigns
│   ├── campaigns.ts       — Campaign management
│   ├── fleet.ts           — Multi-facility fleet
│   ├── integrations.ts    — EMR/CRM integrations
│   ├── widget.ts          — Embeddable chat widget
│   ├── quality.ts         — QA scoring
│   └── audit.ts           — Audit logs
```

---

## 28. New Frontend Pages Needed

```
Frontend Pages to Create:
├── src/pages/
│   ├── Analytics.tsx          — Full analytics dashboard (ENHANCE)
│   ├── CallCenter.tsx         — Live call center monitor
│   ├── Prescriptions.tsx      — Prescription management
│   ├── FAQ.tsx                — FAQ knowledge base editor
│   ├── Campaigns.tsx          — Campaign management
│   ├── CampaignDetail.tsx     — Single campaign view
│   ├── Reminders.tsx          — Reminder settings
│   ├── FleetDashboard.tsx     — Multi-facility overview
│   ├── AgentBuilder.tsx       — No-code flow builder
│   ├── Integrations.tsx       — Integration settings
│   ├── QualityReview.tsx      — QA dashboard
│   ├── AuditLog.tsx           — Security audit log
│   └── Settings.tsx           — ENHANCE with RBAC, templates
│
├── src/components/
│   ├── chat/EmbeddableWidget.tsx  — Standalone chat widget
│   ├── analytics/                  — Chart components
│   └── campaigns/                  — Campaign UI components
```

---

## Source References

- **Hyro Health**: https://www.hyro.ai — $45M+ funded, 50+ health systems, 85% call automation
- **Syllable AI / ActiumHealth**: https://syllable.ai / https://actiumhealth.com — $85.6M funded, Series C, acquired Actium Health (CENTARI)
- **Hyro Case Studies**: Tampa General Hospital, Bon Secours Mercy Health (5+ year partnership)
- **Syllable Stats**: 70% calls routed by AI, 40% reduction in abandoned calls, 5 languages, 1,395 lives impacted by early diagnoses
- **Hyro Integrations**: Epic, Salesforce, Genesys, Cisco, eClinicalWorks, Twilio, Zendesk
- **Hyro Compliance**: HIPAA, SOC2, GDPR, CCPA

---

> **How to use this file with Claude Code CLI:**
> ```
> cd C:\Users\raskh\projects\ai-agent
> claude "Read COMPETITOR_FEATURES_SPEC.md and implement Phase 1 features (sections 2, 4, 3, 12, 9, 21, 15). Start with section 4 (Patient Identification) and section 12 (Appointment Reminders). Add the schema models to prisma/schema.prisma, create the service files, and add the API routes."
> ```
> 
> Or for a specific feature:
> ```
> claude "Read COMPETITOR_FEATURES_SPEC.md section 5 (Prescription Management). Add the Prescription, PrescriptionRefill, and MedicationReminder models to prisma/schema.prisma. Create backend/src/routes/prescriptions.ts and backend/src/services/prescription/rxManager.ts with all the listed tasks."
> ```
