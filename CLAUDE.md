# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is This?

Tawafud (توافد) is a full-stack AI-powered medical receptionist platform for Saudi healthcare facilities. It handles appointment booking, voice calls (Arabic + English), WhatsApp/web chat, patient portals, outbound campaigns, and more through conversational AI.

## Commands

### Backend (`cd backend`)

```bash
npm run dev                    # Dev server (tsx watch, PORT env or default 3003)
npm run build                  # Compile TypeScript → dist/
npm run db:generate            # prisma generate (after schema changes)
npm run db:push                # Push schema to DB (no migration file)
npm run db:migrate             # Create + run migration
npm run db:studio              # Open Prisma Studio GUI
npx prisma db seed             # Seed demo data

# Tests (Vitest)
npm test                       # Run all tests
npm run test:watch             # Watch mode
npm run test:routes            # Route tests only
npm run test:services          # Service tests only
npm run test:integration       # Integration tests only
npm run test:coverage          # With coverage report
npx vitest run __tests__/routes/auth.test.ts  # Single test file
npm run test:legacy            # Legacy Node.js test runner (tests/api.test.ts)
```

### Frontend (`cd frontend`)

```bash
npm run dev                    # Vite dev server (port 5174, proxies /api → :3007)
npm run build                  # TypeScript check + Vite production build
npm run build:widget           # Build embeddable chat widget (IIFE → dist-widget/)
npm run lint                   # ESLint
```

### Docker

```bash
docker compose up -d app_postgres redis    # Start Postgres + Redis
docker compose down                        # Stop all
```

## Architecture

```
Frontend (React 18 + Vite 6 + Tailwind 3)
  │  Landing │ Admin Dashboard │ Patient Portal │ Embeddable Widget
  │  /api/* proxied via Vite → :3007
  ▼
Backend (Fastify 4 + TypeScript, ES Modules)
  ├─ Routes (src/routes/)           ← API endpoints, registered in routes/index.ts
  ├─ Services (src/services/)       ← Business logic layer
  ├─ Plugins (src/plugins/)         ← Fastify decorators (prisma, openai, gemini, twilio, jwt, scheduler, subscriptionGuard)
  └─ Prisma ORM → PostgreSQL :5434
       │
  External: OpenAI GPT-4 (chat) · Gemini Live (voice) · Twilio (calls/SMS/WhatsApp) · ElevenLabs (TTS)
```

### Key Layers

- **Entry**: `server.ts` → `app.ts` (builds Fastify instance with all plugins, CORS, Swagger, routes)
- **Route registration**: `routes/index.ts` — central file that registers all ~47 route modules with `/api/` prefix
- **Services**: Business logic lives in `src/services/`, routes are thin wrappers calling services
- **Plugins**: Each external dependency (Prisma, OpenAI, Gemini, Twilio) is a Fastify plugin that decorates `app` (e.g., `app.prisma`, `app.openai`). `subscriptionGuard.ts` validates org subscription status
- **Middleware order** (in `app.ts`): Helmet → Rate Limiting (100 req/min global, 10 req/min auth) → CORS → JWT → custom JSON parser → form/multipart
- **Tests**: `backend/__tests__/` organized into `routes/`, `services/`, `integration/`, `helpers/` — Vitest with 30s timeout, aliases `@` → `./src` and `@tests` → `./__tests__`. Test helpers in `__tests__/helpers/testUtils.ts` provide factories (`createTestUser()`, `createTestPatient()`, `createTestProvider()`), unique generators (`uniqueEmail()`, `uniquePhone()`), and `waitFor()` polling

### Multi-tenancy

Every data query is scoped by `orgId` from the JWT payload (`request.user.orgId`). This is the single most important invariant — never query without org scoping.

### Dual Auth Systems

1. **Admin JWT** (`@fastify/jwt`): email/password login → 24h token, stored in `localStorage`, payload `{ userId, orgId, email }`, protected via `app.authenticate` preHandler
2. **Patient Portal**: phone + date of birth login → separate token (`patient_token`), separate auth context (`PatientAuthContext`)

### Voice Pipeline

Twilio webhook (`/api/voice/incoming`) → TwiML → Twilio WebSocket media stream → `/api/voice/stream-gemini` → audio conversion (mulaw 8kHz ↔ PCM 16kHz) → Gemini Multimodal Live. In-memory `CallSessionManager` with 30-minute TTL. Requires ngrok tunnel for local dev.

### AI System

- `services/llm.ts` — OpenAI chat completions wrapper
- `services/systemPrompt.ts` — Dynamic org-aware system prompt builder
- `services/ai/guardrails.ts` — Allowed actions (scheduling, FAQ) vs blocked actions (diagnosis, treatment). AI responses validated for scope
- `services/security/piiRedactor.ts` — Strips Saudi national IDs, phone numbers, emails from responses
- `services/patient/contextBuilder.ts` — Builds patient history/memory context for AI conversations
- `services/patient/identityVerifier.ts` — Patient identity verification levels

### Agent Builder

Visual no-code flow editor using `@xyflow/react`. Flows stored as JSON nodes + edges in `AgentFlow` model. INSTRUCTION nodes customize LLM behavior within flows (they guide the AI, not replace it). Templates seeded via `seedFlowTemplates()`.

### Frontend Architecture

- **Routing**: React Router v7 in `App.tsx` — public routes (`/`, `/login`, `/book/:slug`), staff routes (`/dashboard/*` with `ProtectedRoute`), patient routes (`/patient/*` with `ProtectedPatientRoute`)
- **Layouts**: `DashboardLayout` (staff sidebar + outlet), `PortalLayout` (patient mobile-optimized, bottom nav)
- **API client**: `lib/api.ts` — Axios instance with Bearer token interceptor, 401 auto-logout redirect. Patient API uses `sessionStorage` instead of `localStorage`
- **State**: React Context for auth (`AuthContext`, `PatientAuthContext`, `BranchContext`) + TanStack Query v5 for server state (staleTime varies 30s–5min)
- **i18n**: i18next with Arabic fallback, browser detection → localStorage. `useTranslation()` hook, RTL via `i18n.language === 'ar'`
- **Widget**: Embeddable chat built as IIFE via `vite.widget.config.ts` → `dist-widget/widget.js`, self-contained with no external deps

### Production Startup Guards

Backend hard-fails on startup in production if: `JWT_SECRET` is default/missing, `WEBHOOK_API_KEY` not set, `SKIP_TWILIO_VERIFY=true`, `OPENAI_API_KEY` missing, or `CORS_ORIGIN` not configured. See `app.ts`.

### CI/CD

- **CI** (`.github/workflows/ci.yml`): Runs on push/PR — 3 parallel jobs: backend (Prisma generate + type check + Vitest), frontend (lint + type check + build), security audit (`npm audit`)
- **Deploy** (`.github/workflows/deploy.yml`): Push to `main` → Docker build → SSH to VPS → DB migrations → zero-downtime compose up → health check

## Conventions

- **ES Modules everywhere** — `.js` extensions in imports, `"type": "module"` in both packages
- **Path aliases**: `@/*` → `src/*` in both backend and frontend
- **Validation**: Zod schemas for request bodies (backend); React Hook Form + Zod (frontend)
- **DB naming**: snake_case tables/columns via `@@map`/`@map` in Prisma schema; 40+ models in `prisma/schema.prisma`
- **API responses**: Direct JSON return (no wrapping); errors as `{ error, message }`
- **Bilingual Arabic-first**: Backend uses `lib/messages.ts` with `{ ar, en }` objects selected via `Accept-Language`. Frontend uses i18next with Arabic as `fallbackLng`, RTL via `tailwindcss-rtl`. Many DB models have `name` + `name_ar` fields
- **Frontend styling**: Tailwind with healthcare color tokens (`healthcare.*`), fonts: Figtree (headings) + Noto Sans Arabic (body)
- **Scheduled tasks**: `node-cron` via `plugins/scheduler.ts` — reminders, campaigns, care gaps, medication reminders, quality analysis, waitlist auto-fill, hold expiration

## Database

PostgreSQL 16 on port **5434** (Docker container `tawafud_postgres`). Connection details in `backend/.env`. Schema has 40+ models covering the full healthcare domain — see `backend/prisma/schema.prisma`.

Key enum to know: `appointment_status` lifecycle is `held → booked → confirmed → checked_in → in_progress → completed/cancelled/no_show/expired`.

## Development Setup

```bash
docker compose up -d app_postgres redis     # 1. Start DB
cd backend && npm install                   # 2. Install deps
npx prisma generate && npx prisma db push   # 3. Setup schema
npx prisma db seed                          # 4. Seed demo org
npm run dev                                 # 5. Start backend (PORT env or :3003)

# Separate terminal:
cd frontend && npm install && npm run dev   # 6. Start frontend → :5174
```

Swagger docs: `http://localhost:{PORT}/docs` (non-prod only) · Health: `http://localhost:{PORT}/health`

**Note**: Vite proxy in `vite.config.ts` currently targets port 3007. Ensure backend `PORT` env matches or update the proxy target.

## Known Issues

- Redis is in docker-compose but not yet wired into backend code
- Voice streaming requires ngrok or tunnel for Twilio to reach local dev
- `SKIP_TWILIO_VERIFY=true` in dev disables webhook signature verification
- Some frontend pages may be stubs awaiting full implementation
