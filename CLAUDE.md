# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is This?

Tawafud (توافد) is a full-stack AI-powered receptionist platform for small Saudi clinics. It handles WhatsApp + web chat conversations, appointment booking, a patient self-service portal, and AI-driven marketing campaigns (patient re-engagement based on service-cycle due-dates). There is no voice/phone-call pipeline — outreach is WhatsApp-only.

## Answering Style

When the user asks a **question** (especially starting with "why", "what", "how come", "should I", "thoughts on", "do you think"), **answer directly first in plain text**. Do not:
- Invoke tools to "investigate" before answering
- Enter plan mode for conversational questions
- Run probe/diagnostic commands unprompted
- Build a feature when they asked about an existing one

Only escalate to tool use when the user explicitly asks for changes, a fix, or an investigation ("look into", "fix", "implement", "check the code for"). If you genuinely need to read a file to answer accurately, read at most one file — don't go on a tour.

**Past failures this rule prevents:**
- User asked why a Google tile showed `30.6` → Claude explained Instagram followers (wrong feature) AND ran a probe command. The right answer was a one-line text response about the rating field
- User asked to attach Instagram handles to existing competitors → Claude built a "create new competitor" feature. The right move was to ask "which existing competitor record?" or read the schema and answer in text first
- User asked for thoughts on a strategy → Claude wrote files and entered plan mode. The right move is a 2-3 sentence text recommendation

If you're not 100% sure whether the user wants discussion or action, **ask one short clarifying question in text** rather than guessing with tools.

## Platform

Development is on **Windows 11** with bash (Git Bash) as the shell. **Default to Node scripts over shell pipelines** — almost every Windows friction we've hit is shell-quoting or PATH related, and Node is portable.

### Hard rules (these have bitten us before)

- **Never** use single-quoted curl format strings. `curl -w '%{http_code}'` becomes literal `%{http_code}` on Windows. Use Node:
  ```bash
  node -e "fetch('http://localhost:3007/health').then(r=>console.log(r.status))"
  ```
- **Never** chain `grep` with pipes for non-trivial parsing — Git Bash hits ENOENT on the resolved path. Use the **Grep tool** for searches, or `node -e "..."` for parsing
- **Paths**: forward slashes in bash (`/c/Users/...`), backslashes only inside double-quoted Windows-API calls. Never mix
- **Null device**: `/dev/null` in bash, `NUL` in PowerShell — don't cross-pollinate
- **Heredocs**: prefer `node -e` or write a `.mjs` file. Bash heredocs survive Git Bash but fail under PowerShell
- **Process kill**: `taskkill //F //PID <n>` (double slash for Git Bash) or `Stop-Process -Id <n> -Force` in PowerShell
- **Port checks**: `netstat -ano | findstr :3007` from Bash, or `Get-NetTCPConnection -LocalPort 3007` in PowerShell

### Tool-specific gotchas (learned the hard way)

- **Lighthouse CI**: the `--chrome-flags` value must NOT contain `--enable-features=...prefers-reduced-motion` — it tanks perf metrics. Pass flags via a `.lighthouserc.cjs` config file, not inline shell args
- **Statusline / `~/.claude/settings.json`**: paths in `statusLine.command` need forward slashes AND must not contain bash variables like `$HOME` — Windows resolves them differently. Use absolute paths with forward slashes (`C:/Users/farii/.claude/...`)
- **Playwright**: install browsers with `npx playwright install chromium` — the full install fails on some Windows networks
- **Prisma**: schema file watcher is flaky on Windows; after editing `schema.prisma`, manually run `npx prisma generate` rather than relying on `tsx watch` to pick it up

### Decision rule

If a one-liner needs more than two pipes, more than one quoting level, or any shell built-in beyond `cd`/`echo`, **stop and write a `.mjs` script instead**. The 30 seconds you save on a clever pipeline costs 10 minutes when it breaks.

## Database Migrations

After modifying `prisma/schema.prisma` or any DB-related file, **always** run `npx prisma generate` followed by `npx prisma db push` (local) or `npx prisma migrate dev` (creates a migration file) **before declaring the task complete**.

After the migration, verify these still return 200 (not 500):
- `GET /api/auth/me` — the most common breakage point; a stale Prisma client breaks the auth `me` route first
- `GET /health`
- Any specific endpoint touched by the schema change

This rule exists because past sessions shipped schema changes without running migrations (AI ad-image feature, Google Maps rating display), breaking login until the next session caught it. Typecheck passing is **not** sufficient — a stale Prisma client compiles fine but throws at runtime.

## Verification Before Done

Before declaring any task complete, run this checklist (skip none):
1. **Typecheck both sides** — `cd backend && npm run build` (or tsc --noEmit) AND `cd frontend && npm run build`
2. **If `prisma/schema.prisma` changed** — run `npm run db:push` (local) or `npm run db:migrate` and confirm no errors
3. **Smoke-test affected endpoints** — at minimum hit `GET /api/auth/me` and `GET /health` and confirm 200 (not 500). If the change touched a specific route, curl that route too
4. **Restart the backend** if env, schema, or plugin code changed — stale dev servers mask broken startup
5. Do **not** say "done" if any step was skipped. State explicitly which steps ran and their results

This rule exists because past sessions shipped schema changes without migrations, breaking `/api/auth/me` and blocking login until the next session caught it.

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
npm run platform:create-admin  # Create a platform-admin user (scripts/createPlatformAdmin.ts)
npm run billing:run-dunning    # Manually run billing dunning sweep (scripts/runDunning.ts)

# Tests (Vitest)
npm test                       # Run all tests
npm run test:watch             # Watch mode
npm run test:routes            # Route tests only
npm run test:services          # Service tests only
npm run test:integration       # Integration tests only
npm run test:coverage          # With coverage report
npx vitest run __tests__/routes/auth.test.ts  # Single test file
# `npm run test:legacy` runs the old node:test suite at tests/api.test.ts — kept for parity, prefer Vitest
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
  │  Landing │ Admin Dashboard │ Patient Portal │ Platform Admin │ Embeddable Widget
  │  /api/* proxied via Vite → :3007
  ▼
Backend (Fastify 4 + TypeScript, ES Modules)
  ├─ Routes (src/routes/)           ← API endpoints, registered in routes/index.ts
  ├─ Services (src/services/)       ← Business logic layer
  ├─ Plugins (src/plugins/)         ← Fastify decorators (prisma, openai, gemini, scheduler, auth, platformAuth, subscriptionGuard, planGuard)
  └─ Prisma ORM → PostgreSQL :5434
       │
  External: OpenAI (chat) · Google Gemini · Anthropic Claude (Patient Intelligence) · Baileys WhatsApp Web · Tap Payments · S3 (uploads)
```

### Key Layers

- **Entry**: `server.ts` → `app.ts` (builds Fastify instance with all plugins, CORS, Swagger, routes)
- **Route registration**: `routes/index.ts` — central file that registers ~47 route modules under `/api/*`. Auth/guard plugins (`auth`, `platformAuth`, `subscriptionGuard`, `planGuard`) are registered here, not in `app.ts`
- **Services**: Business logic lives in `src/services/`, routes are thin wrappers calling services
- **Plugins** in `app.ts`: `prisma`, `scheduler`, `openai`, `gemini`, plus `@fastify/websocket`. Plugins decorate `app` (e.g., `app.prisma`, `app.openai`, `app.gemini`)
- **Middleware order** (in `app.ts`): Helmet (CSP locks down to self + Tap Payments) → Rate Limiting (100 req/min global, 10 req/min on auth routes) → CORS (`CORS_ORIGIN` required in prod) → JWT (HS256, `expiresIn: 3650d`) → custom JSON parser (allows empty bodies for endpoints like `POST /api/chat/new`) → formbody → multipart (10MB cap, used by Patient Intelligence CSV upload) → static `/public/` and `/uploads/`
- **Tests**: `backend/__tests__/` organized into `routes/`, `services/`, `integration/`, `helpers/` — Vitest with 30s timeout, aliases `@` → `./src` and `@tests` → `./__tests__`. Test helpers in `__tests__/helpers/testUtils.ts` provide factories (`createTestUser()`, `createTestPatient()`, `createTestProvider()`), unique generators (`uniqueEmail()`, `uniquePhone()`), and `waitFor()` polling

### Multi-tenancy

Every data query is scoped by `orgId` from the JWT payload (`request.user.orgId`). This is the single most important invariant — never query without org scoping.

### Three Auth Systems

1. **Staff/Admin JWT** (`@fastify/jwt`, `plugins/auth.ts`): email/password login → token (HS256, very long-lived), stored in `localStorage`, payload `{ userId, orgId, email }`, protected via `app.authenticate` preHandler
2. **Patient Portal** (`plugins/auth.ts` + `routes/patientAuth.ts`): phone + date-of-birth login → separate `patient_token`, stored in `sessionStorage`, separate `PatientAuthContext` on the frontend
3. **Platform Admin** (`plugins/platformAuth.ts` + `/api/platform/*` routes): a third JWT type used by Tawafud staff to manage tenant orgs, subscriptions, cross-tenant metrics, and the platform audit log. Lives alongside the org-staff JWT but verifies a different payload shape

### WhatsApp Pipeline (Baileys)

`services/messaging/baileysManager.ts` runs a self-hosted WhatsApp Web client (`@whiskeysockets/baileys`) per org. Routes under `/api/baileys-whatsapp/*` (`routes/baileysWhatsApp.ts`) handle QR pairing, session lifecycle, and outbound sends. Inbound messages flow into the same chat/AI services used by the embeddable web widget — there is no Twilio.

### AI System

- `services/llm.ts` — OpenAI chat completions wrapper
- `services/systemPrompt.ts` — Dynamic org-aware system prompt builder
- `services/ai/guardrails.ts` — Allowed actions (scheduling, FAQ) vs blocked actions (diagnosis, treatment). AI responses validated for scope
- `services/security/piiRedactor.ts` — Strips Saudi national IDs, phone numbers, emails from responses
- `services/patient/contextBuilder.ts` — Builds patient history/memory context for AI conversations
- `services/patient/identityVerifier.ts` — Patient identity verification levels

### Patient Intelligence

`routes/patientIntelligence.ts` + `services/patientIntelligence/*`. A receptionist uploads a CSV export of an external clinic database (via `@fastify/multipart`, 10MB cap); the pipeline uses Anthropic Claude (`@anthropic-ai/sdk`) to score each patient by service-cycle due-date and produce WhatsApp campaign suggestions. Integration tests live at `backend/__tests__/services/patientIntelligence/pipeline*.integration.test.ts`. Suggestions surface in the dashboard for receptionist approval before sending (no auto-send by default).

### Branding & Ad Images

`routes/branding.ts` stores per-org brand identity (logo, colors, voice/tone) used to keep AI-generated content on-brand. `routes/adImages.ts` + `services/imageGeneration.ts` generate marketing ad images consumed by campaigns. Files are persisted to S3 (`@aws-sdk/client-s3`) when configured, falling back to the local `/uploads/` static directory for dev.

### Agent Builder

Visual no-code flow editor using `@xyflow/react`. Flows stored as JSON nodes + edges in `AgentFlow` model. INSTRUCTION nodes customize LLM behavior within flows (they guide the AI, not replace it). Templates seeded via `seedFlowTemplates()`.

### Frontend Architecture

- **Routing**: React Router v7 in `App.tsx` — public routes (`/`, `/login`, `/book/:slug`), staff routes (`/dashboard/*` with `ProtectedRoute`), patient routes (`/patient/*` with `ProtectedPatientRoute`), and a Platform Admin section gated on the platform JWT
- **Layouts**: `DashboardLayout` (staff sidebar + outlet), `PortalLayout` (patient mobile-optimized, bottom nav)
- **API client**: `lib/api.ts` — Axios instance with Bearer token interceptor, 401 auto-logout redirect. Patient API uses `sessionStorage` instead of `localStorage`
- **State**: React Context for auth (`AuthContext`, `PatientAuthContext`, `BranchContext`) + TanStack Query v5 for server state (staleTime varies 30s–5min)
- **i18n**: i18next with Arabic fallback, browser detection → localStorage. `useTranslation()` hook, RTL via `i18n.language === 'ar'`
- **Notable pages**: `BillingCheckout` (Tap Payments), `BrandIdentity` (logo/colors/voice), `PatientInsights` (Patient Intelligence results)
- **Widget**: Embeddable chat built as IIFE via `vite.widget.config.ts` → `dist-widget/widget.js`, self-contained with no external deps

### Production Startup Guards

Backend hard-fails on startup in production if any of: `JWT_SECRET` is default/missing, `WEBHOOK_API_KEY` missing or placeholder, `OPENAI_API_KEY` missing, `CORS_ORIGIN` not set, `TAP_SECRET_KEY` missing or placeholder, `REGISTRATION_TOKEN` missing or placeholder, `FRONTEND_URL` missing, `BASE_URL` missing, or any `SEED_PLATFORM_ADMIN_*` env var is set (must not seed platform admins in prod). Source: `backend/src/app.ts:118-149`.

### CI/CD

- **CI** (`.github/workflows/ci.yml`): Runs on push/PR — 3 parallel jobs: backend (Prisma generate + type check + Vitest), frontend (lint + type check + build), security audit (`npm audit`)
- **Deploy** (`.github/workflows/deploy.yml`): Push to `main` → Docker build → SSH to VPS → DB migrations → zero-downtime compose up → health check

## Conventions

- **ES Modules everywhere** — `.js` extensions in imports, `"type": "module"` in both packages
- **Path aliases**: `@/*` → `src/*` in both backend and frontend
- **Validation**: Zod schemas for request bodies (backend); React Hook Form + Zod (frontend). The global error handler in `app.ts` converts `ZodError` → 400 with `details: error.issues`
- **DB naming**: snake_case tables/columns via `@@map`/`@map` in Prisma schema; 60+ models in `prisma/schema.prisma`
- **API responses**: Direct JSON return (no wrapping); errors as `{ error, message }`
- **Bilingual Arabic-first**: Backend uses `lib/messages.ts` with `{ ar, en }` objects selected via `Accept-Language`. Frontend uses i18next with Arabic as `fallbackLng`, RTL via `tailwindcss-rtl`. Many DB models have `name` + `name_ar` fields
- **Frontend styling**: Tailwind with healthcare color tokens (`healthcare.*`), fonts: Figtree (headings) + Noto Sans Arabic (body)
- **Scheduled tasks**: `node-cron` via `plugins/scheduler.ts` — reminders, campaigns, care gaps, medication reminders, quality analysis, waitlist auto-fill, hold expiration
- **Audit trail**: `services/security/auditLogger.ts` is wired in via `registerAuditMiddleware(app)` at the end of `routes/index.ts` — sensitive route accesses are logged automatically

## Database

PostgreSQL 16 on port **5434** (Docker container `tawafud_postgres`). Connection details in `backend/.env`. Schema has 60+ models covering clinic operations, patient intelligence, branding, billing, and the multi-tenant platform — see `backend/prisma/schema.prisma`.

Key enum to know: `appointment_status` lifecycle is `held → booked → confirmed → checked_in → in_progress → completed/cancelled/no_show/expired`.

## Development Setup

```bash
docker compose up -d app_postgres redis     # 1. Start DB
cd backend && npm install                   # 2. Install deps
npx prisma generate && npx prisma db push   # 3. Setup schema
npx prisma db seed                          # 4. Seed demo org
PORT=3007 npm run dev                       # 5. Start backend on :3007 (see note below)

# Separate terminal:
cd frontend && npm install && npm run dev   # 6. Start frontend → :5174
```

Swagger docs: `http://localhost:{PORT}/docs` (non-prod only) · Health: `http://localhost:{PORT}/health`

**Required**: the Vite dev server proxies `/api` to `http://localhost:3007` (`frontend/vite.config.ts:16`), but the backend defaults to **3003**. Local dev needs `PORT=3007` in `backend/.env` (or on the command line) — without it the frontend cannot reach the API.

## Known Issues

- Redis is in `docker-compose.yml` but not yet wired into backend code
- Backend dev port must be `3007` to match the hardcoded Vite proxy target (see Development Setup)
- `twilio` and `elevenlabs` remain in `backend/package.json` but no code imports them — leftover from the deleted voice pipeline; safe to drop on the next dependency cleanup
- Some frontend pages may be stubs awaiting full implementation
- Tailwind removal is planned but not yet executed — frontend still uses `tailwindcss` 3.4.17 with full config, RTL plugin, and component classes in `index.css`. Treat the existing Tailwind code as canonical until the migration plan lands.

## Claude tooling (MCP servers, skills, E2E)

- **MCP servers** (configured via `claude mcp add`):
  - `context7` (user scope) — up-to-date library docs for Fastify, Prisma, React, Vite, Zod, Baileys, etc. Reduces API hallucinations.
  - `postgres` (project scope, dev DB only) — read-only access to the local Postgres on `:5434`. Lets Claude inspect schema and run SELECTs against `hospital_booking`. Connection string lives in `.mcp.json` (gitignored — contains password).
- **Project skills** (`.claude/skills/`, committed to git so the team shares them):
  - `orgid-multi-tenancy` — enforces the #1 invariant: every Prisma query in `backend/src/routes/` and `backend/src/services/` must include `orgId` in `where`. Auto-fires when reviewing or writing any route/service Prisma call.
  - `bilingual-messages` — every user-facing API message must come from `backend/src/lib/messages.ts` as a `{ ar, en }` pair selected via `Accept-Language` (Arabic is the default fallback).
- **E2E testing** (`frontend/e2e/`, Playwright CLI — not MCP):
  - `cd frontend && npm run test:e2e` — runs the Chromium-only Playwright suite against the Vite dev server (auto-started via `webServer` config).
  - `npm run test:e2e:ui` opens the Playwright inspector for stepping through tests visually.
  - Seeded specs: `login.spec.ts` (staff login → dashboard) and `booking.spec.ts` (public `/book/:slug` page). Override credentials/slug via `E2E_STAFF_EMAIL`, `E2E_STAFF_PASSWORD`, `E2E_BOOKING_SLUG` env vars.
