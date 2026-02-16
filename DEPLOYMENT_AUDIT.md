# 🏥 Namaa (نماء) — Deployment Readiness Audit

**Audited:** 2026-02-15
**Auditor:** AI Deployment Auditor
**Project:** AI Medical Receptionist — Voice, WhatsApp & Web Chat
**Stack:** Fastify 4 · Prisma 5 · PostgreSQL 16 · Twilio · OpenAI/Gemini · ElevenLabs · React 18/Vite/Tailwind

---

## Executive Summary

| Area | Status | Score |
|------|--------|-------|
| Code Quality & Architecture | ✅ Good | 8/10 |
| API Completeness | ✅ Very Good | 9/10 |
| Voice AI System | ✅ Strong | 8.5/10 |
| Database | ✅ Good | 7.5/10 |
| Security | ⚠️ Needs Work | 5.5/10 |
| Deployment Readiness | ⚠️ Partial | 6/10 |
| Missing Features | ⚠️ Gaps | 5/10 |
| **Overall** | **⚠️ NOT production-ready** | **6.2/10** |

**Bottom line:** The codebase is architecturally sound and feature-rich. However, there are **critical security issues** (hardcoded API keys in .env committed to the repo, no Helmet, weak JWT secret, no global rate limiting) and **deployment gaps** (no CI/CD, no graceful shutdown on SIGTERM, only 1 Prisma migration) that MUST be fixed before going live with real patients.

---

## 1. Code Quality & Architecture — 8/10

### ✅ Strengths

- **Clean folder structure:** Well-organized `plugins/`, `routes/`, `services/`, `types/` separation
- **Plugin-based architecture:** Prisma, Twilio, OpenAI, Gemini, Scheduler all registered as proper Fastify plugins
- **Service layer:** Business logic lives in `services/` — not jammed into route handlers
  - `services/voice/` — call session, STT, TTS, dialect detection, Gemini Live
  - `services/ai/` — guardrails, validation
  - `services/security/` — PII redactor, audit logger
  - `services/messaging/` — WhatsApp handler, SMS deflector
  - `services/patient/` — context builder, identity verifier
  - `services/analytics/` — call drivers, quality, predictive engine
  - `services/campaigns/` — campaign manager
  - `services/pipelines/` — care gap campaigns, waitlist auto-fill
- **TypeScript end-to-end** with strict typing
- **Zod validation** on most route inputs (auth, appointments, etc.)
- **Global error handler** — catches Zod errors, JWT errors, returns proper HTTP codes; hides stack traces in production
- **Bilingual (Arabic/English)** throughout — system prompts, FAQ, SMS templates, UI
- **i18n on frontend** — `i18next` with `ar/en` translation files

### ⚠️ Issues

1. **Some routes return errors without proper HTTP status codes:**
   - `appointments.ts` returns `{ error: 'Appointment not found' }` without `reply.code(404)` — defaults to 200
   - Same pattern in several other routes (providers, services, etc.)
   - **Fix:** Ensure all "not found" paths return `reply.code(404).send(...)` and validation errors return 400

2. **Inconsistent error return patterns:**
   - Some use `return { error: '...' }` (returns 200)
   - Some use `reply.code(X).send(...)` (correct)
   - **Fix:** Standardize on `reply.code(X).send({ error, message })` everywhere

3. **No Helmet security headers on the backend:**
   - Zero references to `@fastify/helmet` in the codebase
   - Nginx adds some headers (X-Frame-Options, X-Content-Type-Options) but only in Docker
   - In development/non-Docker mode, there are NO security headers
   - **Fix:** `npm install @fastify/helmet` and register in `app.ts`

4. **No global rate limiting:**
   - Only `auth.ts` uses `@fastify/rate-limit` (10 req/min)
   - `demoChat.ts` has custom in-memory rate limiting
   - All other endpoints (including sensitive patient data) have NO rate limiting
   - **Fix:** Register `@fastify/rate-limit` globally in `app.ts` with sensible defaults (e.g., 100 req/min)

5. **Logging strategy is basic:**
   - Using Pino (Fastify's built-in) — good foundation
   - No structured log shipping (no ELK, Datadog, etc.)
   - No request correlation IDs across voice/chat/API
   - **Fix:** Add correlation ID middleware; plan log aggregation for production

### SQL Injection / Prisma Safety — ✅ Safe

- All database queries use Prisma Client — parameterized by design
- No raw SQL queries (`$queryRaw`) found in the codebase
- **No SQL injection risk**

---

## 2. API Completeness — 9/10

### ✅ Impressive Route Coverage

The API has **135+ endpoints** across these domains:

| Domain | Prefix | Key Endpoints |
|--------|--------|---------------|
| **Auth** | `/api/auth` | register, login, me |
| **Patients** | `/api/patients` | CRUD + memories |
| **Appointments** | `/api/appointments` | CRUD + status + availability |
| **Providers** | `/api/providers` | CRUD + availability rules + services |
| **Services** | `/api/services` | CRUD |
| **Departments** | `/api/departments` | CRUD |
| **Facilities** | `/api/facilities` | CRUD |
| **Voice** | `/api/voice` | incoming, status, fallback, make-call, outbound, stream, stream-gemini, health |
| **WhatsApp** | `/api/whatsapp` | webhook, status, health |
| **Chat** | `/api/chat` | message, conversations, new, WebSocket |
| **Demo Chat** | `/api/demo-chat` | message, new, health (public) |
| **Analytics** | `/api/analytics` | overview, trends, services, channels |
| **Analytics V2** | `/api/analytics-v2` | call-drivers, containment, satisfaction, predictive, quality, fleet, export |
| **Phone Numbers** | `/api/phone-numbers` | CRUD + purchase + forward + test |
| **Prescriptions** | `/api/prescriptions` | CRUD + refills + reminders + interactions |
| **FAQ** | `/api/faq` | CRUD + search + triage |
| **SMS Templates** | `/api/sms-templates` | CRUD + send |
| **Call Center** | `/api/call-center` | status, queue, active, handoffs, transfer, suggest |
| **Waitlist** | `/api/waitlist` | add, notify, book, stats |
| **Outbound** | `/api/outbound` | campaigns CRUD + start/pause/execute |
| **Reminders** | `/api/reminders` | configure, process, stats |
| **Care Gaps** | `/api/care-gaps` | scan, risk, rules, queue |
| **Fleet** | `/api/fleet` | overview, bulk-update, health, config |
| **Scheduler** | `/api/scheduler` | status, jobs, trigger |
| **Audit** | `/api/audit` | logs + export |
| **Agent Builder** | `/api/agent-builder` | flows CRUD + publish + templates + simulate |
| **Campaigns** | `/api/campaigns` | CRUD (org-scoped) |
| **Patient Portal** | `/api/patient-portal` | login, me, appointments, prescriptions, profile, providers, services, availability |
| **Widget** | `/api/widget` | config, widget.js |
| **Health** | `/health` | OK ✅ (tested, responds) |

### ✅ Swagger/OpenAPI

- **Swagger UI** served at `/docs` — auto-generated from routes
- Bearer auth security scheme configured
- Tested: `/docs/json` returns full OpenAPI 3.0.3 spec

### ⚠️ Issues

1. **No request/response schema annotations on most routes:**
   - Swagger generates endpoints but lacks request body / response schemas
   - Only auth routes have Zod schemas, but they're not wired to Swagger
   - **Fix:** Add Fastify schema definitions or use `@fastify/swagger`'s schema support to document request/response types

2. **Some endpoints return 200 for errors (as noted above)**

---

## 3. Voice AI System — 8.5/10

### ✅ Excellent Architecture

**Dual Voice Engine Support:**
- **OpenAI + ElevenLabs path:** Whisper STT → GPT-4 → ElevenLabs TTS → mulaw conversion → Twilio
- **Gemini Multimodal Live path:** Real-time bidirectional audio via WebSocket with native Arabic voice

**Inbound Call Flow:**
1. Twilio calls `/api/voice/incoming` → creates session, conversation, VoiceCall record
2. Connects Twilio Media Stream to WebSocket (`/api/voice/stream` or `/api/voice/stream-gemini`)
3. Audio processed in real-time with silence detection (1.5s threshold)
4. AI response streamed back as TTS audio
5. Call status tracked via `/api/voice/status` webhook
6. Fallback handler at `/api/voice/fallback`

**Outbound Call Support:**
- Campaign-driven outbound calls (`/api/voice/outbound-script`)
- Same AI voice pipeline used for outbound conversations
- Campaign context (patient, type) passed through stream parameters

**Advanced Features:**
- **Arabic dialect detection** — Gulf, Egyptian, Levantine, MSA with auto-switching
- **Caller interruption handling** — clears Twilio audio buffer when caller speaks
- **Gemini function calling** — check_availability, book_appointment, get_patient_appointments, cancel_appointment
- **Smart routing** — intent detection → escalation rules → human transfer
- **Post-call processing** — SMS follow-up, memory extraction, conversation close
- **AI Guardrails** — medical claim detection, hallucination check, scope violations, PII leak prevention, wrong-patient check
- **PII Redaction** — Saudi National ID, phone numbers, DOB, email, MRN, credit cards, IBAN
- **SMS deflection** — mid-call SMS for scheduling links

**WhatsApp AI:**
- Full conversational AI via Twilio WhatsApp webhooks
- Patient identification via phone → PatientContact lookup
- Conversation context with last 10 messages
- Patient-specific context (upcoming appointments, active prescriptions)
- Gulf Arabic dialect by default, switches to English if user writes in English
- 24-hour conversation window management (auto-closes stale conversations)
- Same guardrails pipeline as voice

### ⚠️ Issues

1. **No max call duration enforcement:**
   - `VOICE_MAX_CALL_DURATION_SEC=600` exists in env but is **never checked/enforced** in code
   - A stuck call could run indefinitely
   - **Fix:** Add a timer in the WebSocket handler that gracefully ends the call after the configured duration

2. **Gemini guardrails lag:**
   - In the Gemini stream, audio is sent to Twilio BEFORE guardrail validation completes
   - The text event (which triggers guardrails) arrives after audio is already playing
   - Comment in code acknowledges: _"Note: audio was already streamed by Gemini. The text log reflects the flag."_
   - **Fix:** For Gemini, consider a real-time audio interception layer or accept the risk with post-hoc logging

3. **OpenAI STT → LLM → TTS latency:**
   - Sequential: accumulate audio → convert to WAV → call Whisper → call GPT-4 → call ElevenLabs → convert to mulaw → send
   - Could result in 3-5 second response times
   - **Mitigation:** Gemini mode bypasses this with real-time streaming

4. **No WebSocket authentication:**
   - `/api/voice/stream` and `/api/voice/stream-gemini` WebSocket endpoints have no auth
   - They rely on Twilio sending the correct callSid, but anyone could connect
   - **Risk:** Low (attacker needs to know the WebSocket URL and a valid callSid), but should be hardened

5. **In-memory call session management:**
   - `callSessionManager` is in-memory — lost on server restart
   - Active calls during deployment will be orphaned
   - **Fix:** For production, consider Redis-backed sessions or accept brief disruption during deploys

---

## 4. Database — 7.5/10

### ✅ Strengths

**Comprehensive Prisma Schema:** 40+ models covering:
- Org, Facility, Department, Provider, Service, ProviderService, ProviderAvailabilityRule, ProviderTimeOff
- Patient, PatientContact, PatientMemory
- MessagingUser, MessagingUserPatientLink
- Conversation, ConversationMessage, ConversationSummary
- Appointment, AppointmentStatusHistory
- VoiceCall, VoiceUtterance
- OrgPhoneNumber, AgentFlow, AgentFlowSession
- AppointmentReminder, AuditLog, CallQualityScore
- Campaign, CampaignTarget, CareGapRule, PatientCareGap
- EscalationRule, Handoff, FacilityConfig
- FaqEntry, TriageRule, Integration
- Prescription, PrescriptionRefill, MedicationReminder
- PatientVerification, SmsLog, SmsTemplate
- User, Role, Waitlist, WebhookSubscription, OutboxEvent

**Indexes:** Present on key lookup patterns:
- `idx_patient_contacts_lookup` — (contactType, contactValue)
- `idx_appointments_patient_time` — (patientId, startTs DESC)
- `idx_appointments_provider_time` — (providerId, startTs DESC)
- Conversation summaries by (conversationId, createdAt DESC)
- Voice calls by (orgId, startedAt DESC)
- Various composite indexes on status/org/category fields

**Multi-tenancy:** Consistent `orgId` on all models — queries scoped by org

**Seed data:** Excellent seed script (`prisma/seed.ts`) that creates a complete demo hospital:
- 1 org, 2 facilities, 3 departments, 3 providers with availability rules
- 5 services, 5 patients with contacts and memories
- 10 appointments (past/future, various statuses)
- 5 FAQ entries, 3 triage rules, 5 SMS templates
- 3 prescriptions with refill history
- 1 campaign with 3 targets, 2 care gap rules, 2 roles, 2 facility configs
- Agent builder flow templates

### ⚠️ Issues

1. **Only 1 migration exists:**
   - `prisma/migrations/20251226000000_add_chat_memory/migration.sql`
   - Most schema appears to have been applied via `prisma db push` (no migration history)
   - **Risk:** No rollback capability; difficult to track schema changes in production
   - **Fix:** Generate a proper baseline migration: `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > baseline.sql`

2. **Missing indexes for production scale:**
   - `ConversationMessage` — no index on `conversationId` alone (only composite unique with `platformMessageId`)
   - `VoiceUtterance` — index on `(callId, timestamp)` ✅ but no index on `callId` alone
   - `MessagingUser` — unique index on `(orgId, channel, externalUserId)` ✅
   - `User` — unique on `email` ✅ but no index on `orgId`
   - `OutboxEvent` — no index on `processedAt` for polling unprocessed events
   - **Fix:** Add missing indexes, especially for OutboxEvent polling

3. **No soft delete:**
   - Most models use hard `DELETE` (e.g., patients, appointments)
   - Medical records may need retention for compliance
   - **Fix:** Add `deletedAt` field for models that require compliance retention

4. **Duplicate enum definitions:**
   - Both PascalCase (`AppointmentStatus`, `Channel`) and snake_case (`appointment_status`, `channel`) enums exist
   - Prisma uses the snake_case ones; PascalCase ones appear unused
   - **Fix:** Remove duplicate PascalCase enums to avoid confusion

---

## 5. Security — 5.5/10 ⚠️ CRITICAL

### 🔴 CRITICAL Issues

1. **HARDCODED API KEYS IN `.env` FILE:**
   ```
   OPENAI_API_KEY=sk-proj-R90WskMwy...
   GEMINI_API_KEY=AQ.Ab8RN6JS3yyk...
   TWILIO_ACCOUNT_SID=AC32caef44515a...
   TWILIO_AUTH_TOKEN=6df66937f15d67...
   ELEVENLABS_API_KEY=82e6fd589...
   ```
   - While `.env` IS in `.gitignore`, if this was EVER committed to git, the keys are compromised
   - **Action:** Rotate ALL API keys immediately. Verify git history with `git log --all --diff-filter=A -- backend/.env`
   - Use a secrets manager (AWS Secrets Manager, Vault, etc.) for production

2. **JWT_SECRET is the DEFAULT value:**
   ```
   JWT_SECRET=your-super-secret-key-change-in-production
   ```
   - The code warns about this but still USES it — anyone who reads the source can forge JWT tokens
   - **Fix:** Generate a strong random secret: `openssl rand -base64 64`

3. **SKIP_TWILIO_VERIFY=true in development .env:**
   - Disables Twilio webhook signature verification
   - If this leaks to production, anyone can send fake webhook payloads
   - **Fix:** Ensure production .env NEVER has this flag

### ⚠️ Important Issues

4. **No `@fastify/helmet`:**
   - No Content-Security-Policy, no HSTS, no X-Permitted-Cross-Domain-Policies
   - Nginx adds some headers but only in Docker deployment
   - **Fix:** `npm install @fastify/helmet` and register globally

5. **No global rate limiting:**
   - Only auth routes are rate-limited
   - Patient data, appointment booking, analytics — all unprotected
   - A malicious actor could scrape all patient data
   - **Fix:** Register `@fastify/rate-limit` globally

6. **No role-based authorization (RBAC):**
   - `Role` model exists with `permissions` array
   - Roles are seeded (admin, viewer)
   - BUT: **No middleware checks permissions** — any authenticated user can access ANY endpoint
   - `auth.ts` plugin only verifies JWT existence, not role/permissions
   - **Fix:** Add authorization middleware that checks `request.user.roleId` → `role.permissions` against required permission

7. **CORS is permissive in development:**
   ```
   CORS_ORIGIN=http://localhost:5173,http://localhost:5175,http://localhost:3001
   ```
   - Fine for dev, but must be locked to the production domain
   - `.env.production.example` correctly shows `https://your-domain.com`

### ✅ What's Already Good

- **Password hashing:** bcryptjs with cost factor 12 ✅
- **JWT authentication:** `@fastify/jwt` with 24h expiry ✅
- **Twilio webhook signature verification** (when not skipped) ✅
- **PII/PHI redaction service** — comprehensive regex-based redaction ✅
- **Audit logging** — automatic logging of sensitive route access ✅
- **AI Guardrails** — medical claim blocking, scope enforcement ✅
- **Input validation** — Zod schemas on auth, appointments, etc. ✅
- **Prisma parameterized queries** — no SQL injection ✅

---

## 6. Deployment Readiness — 6/10

### ✅ What's Ready

| Item | Status | Notes |
|------|--------|-------|
| Docker Compose | ✅ | PostgreSQL + Redis + Backend + Frontend + optional n8n |
| Backend Dockerfile | ✅ | Multi-stage build, non-root user, dumb-init, health check |
| Frontend Dockerfile | ✅ | Multi-stage build with Nginx, security headers, SPA fallback |
| Nginx reverse proxy | ✅ | Gzip, security headers, WebSocket upgrade support, API proxy |
| Health check endpoint | ✅ | `/health` returns `{ status: 'ok', timestamp }` |
| Voice health endpoint | ✅ | `/api/voice/health` returns Twilio status + active calls |
| WhatsApp health endpoint | ✅ | `/api/whatsapp/health` |
| `.env.production.example` | ✅ | Lists all required variables with placeholder values |
| Seed data script | ✅ | Idempotent, creates complete demo data |
| TypeScript build | ✅ | `tsc` compiles to `dist/` |

### ⚠️ What's Missing

| Item | Status | Impact |
|------|--------|--------|
| **CI/CD pipeline** | ❌ Missing | No automated testing, building, or deployment |
| **Graceful shutdown (SIGTERM)** | ❌ Missing | `server.ts` has no process signal handlers; active calls will drop on deploy |
| **PM2/process manager config** | ❌ Missing | Docker uses `dumb-init` (good) but no PM2 for non-Docker |
| **SSL/TLS** | ❌ Not configured | Must be handled by reverse proxy (Nginx/Cloudflare) in production |
| **Production migration strategy** | ❌ Unclear | Only 1 migration; mostly using `db push` |
| **Redis integration** | ❌ Partial | Redis is in docker-compose but NOT used in the backend code (no Redis client!) |
| **Monitoring/Alerting** | ❌ Missing | No Prometheus metrics, no Sentry, no alerting |
| **Backup strategy** | ❌ Missing | No automated database backups configured |
| **Log shipping** | ❌ Missing | Logs go to stdout only |
| **Load testing** | ❌ Not done | No performance baselines |

### Required Environment Variables (Complete List)

```env
# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://user:pass@host:5432/hospital_booking?schema=public

# Auth
JWT_SECRET=<strong-random-64-byte-base64>

# CORS
CORS_ORIGIN=https://your-domain.com

# Webhooks
WEBHOOK_API_KEY=<random-key>

# OpenAI
OPENAI_API_KEY=sk-...
LLM_MODEL=gpt-4-turbo-preview
LLM_MAX_TOKENS=1024
LLM_TEMPERATURE=0.7

# Gemini
GEMINI_API_KEY=<key>
USE_GEMINI_VOICE=true
GOOGLE_CLOUD_PROJECT=<project-id>     # Required for Gemini Live via Vertex AI
GOOGLE_CLOUD_LOCATION=us-central1     # Required for Gemini Live via Vertex AI

# Twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=<token>
TWILIO_PHONE_NUMBER=+966XXXXXXXXX

# ElevenLabs
ELEVENLABS_API_KEY=<key>

# Voice
VOICE_DEFAULT_DIALECT=msa
VOICE_MAX_CALL_DURATION_SEC=600
VOICE_SILENCE_TIMEOUT_MS=1500
BASE_URL=https://your-domain.com
VOICE_WS_URL=wss://your-domain.com/api/voice/stream-gemini

# Org
DEFAULT_ORG_ID=<uuid>

# Optional Voice IDs (ElevenLabs)
# VOICE_ID_GULF=<id>
# VOICE_ID_EGYPTIAN=<id>
# VOICE_ID_LEVANTINE=<id>
# VOICE_ID_MSA=<id>

# Optional WhatsApp
# TWILIO_WHATSAPP_NUMBER=whatsapp:+1234567890

# DO NOT set in production:
# SKIP_TWILIO_VERIFY=true  ← NEVER in production
```

### Graceful Shutdown Fix Needed

```typescript
// Add to server.ts:
const start = async () => {
  const app = await buildApp();
  // ... listen ...

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    await app.close(); // Closes Prisma, scheduler, etc.
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};
```

---

## 7. Missing Features for Production — 5/10

### 🔴 Must-Have Before Go-Live

1. **RBAC Enforcement:**
   - Role/permission model exists but is NOT enforced
   - Any logged-in user can access admin endpoints
   - Estimated effort: 2-3 days

2. **Test Suite:**
   - **Zero application tests** — no unit tests, no integration tests, no E2E tests
   - There are test scripts (`test-all-endpoints-v2.mjs`) but they're manual API tests, not automated
   - No test runner configured (no jest, vitest, mocha)
   - Estimated effort: 1-2 weeks for critical path coverage

3. **Production Database Migrations:**
   - Need a clean baseline migration
   - Need a migration workflow for schema changes
   - Estimated effort: 1 day

4. **Secrets Management:**
   - Move from `.env` files to a proper secrets manager
   - Rotate all exposed keys
   - Estimated effort: 1 day

5. **HIPAA/Saudi PDPL Compliance:**
   - Audit logging ✅ exists
   - PII redaction ✅ exists
   - But: no data encryption at rest, no BAA with cloud providers, no formal compliance assessment
   - Estimated effort: Variable (potentially weeks for full compliance)

### ⚠️ Should-Have for Production Quality

6. **Monitoring & Alerting:**
   - Add Prometheus metrics endpoint
   - Configure Sentry for error tracking
   - Set up alerts for: AI failures, high error rates, Twilio failures, DB connection issues
   - Estimated effort: 2-3 days

7. **Redis Integration:**
   - Redis is deployed but unused in the backend
   - Should be used for: rate limiting store, session cache, pub/sub for real-time features
   - Estimated effort: 1-2 days

8. **Max Call Duration Enforcement:**
   - The env var exists but isn't checked
   - Estimated effort: 2 hours

9. **EMR Integration:**
   - `Integration` model exists with `type`/`provider`/`config` fields
   - But no actual EMR connectors are implemented
   - This is a placeholder for future HL7/FHIR integration
   - Estimated effort: Weeks to months (depending on EMR)

10. **Patient Portal Authentication Hardening:**
    - Current patient auth is phone-based OTP simulation
    - Needs real OTP delivery via SMS and verification flow
    - Estimated effort: 2-3 days

### 💡 Nice-to-Have

11. **WebSocket reconnection logic** on frontend chat
12. **Dark mode** on dashboard (Tailwind already supports it)
13. **Export to PDF** for analytics/reports (libraries exist in the project)
14. **Multi-language voice** — Gemini already supports `ar-EG`, could add English

---

## 8. Billing & Cost Analysis

### Per-Call Cost Breakdown

#### Gemini Voice Path (Primary — `USE_GEMINI_VOICE=true`)

| Component | Unit Cost | Per 5-min Call |
|-----------|-----------|----------------|
| Twilio Phone Number | $1.15/month | — |
| Twilio Inbound Call (Voice) | $0.0085/min | $0.0425 |
| Gemini 2.0 Flash (Multimodal Live) | ~$0.0015/sec audio | ~$0.45 |
| **Total per call** | | **~$0.49** |

#### OpenAI + ElevenLabs Path (Fallback)

| Component | Unit Cost | Per 5-min Call |
|-----------|-----------|----------------|
| Twilio Inbound Call | $0.0085/min | $0.0425 |
| OpenAI Whisper STT | $0.006/min | $0.03 |
| GPT-4 Turbo (3 turns × ~500 tokens) | $0.01/1K input + $0.03/1K output | ~$0.06 |
| ElevenLabs TTS (3 responses × ~100 chars) | $0.30/1K chars | ~$0.09 |
| **Total per call** | | **~$0.22** |

#### WhatsApp Message Cost

| Component | Unit Cost | Per Conversation (10 msgs) |
|-----------|-----------|---------------------------|
| Twilio WhatsApp (utility template) | $0.005-0.08/msg (region-dependent) | ~$0.25 |
| GPT-4 Turbo (5 turns) | ~$0.01/1K tokens | ~$0.10 |
| **Total per conversation** | | **~$0.35** |

### Monthly Cost Projections

#### Voice Calls (Gemini Path)

| Monthly Calls | Voice Cost | Twilio Number | Total Monthly |
|---------------|-----------|---------------|---------------|
| 100 | $49 | $1.15 | **~$50** |
| 500 | $245 | $1.15 | **~$246** |
| 1,000 | $490 | $1.15 | **~$491** |
| 5,000 | $2,450 | $1.15 | **~$2,451** |

#### Voice Calls (OpenAI + ElevenLabs Path)

| Monthly Calls | Voice Cost | Twilio Number | Total Monthly |
|---------------|-----------|---------------|---------------|
| 100 | $22 | $1.15 | **~$23** |
| 500 | $110 | $1.15 | **~$111** |
| 1,000 | $220 | $1.15 | **~$221** |
| 5,000 | $1,100 | $1.15 | **~$1,101** |

#### WhatsApp Only

| Monthly Conversations | Cost |
|----------------------|------|
| 100 | ~$35 |
| 500 | ~$175 |
| 1,000 | ~$350 |

#### Infrastructure (Docker/VPS)

| Component | Monthly Cost |
|-----------|-------------|
| VPS (4 vCPU, 8GB RAM) | $20-50 |
| PostgreSQL (managed, optional) | $15-50 |
| Domain + SSL | ~$5 |
| **Total infrastructure** | **~$40-105/month** |

### Cost Optimization Tips

1. **Use Gemini over OpenAI+ElevenLabs** for volume — Gemini is ~2x more expensive per call BUT has significantly better latency and natural voice quality
2. **Use OpenAI+ElevenLabs** if cost is the primary concern — ~55% cheaper per call
3. **WhatsApp should be the primary channel** — much cheaper than voice ($0.35 vs $0.22-0.49 per interaction)
4. **Implement conversation caching** — avoid re-fetching provider/service data on every turn
5. **Use `gpt-4o-mini`** instead of `gpt-4-turbo-preview` for chat — 10x cheaper with comparable quality for this use case
6. **Batch Twilio messaging** — use Twilio Messaging Services for campaigns to get better rates

---

## 9. Action Items — Priority Order

### 🔴 P0 — Before ANY Production Use (Week 1)

- [ ] **Rotate ALL API keys** (OpenAI, Gemini, Twilio, ElevenLabs) — they are exposed in the .env
- [ ] **Set a strong JWT_SECRET** — current one is the default placeholder
- [ ] **Remove `SKIP_TWILIO_VERIFY=true`** from production .env
- [ ] **Install and register `@fastify/helmet`** for security headers
- [ ] **Add global rate limiting** via `@fastify/rate-limit`
- [ ] **Add RBAC middleware** — enforce role permissions on all protected routes
- [ ] **Fix HTTP status codes** — ensure 404/400/403 are returned correctly on all routes
- [ ] **Add graceful shutdown** (SIGTERM/SIGINT) to server.ts
- [ ] **Generate proper baseline migration** — `prisma migrate dev --name baseline`

### 🟡 P1 — Before Production Launch (Week 2-3)

- [ ] **Write critical path tests** — auth, appointments, voice webhook, WhatsApp webhook
- [ ] **Set up CI/CD pipeline** (GitHub Actions / GitLab CI)
- [ ] **Configure monitoring** — Sentry for errors, health check monitoring
- [ ] **Set up database backups** — automated daily backups with retention
- [ ] **Enforce max call duration** in voice WebSocket handlers
- [ ] **Implement Redis** for rate limiting and session storage
- [ ] **Add WebSocket authentication** for voice stream endpoints
- [ ] **Configure production logging** — structured JSON, log shipping
- [ ] **Load test** — verify system handles expected call volume

### 🟢 P2 — Post-Launch Improvements (Month 1-2)

- [ ] **Real OTP for patient portal** authentication
- [ ] **EMR integration** — start with read-only HL7/FHIR bridge
- [ ] **Advanced analytics** — use Redis pub/sub for real-time dashboard
- [ ] **Conversation summarization** — use LLM to summarize calls for review
- [ ] **A/B testing** for voice prompts
- [ ] **Multi-org billing** — track API usage per org for SaaS model

---

## 10. Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                        NGINX (Frontend)                       │
│  React SPA + Security Headers + API Proxy + WS Upgrade       │
└──────────────────────┬───────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────┐
│                    FASTIFY BACKEND                             │
│                                                               │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────────┐  │
│  │  Auth    │ │ Voice    │ │ WhatsApp │ │ Chat/WebSocket  │  │
│  │ (JWT)   │ │ Webhooks │ │ Webhook  │ │ (Authenticated) │  │
│  └────┬────┘ └────┬─────┘ └────┬─────┘ └────────┬────────┘  │
│       │           │            │                 │            │
│  ┌────▼───────────▼────────────▼─────────────────▼────────┐  │
│  │              SERVICE LAYER                              │  │
│  │  ┌──────┐ ┌────────┐ ┌──────────┐ ┌──────────────┐    │  │
│  │  │ LLM  │ │ Voice  │ │ Security │ │  Analytics   │    │  │
│  │  │(GPT4)│ │(Gemini │ │(Guards,  │ │(Predictive,  │    │  │
│  │  │      │ │ +TTS   │ │ PII,     │ │ Quality,     │    │  │
│  │  │      │ │ +STT)  │ │ Audit)   │ │ Drivers)     │    │  │
│  │  └──┬───┘ └───┬────┘ └────┬─────┘ └──────┬───────┘    │  │
│  └─────┼─────────┼───────────┼───────────────┼────────────┘  │
│        │         │           │               │                │
│  ┌─────▼─────────▼───────────▼───────────────▼────────────┐  │
│  │                    PRISMA ORM                           │  │
│  └─────────────────────────┬──────────────────────────────┘  │
└────────────────────────────┼─────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────┐
│                    POSTGRESQL 16                              │
│  40+ tables · Multi-tenant · Indexed · UUID PKs              │
└──────────────────────────────────────────────────────────────┘

External Services:
  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐
  │  Twilio  │ │  OpenAI  │ │ ElevenLabs│ │ Gemini   │
  │(Voice+WA)│ │(GPT+STT) │ │  (TTS)    │ │(Live API)│
  └──────────┘ └──────────┘ └───────────┘ └──────────┘
```

---

## Final Verdict

**Namaa is an impressively feature-complete AI medical receptionist.** The architecture is solid, the voice pipeline is sophisticated (dual-engine, dialect-aware, with guardrails), and the breadth of features (appointments, prescriptions, campaigns, care gaps, agent builder, patient portal, fleet management) is remarkable for what appears to be a relatively early-stage project.

**However, it is NOT ready for production deployment with real patient data.** The security gaps (exposed API keys, no RBAC enforcement, no global rate limiting, default JWT secret) are blocking issues. The absence of automated tests and a CI/CD pipeline also create risk.

**Estimated time to production-ready: 2-3 weeks of focused work** following the P0/P1 action items above.

The good news: the foundation is excellent. The issues are all fixable, and the code quality is high enough that adding these missing pieces won't require major refactoring.

---

*Report generated by automated audit — 2026-02-15*
