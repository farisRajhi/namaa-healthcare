# CLAUDE.md — Namaa (نماء) AI Medical Receptionist

> **Status:** ~95% complete · Active development
> **Last updated:** 2026-02-17

---

## What Is This?

Namaa is a full-stack **AI-powered medical receptionist** platform for Saudi healthcare facilities. It handles appointment booking, voice calls (Arabic + English), WhatsApp/web chat, prescription management, patient portals, outbound campaigns, and more — all through conversational AI. The name "نماء" means "growth" in Arabic.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Fastify 4 · TypeScript · Node.js (ES Modules) |
| **Database** | PostgreSQL 16 (port **5434**) via Prisma ORM |
| **AI / LLM** | OpenAI GPT-4 Turbo · Google Gemini (Multimodal Live for voice) |
| **Voice** | Twilio (calls + media streams) · ElevenLabs TTS · Gemini native voice |
| **Messaging** | Twilio WhatsApp · Web chat · Embeddable widget |
| **Frontend** | React 18 · Vite 6 · Tailwind CSS 3 · React Router 7 |
| **State / Data** | TanStack React Query · Axios · React Hook Form · Zod |
| **i18n** | i18next (Arabic-first, RTL-native, `tailwindcss-rtl`) |
| **Charts** | Recharts · @xyflow/react (Agent Builder flow canvas) |
| **Infra** | Docker Compose (Postgres + Redis + backend + frontend + optional n8n) |
| **Scheduler** | `node-cron` (reminders, campaigns, care gaps, quality analysis) |
| **Auth** | `@fastify/jwt` (24h tokens, bcrypt password hashing) |

---

## Directory Structure

```
ai-agent/
├── CLAUDE.md                  ← You are here
├── docker-compose.yml         ← Postgres (5434), Redis, backend, frontend, n8n
├── hospital_booking.sql       ← Init SQL for Docker DB bootstrap
│
├── backend/
│   ├── package.json           ← "namaa-backend" · scripts: dev, build, start, db:*
│   ├── tsconfig.json          ← ES2022, NodeNext, strict, path alias @/*
│   ├── prisma/
│   │   ├── schema.prisma      ← 40+ models, enums, full healthcare domain
│   │   └── seed.ts            ← Seeds demo org "مستشفى نماء التخصصي" + templates
│   ├── src/
│   │   ├── server.ts          ← Entry point (port from env, default 3003)
│   │   ├── app.ts             ← Fastify app builder — plugins, CORS, JWT, Swagger, routes
│   │   ├── plugins/
│   │   │   ├── auth.ts        ← JWT verify decorator (app.authenticate)
│   │   │   ├── prisma.ts      ← PrismaClient lifecycle (app.prisma)
│   │   │   ├── openai.ts      ← OpenAI client (app.openai)
│   │   │   ├── gemini.ts      ← Google Generative AI (app.gemini)
│   │   │   ├── twilio.ts      ← Twilio client (app.twilio) + signature verification
│   │   │   └── scheduler.ts   ← TaskScheduler (cron jobs, depends on prisma)
│   │   ├── routes/            ← All API route files (see API Routes below)
│   │   │   ├── index.ts       ← Central route registration
│   │   │   ├── auth.ts        ← /api/auth (login, register, me)
│   │   │   ├── patients.ts    ← /api/patients
│   │   │   ├── appointments.ts← /api/appointments
│   │   │   ├── providers.ts   ← /api/providers
│   │   │   ├── services.ts    ← /api/services
│   │   │   ├── departments.ts ← /api/departments
│   │   │   ├── facilities.ts  ← /api/facilities
│   │   │   ├── chat.ts        ← /api/chat (AI conversation)
│   │   │   ├── chatWebSocket.ts ← /api/chat WebSocket
│   │   │   ├── voice.ts       ← /api/voice (Twilio webhook handlers)
│   │   │   ├── voiceStream.ts ← /api/voice (OpenAI voice streaming)
│   │   │   ├── voiceStreamGemini.ts ← /api/voice/stream-gemini (Gemini Live)
│   │   │   ├── voiceDemo.ts   ← /api/voice (demo endpoints)
│   │   │   ├── voiceDemoRealtime.ts ← /api/voice (realtime demo)
│   │   │   ├── voiceTest.ts   ← /api/voice (test endpoints)
│   │   │   ├── whatsappChat.ts← /api/whatsapp (Twilio WhatsApp webhook)
│   │   │   ├── widget.ts      ← /api/widget (embeddable chat widget)
│   │   │   ├── demoChat.ts    ← /api/demo-chat (landing page demo)
│   │   │   ├── analytics.ts   ← /api/analytics (overview, trends)
│   │   │   ├── analyticsEnhanced.ts ← /api/analytics-v2 (conversational intel, QA)
│   │   │   ├── fleet.ts       ← /api/fleet (multi-tenant facility mgmt)
│   │   │   ├── campaigns.ts   ← /api/campaigns (outbound campaigns)
│   │   │   ├── outbound.ts    ← /api/outbound (outbound calling)
│   │   │   ├── reminders.ts   ← /api/reminders (appointment reminders)
│   │   │   ├── careGaps.ts    ← /api/care-gaps + /api/care-gap-rules
│   │   │   ├── prescriptions.ts ← /api/prescriptions
│   │   │   ├── faq.ts         ← /api/faq + /api/triage-rules
│   │   │   ├── smsTemplates.ts← /api/sms-templates + /api/sms-logs
│   │   │   ├── callCenter.ts  ← /api/call-center
│   │   │   ├── waitlist.ts    ← /api/waitlist
│   │   │   ├── agentBuilder.ts← /api/agent-builder (no-code flow builder)
│   │   │   ├── integrations.ts← /api/integrations + /api/webhook-subscriptions
│   │   │   ├── settings.ts    ← /api/settings
│   │   │   ├── reports.ts     ← /api/reports
│   │   │   ├── audit.ts       ← /api/audit
│   │   │   ├── phoneNumbers.ts← /api/phone-numbers
│   │   │   ├── patientAuth.ts ← /api/patient-portal (patient login)
│   │   │   ├── patientPortal.ts ← /api/patient-portal (patient endpoints)
│   │   │   ├── patientMemory.ts ← /api/patients (memory sub-routes)
│   │   │   ├── scheduler.ts   ← /api/scheduler (job management)
│   │   │   ├── webhooks.ts    ← /api/webhooks (API-key secured)
│   │   │   └── geminiTest.ts  ← /api/gemini-test
│   │   ├── services/          ← Business logic layer
│   │   │   ├── llm.ts         ← LLMService (OpenAI chat completions wrapper)
│   │   │   ├── systemPrompt.ts← Dynamic system prompt builder (org-aware)
│   │   │   ├── voicePrompt.ts ← Voice-specific system prompt + greeting
│   │   │   ├── ai/
│   │   │   │   └── guardrails.ts ← Responsible AI: allowed/blocked actions, scope enforcement
│   │   │   ├── voice/
│   │   │   │   ├── callSession.ts ← In-memory call session manager
│   │   │   │   └── geminiLive.ts  ← Gemini Multimodal Live session (mulaw ↔ PCM)
│   │   │   ├── patient/
│   │   │   │   ├── contextBuilder.ts ← Patient history/memory context for AI
│   │   │   │   └── identityVerifier.ts ← Patient identity verification levels
│   │   │   ├── security/
│   │   │   │   ├── auditLogger.ts ← Auto-audit middleware for sensitive routes
│   │   │   │   └── piiRedactor.ts ← PII/PHI redaction (Saudi ID, phones, emails, etc.)
│   │   │   ├── scheduler/
│   │   │   │   └── index.ts   ← TaskScheduler with 7+ cron jobs
│   │   │   ├── reminders/     ← Appointment reminder service
│   │   │   ├── campaigns/     ← Campaign execution manager
│   │   │   ├── analytics/     ← Predictive engine, quality analyzer
│   │   │   ├── prescription/  ← Rx manager
│   │   │   ├── pipelines/     ← Care gap → campaign, waitlist auto-fill
│   │   │   ├── outbound/      ← Outbound voice handler
│   │   │   └── agentBuilder/  ← Flow runtime + seed templates
│   │   ├── types/
│   │   │   └── voice.ts       ← Twilio webhook types, call types, dialect enum
│   │   └── lib/
│   │       └── messages.ts    ← Bilingual message constants (ar/en)
│   └── public/                ← Static files (audio, etc.)
│
├── frontend/
│   ├── package.json           ← "namaa-frontend" · scripts: dev, build, build:widget
│   ├── tsconfig.json          ← ES2020, React JSX, strict, path alias @/*
│   ├── vite.config.ts         ← Port 5174, proxy /api → backend:3003
│   ├── vite.widget.config.ts  ← IIFE build for embeddable widget → dist-widget/
│   ├── tailwind.config.js     ← Healthcare color palette, Arabic fonts, RTL plugin
│   ├── src/
│   │   ├── main.tsx           ← App entry (React Query, BrowserRouter, AuthProvider, i18n)
│   │   ├── App.tsx            ← Route definitions (admin dashboard + patient portal)
│   │   ├── context/
│   │   │   ├── AuthContext.tsx ← Admin JWT auth (localStorage token)
│   │   │   └── PatientAuthContext.tsx ← Patient portal auth (phone + DOB login)
│   │   ├── lib/
│   │   │   └── api.ts         ← Axios instance with 401 interceptor
│   │   ├── i18n/
│   │   │   ├── index.ts       ← i18next config (Arabic default, auto-RTL)
│   │   │   └── locales/
│   │   │       ├── ar/translation.json
│   │   │       └── en/translation.json
│   │   ├── components/
│   │   │   ├── layout/        ← DashboardLayout (sidebar, header)
│   │   │   ├── portal/        ← PortalLayout (patient portal shell)
│   │   │   └── ui/            ← Shared UI components (LoadingSpinner, etc.)
│   │   ├── pages/
│   │   │   ├── Landing.tsx    ← Public landing page
│   │   │   ├── Login.tsx      ← Admin login
│   │   │   ├── Register.tsx   ← Admin registration (creates org)
│   │   │   ├── Dashboard.tsx  ← Main dashboard (overview stats)
│   │   │   ├── Patients.tsx
│   │   │   ├── Appointments.tsx
│   │   │   ├── Providers.tsx
│   │   │   ├── Services.tsx
│   │   │   ├── Departments.tsx
│   │   │   ├── Facilities.tsx
│   │   │   ├── Management.tsx
│   │   │   ├── Settings.tsx
│   │   │   ├── CallCenter.tsx
│   │   │   ├── Prescriptions.tsx
│   │   │   ├── FAQ.tsx
│   │   │   ├── Campaigns.tsx
│   │   │   ├── Reminders.tsx
│   │   │   ├── AnalyticsDashboard.tsx
│   │   │   ├── FleetDashboard.tsx
│   │   │   ├── QualityReview.tsx
│   │   │   ├── Integrations.tsx
│   │   │   ├── AuditLog.tsx
│   │   │   ├── SmsTemplates.tsx
│   │   │   ├── Waitlist.tsx
│   │   │   ├── AgentBuilderList.tsx
│   │   │   ├── AgentBuilder.tsx ← Visual flow editor (@xyflow/react)
│   │   │   ├── Reports.tsx
│   │   │   └── portal/       ← Patient-facing pages
│   │   │       ├── PatientLogin.tsx
│   │   │       ├── PatientDashboard.tsx
│   │   │       ├── PatientAppointments.tsx
│   │   │       ├── PatientBooking.tsx
│   │   │       ├── PatientPrescriptions.tsx
│   │   │       └── PatientProfile.tsx
│   │   └── widget/
│   │       └── index.tsx      ← Embeddable chat widget entry
│   └── dist-widget/           ← Built widget output (IIFE)
```

---

## Commands

### Backend

```powershell
cd backend

npm run dev              # Start dev server (tsx watch, hot reload)
npm run build            # Compile TypeScript → dist/
npm run start            # Run compiled output (production)
npm run db:generate      # prisma generate (after schema changes)
npm run db:push          # Push schema to DB (no migration file)
npm run db:migrate       # Create + run migration
npm run db:studio        # Open Prisma Studio GUI
npm run db:pull          # Pull schema from existing DB
npm test                 # Run API tests
npm run test:verbose     # Run tests with spec reporter
npx prisma db seed       # Seed demo data (مستشفى نماء التخصصي)
```

### Frontend

```powershell
cd frontend

npm run dev              # Vite dev server (port 5174, proxies /api → :3003)
npm run build            # TypeScript check + Vite production build
npm run build:widget     # Build embeddable widget (IIFE → dist-widget/)
npm run lint             # ESLint
npm run preview          # Preview production build
```

### Docker

```powershell
docker compose up -d                    # Start Postgres + Redis
docker compose --profile n8n up -d      # Include n8n workflow automation
docker compose down                     # Stop all
```

---

## Database

| Setting | Value |
|---------|-------|
| **Engine** | PostgreSQL 16 (Alpine, via Docker) |
| **Host** | `localhost` |
| **Port** | `5434` (mapped from container's 5432) |
| **Database** | `hospital_booking` |
| **User** | `app` |
| **Password** | `faris2002` |
| **Container** | `namaa_postgres` |
| **Connection URL** | `postgresql://app:faris2002@localhost:5434/hospital_booking` |

### Key Models (40+)

**Core:** `Org`, `Facility`, `Department`, `Provider`, `Service`, `ProviderService`, `ProviderAvailabilityRule`, `ProviderTimeOff`

**Patients:** `Patient`, `PatientContact`, `PatientMemory` (preference/condition/allergy/medication/family_history/lifestyle/note)

**Appointments:** `Appointment` (held → booked → confirmed → checked_in → in_progress → completed/cancelled/no_show/expired), `AppointmentStatusHistory`, `AppointmentReminder`

**Conversations:** `Conversation`, `ConversationMessage`, `ConversationSummary`, `MessagingUser`, `MessagingUserPatientLink`

**Voice:** `VoiceCall`, `VoiceUtterance`, `OrgPhoneNumber`

**Prescriptions:** `Prescription`, `PrescriptionRefill`, `MedicationReminder`

**Campaigns:** `Campaign`, `CampaignTarget`

**Care Gaps:** `CareGapRule`, `PatientCareGap`

**Clinical:** `FaqEntry`, `TriageRule`, `EscalationRule`, `Handoff`

**Config:** `FacilityConfig`, `Integration`, `WebhookSubscription`

**Comms:** `SmsLog`, `SmsTemplate`

**Security:** `User`, `Role` (permissions array), `AuditLog`, `PatientVerification`

**Agent Builder:** `AgentFlow` (nodes/edges JSON), `AgentFlowSession`

**Other:** `Waitlist`, `CallQualityScore`, `OutboxEvent`

### Enums

- `channel`: telegram, whatsapp, web, phone, front_desk, api
- `appointment_status`: held → booked → confirmed → checked_in → in_progress → completed/cancelled/no_show/expired
- `conversation_status`: active, closed, handoff
- `message_direction`: in, out
- `call_direction`: inbound, outbound
- `call_status`: ringing, in_progress, completed, failed, no_answer, busy
- `speaker_type`: caller, ai
- `phone_number_type`: twilio_owned, forwarded
- `MemoryType`: preference, condition, allergy, medication, family_history, lifestyle, note

---

## Authentication

### Admin Auth (JWT)

- **Register:** `POST /api/auth/register` → creates Org + User, returns JWT
- **Login:** `POST /api/auth/login` → returns JWT (24h expiry)
- **Profile:** `GET /api/auth/me` → requires Bearer token
- JWT payload: `{ userId, orgId, email }`
- Password hashing: bcrypt (12 rounds)
- Rate-limited: 10 attempts/minute per IP
- Frontend stores token in `localStorage`, sets `Authorization: Bearer <token>` header

### Patient Portal Auth

- **Login:** `POST /api/patient-portal/login` → phone + date of birth
- Separate token key (`patient_token` in localStorage)
- Separate auth context (`PatientAuthContext`)

### Route Protection

- `app.authenticate` preHandler decorator checks JWT on protected routes
- Twilio webhooks verify `X-Twilio-Signature` (skippable in dev via `SKIP_TWILIO_VERIFY=true`)
- Webhook routes secured by `WEBHOOK_API_KEY`

---

## API Routes

All routes prefixed with `/api/`. Swagger docs at `/docs`.

### Public

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register (creates org) |
| POST | `/api/auth/login` | Login |
| POST | `/api/voice/incoming` | Twilio voice webhook |
| GET | `/api/voice/stream-gemini` | Gemini voice WebSocket |
| POST | `/api/whatsapp/incoming` | WhatsApp webhook |
| * | `/api/demo-chat/*` | Landing page chat demo |
| * | `/api/widget/*` | Embeddable widget |
| POST | `/api/patient-portal/login` | Patient login |
| * | `/api/webhooks/*` | API-key secured webhooks |
| GET | `/health` | Health check |

### Protected (JWT required)

| Prefix | Domain |
|--------|--------|
| `/api/auth/me` | Current user profile |
| `/api/patients` | Patient CRUD + memory |
| `/api/appointments` | Appointment lifecycle |
| `/api/providers` | Provider management |
| `/api/services` | Service catalog |
| `/api/departments` | Department management |
| `/api/facilities` | Facility management |
| `/api/chat` | AI test chat (readiness check, message, conversations) |
| `/api/chat/ws` | Chat WebSocket |
| `/api/analytics` | Dashboard analytics (overview, trends) |
| `/api/analytics-v2` | Enhanced analytics (conversational intel, QA, call drivers) |
| `/api/fleet` | Multi-tenant fleet management |
| `/api/call-center` | Call center dashboard |
| `/api/prescriptions` | Prescription management + refills |
| `/api/faq` | FAQ entries CRUD |
| `/api/triage-rules` | Symptom triage rules |
| `/api/sms-templates` | SMS template management |
| `/api/sms-logs` | SMS send logs |
| `/api/campaigns` | Outbound campaign management |
| `/api/outbound` | Outbound call initiation |
| `/api/reminders` | Appointment reminder config |
| `/api/care-gaps` | Patient care gaps |
| `/api/care-gap-rules` | Care gap rule definitions |
| `/api/waitlist` | Waitlist management |
| `/api/agent-builder` | No-code flow builder (CRUD + run) |
| `/api/integrations` | Third-party integration configs |
| `/api/webhook-subscriptions` | Webhook subscription management |
| `/api/phone-numbers` | Org phone number management |
| `/api/settings` | Org/profile/notification settings |
| `/api/reports` | Report generation + export |
| `/api/scheduler` | View/manage cron jobs |
| `/api/audit` | Audit log viewer |
| `/api/patient-portal/*` | Patient portal endpoints |

---

## Key Patterns

### Multi-tenancy

Every query is scoped by `orgId`. JWT payload contains `orgId`; routes extract it from `request.user.orgId`.

### Bilingual (Arabic-first)

- Backend: `lib/messages.ts` has bilingual message objects `{ ar, en }`, selected via `Accept-Language` header
- Frontend: i18next with Arabic as `fallbackLng`, auto-RTL via `tailwindcss-rtl`
- Database: Many models have both `name` and `name_ar` fields

### AI Guardrails

- `services/ai/guardrails.ts` defines explicit **allowed** actions (scheduling, FAQ, etc.) and **blocked** actions (diagnosis, treatment advice, etc.)
- AI responses are validated for scope compliance
- PII/PHI redaction (`services/security/piiRedactor.ts`) strips Saudi national IDs, phone numbers, emails, etc.

### Voice Architecture

1. **Inbound call** → Twilio webhook (`/api/voice/incoming`) → TwiML response
2. **Media stream** → Twilio WebSocket → `/api/voice/stream-gemini`
3. **Audio conversion**: Twilio mulaw 8kHz ↔ PCM 16kHz ↔ Gemini Multimodal Live
4. **Session management**: In-memory `CallSessionManager` with 30-minute TTL
5. **Dialect detection**: Supports MSA + regional Arabic dialects

### Patient Memory

Automatic extraction of patient preferences, conditions, allergies, medications from conversations. Stored in `PatientMemory` with confidence scores and source conversation tracking.

### Scheduled Tasks (Cron)

| Job | Schedule | Description |
|-----|----------|-------------|
| Appointment reminders | Every 5 min | Send upcoming appointment reminders |
| Campaign execution | Every 10 min | Process outbound campaign targets |
| Care gap scanning | Daily 2:00 AM | Detect patient care gaps |
| Medication reminders | Every 30 min | Send medication reminders |
| Quality analysis | Every hour | Analyze call quality scores |
| Waitlist auto-fill | Every hour | Match waitlist to cancellations |
| Hold expiration | Every minute | Expire stale appointment holds |

### Agent Builder (No-Code)

Visual flow editor using `@xyflow/react`. Flows stored as JSON `nodes` + `edges` in `AgentFlow` model. Templates seeded via `seedFlowTemplates()`. Runtime sessions tracked in `AgentFlowSession`.

### Embeddable Widget

Separate Vite build (`vite.widget.config.ts`) outputs IIFE bundle. Served at `/widget.js` and `/api/widget/widget.js`.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3003` |
| `HOST` | Bind address | `0.0.0.0` |
| `NODE_ENV` | Environment | `development` |
| `DATABASE_URL` | PostgreSQL connection string | (see Database section) |
| `JWT_SECRET` | JWT signing secret | ⚠️ Change in production! |
| `CORS_ORIGIN` | Allowed origins (comma-separated) | `http://localhost:5173,...` |
| `OPENAI_API_KEY` | OpenAI API key | Required for chat |
| `LLM_MODEL` | OpenAI model name | `gpt-4-turbo-preview` |
| `LLM_MAX_TOKENS` | Max response tokens | `1024` |
| `LLM_TEMPERATURE` | LLM temperature | `0.7` |
| `GEMINI_API_KEY` | Google Gemini API key | Required for voice |
| `USE_GEMINI_VOICE` | Enable Gemini voice | `true` |
| `TWILIO_ACCOUNT_SID` | Twilio account SID | Required for calls |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | Required for calls |
| `TWILIO_PHONE_NUMBER` | Twilio phone number | Required for calls |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS key | Optional |
| `VOICE_DEFAULT_DIALECT` | Default Arabic dialect | `msa` |
| `VOICE_MAX_CALL_DURATION_SEC` | Max call length | `600` |
| `VOICE_SILENCE_TIMEOUT_MS` | Silence before AI responds | `1500` |
| `BASE_URL` | Public base URL (for webhooks) | ngrok URL |
| `VOICE_WS_URL` | WebSocket URL for voice streams | ngrok WSS URL |
| `DEFAULT_ORG_ID` | Fallback org ID | UUID |
| `WEBHOOK_API_KEY` | API key for webhook auth | — |
| `SKIP_TWILIO_VERIFY` | Skip Twilio signature check | `true` (dev only) |
| `LOG_LEVEL` | Fastify log level | `info` |

### Frontend

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API base URL | `""` (uses Vite proxy) |

---

## Frontend Routes

### Admin Dashboard (`/dashboard/*`)

Protected by `AuthContext`. Layout: `DashboardLayout` (sidebar + header).

| Path | Page |
|------|------|
| `/dashboard` | Overview dashboard |
| `/dashboard/patients` | Patient management |
| `/dashboard/appointments` | Appointment management |
| `/dashboard/providers` | Provider management |
| `/dashboard/services` | Service catalog |
| `/dashboard/departments` | Departments |
| `/dashboard/facilities` | Facilities |
| `/dashboard/management` | General management |
| `/dashboard/settings` | Organization settings |
| `/dashboard/call-center` | Call center view |
| `/dashboard/prescriptions` | Prescriptions |
| `/dashboard/faq` | FAQ management |
| `/dashboard/campaigns` | Outbound campaigns |
| `/dashboard/reminders` | Reminder config |
| `/dashboard/analytics` | Analytics dashboard |
| `/dashboard/fleet` | Fleet (multi-facility) |
| `/dashboard/quality` | Quality review |
| `/dashboard/integrations` | Integrations |
| `/dashboard/audit` | Audit log |
| `/dashboard/sms-templates` | SMS templates |
| `/dashboard/waitlist` | Waitlist |
| `/dashboard/agent-builder` | Agent flow list |
| `/dashboard/agent-builder/:id` | Visual flow editor |
| `/dashboard/reports` | Reports + export |

### Patient Portal (`/patient/*`)

Protected by `PatientAuthContext`. Layout: `PortalLayout`.

| Path | Page |
|------|------|
| `/patient` | Patient login (phone + DOB) |
| `/patient/dashboard` | Patient overview |
| `/patient/dashboard/appointments` | My appointments |
| `/patient/dashboard/book` | Book appointment |
| `/patient/dashboard/prescriptions` | My prescriptions |
| `/patient/dashboard/profile` | My profile |

### Public

| Path | Page |
|------|------|
| `/` | Landing page |
| `/login` | Admin login |
| `/register` | Admin registration |

---

## Development Setup

```powershell
# 1. Start database
docker compose up -d app_postgres redis

# 2. Backend
cd backend
npm install
cp .env.example .env          # (or use existing .env)
npx prisma generate
npx prisma db push            # or: npx prisma migrate dev
npx prisma db seed            # seed demo data
npm run dev                   # → http://localhost:3003

# 3. Frontend (separate terminal)
cd frontend
npm install
npm run dev                   # → http://localhost:5174

# 4. Expose for Twilio (separate terminal)
ngrok http 3003               # Update BASE_URL + VOICE_WS_URL in .env
```

### Useful URLs

| URL | Description |
|-----|-------------|
| `http://localhost:3003` | Backend API |
| `http://localhost:3003/docs` | Swagger API docs |
| `http://localhost:3003/health` | Health check |
| `http://localhost:5174` | Frontend dev server |
| `http://localhost:5678` | n8n (if enabled) |

---

## Conventions

- **Module system:** ES Modules everywhere (`.js` extensions in imports, `"type": "module"`)
- **Path aliases:** `@/*` → `src/*` (both backend and frontend)
- **Validation:** Zod schemas for request bodies (backend); React Hook Form + Zod (frontend)
- **Error handling:** Global Fastify error handler catches Zod/JWT/validation errors
- **DB naming:** snake_case tables/columns via `@@map` / `@map` in Prisma schema
- **API responses:** Direct JSON return (no wrapping); errors as `{ error, message }`
- **Org scoping:** All data queries filtered by `orgId` from JWT
- **Fonts:** Figtree (headings), Noto Sans + Noto Sans Arabic (body)
- **Colors:** Healthcare-themed palette (teal/cyan primary, custom `healthcare.*` tokens)
- **Tests:** `npx tsx --test tests/api.test.ts` (Node.js built-in test runner)

---

## Known Issues / Notes

- `JWT_SECRET` in `.env` still uses placeholder value — **must change for production**
- API keys are committed in `.env` — rotate before any public deployment
- `SKIP_TWILIO_VERIFY=true` disables webhook signature verification (dev only)
- Redis is in docker-compose but not yet wired into the backend application code
- n8n integration is optional (behind Docker `--profile n8n`)
- Voice streaming requires ngrok or similar tunnel for Twilio to reach local dev
- Some frontend pages may be stubs awaiting full implementation
- The `hospital_booking.sql` init script in project root is used for Docker DB bootstrap

---

## Architecture Diagram (Simplified)

```
┌──────────────────────────────────────────────────────────────────┐
│                        Frontend (React + Vite)                    │
│  Landing │ Admin Dashboard │ Patient Portal │ Embeddable Widget   │
└─────────────────────────────┬────────────────────────────────────┘
                              │ /api/* (Vite proxy → :3003)
┌─────────────────────────────▼────────────────────────────────────┐
│                     Backend (Fastify + TypeScript)                 │
│                                                                   │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────────┐ │
│  │  Auth    │  │  Chat    │  │  Voice   │  │  CRUD Routes      │ │
│  │  (JWT)   │  │  (AI)    │  │  (Twilio)│  │  (patients, appts │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  │   providers, etc.)│ │
│       │             │             │         └───────────────────┘ │
│  ┌────▼─────────────▼─────────────▼──────────────────────────┐   │
│  │                    Services Layer                          │   │
│  │  LLM · Guardrails · PII Redactor · Patient Memory         │   │
│  │  Voice Sessions · Campaigns · Reminders · Scheduler        │   │
│  └────────────────────────┬──────────────────────────────────┘   │
│                           │                                       │
│  ┌────────────────────────▼──────────────────────────────────┐   │
│  │              Prisma ORM → PostgreSQL (:5434)               │   │
│  └────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
          │                    │                    │
    ┌─────▼──────┐    ┌───────▼──────┐    ┌───────▼──────┐
    │   OpenAI   │    │   Gemini     │    │   Twilio     │
    │   GPT-4    │    │   Live Voice │    │   Calls/SMS  │
    └────────────┘    └──────────────┘    └──────────────┘
                                                  │
                                          ┌───────▼──────┐
                                          │  ElevenLabs  │
                                          │     TTS      │
                                          └──────────────┘
```
