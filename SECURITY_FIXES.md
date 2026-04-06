# Security Fixes — Tawafud (توافد) AI Medical Receptionist

**Date:** 2026-02-18  
**Engineer:** Security subagent (automated)  
**Severity addressed:** P0 / P1

---

## What Was Fixed

### 1. ✅ Security Headers (`@fastify/helmet`)

**File:** `backend/src/app.ts`

Registered `@fastify/helmet` globally before all routes. This adds:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `X-XSS-Protection: 0` (modern recommendation)
- `Strict-Transport-Security` (HSTS in production)
- `Referrer-Policy`
- `Permissions-Policy`
- And more — see [helmet.js.org](https://helmetjs.github.io/)

**CSP is currently disabled** (`contentSecurityPolicy: false`) to avoid breaking the Swagger UI and embeddable widget. Enable and configure CSP headers via nginx or by re-enabling with explicit directives before going to production.

---

### 2. ✅ Global Rate Limiting (`@fastify/rate-limit`)

**File:** `backend/src/app.ts`

Added a **global** rate limit of **100 requests/minute per IP** on all routes.

Auth endpoints (`/api/auth/login`, `/api/auth/register`) already had their own tighter limit of **10 requests/minute** (in `backend/src/routes/auth.ts`). Both limits are now active.

The key generator respects `X-Forwarded-For` for deployments behind load balancers/nginx proxies.

---

### 3. ✅ RBAC Middleware

**File:** `backend/src/middleware/rbac.ts`

Created `requireRole(roles)` middleware factory and two convenience helpers:

- `requireAdmin` → only `admin` role
- `requireManager` → `admin` or `manager` roles

Applied `requireManager` to:
- `backend/src/routes/analytics.ts` — sensitive patient & ops analytics
- `backend/src/routes/campaigns.ts` — outbound campaign management
- `backend/src/routes/agentBuilder.ts` — modifies live AI agent flows

**How roles work:**
- The `Role` table in Prisma stores roles per org (name, permissions, isSystem).
- At login, the user's `roleId` is resolved to a role name and embedded in the JWT (`role` field).
- New registrations default to `role: "viewer"`.
- To grant admin access, update the `User.roleId` to point to an `admin` Role row.

---

### 4. ✅ JWT Payload Updated

**Files:** `backend/src/plugins/auth.ts`, `backend/src/routes/auth.ts`

Added `role?: string` to the JWT payload interface. Login route now queries the user's linked `Role` and embeds the name (e.g. `"admin"`, `"manager"`, `"viewer"`) in the token.

---

### 5. ✅ Status Codes Verified

Scanned all route files for `200` responses on "not found" conditions. **No mismatches found** — all not-found cases already correctly return `404`, and all validation errors return `400`.

---

### 6. ✅ `.env` in `.gitignore`

Both `.gitignore` files already exclude `.env`:
- `/` (root) → excludes `.env`, `.env.local`, `.env.*.local`
- `/backend/` → excludes `.env`, `.env.local`, `.env.*.local`

**Git history check:** No `.env` file was found in any commit history. Secrets were never committed.

---

## 🔑 Keys فارس Must Rotate Manually

Even though no `.env` was found in git history, the following keys should be rotated as a precaution (especially before production deployment):

| Key | Location | How to Rotate |
|-----|----------|---------------|
| `JWT_SECRET` | `backend/.env` | Generate new: `openssl rand -hex 64` — invalidates all existing sessions |
| `OPENAI_API_KEY` | `backend/.env` | Rotate at https://platform.openai.com/api-keys |
| `GEMINI_API_KEY` | `backend/.env` | Rotate at https://aistudio.google.com/app/apikey |
| `TWILIO_AUTH_TOKEN` | `backend/.env` | Rotate at https://console.twilio.com → Account → Auth Tokens |
| `TWILIO_ACCOUNT_SID` | `backend/.env` | (Cannot rotate SID, but revoke/replace Auth Token) |
| `ELEVENLABS_API_KEY` | `backend/.env` | Rotate at https://elevenlabs.io/app/settings/api-keys |
| `DATABASE_URL` | `backend/.env` | Change PostgreSQL password and update URL |
| `MOYASAR_SECRET_KEY` | `backend/.env` | Rotate at https://dashboard.moyasar.com/settings/api_keys |

---

## Pre-existing TypeScript Errors (Not Introduced by This Fix)

The following TS errors existed before these changes and were **not introduced** by the security fixes:

- `src/plugins/subscriptionGuard.ts(40,50)` — logger overload mismatch
- `src/routes/payments.ts(111,7)` — websocket route overload conflict
- `src/routes/payments.ts(217,56)` — logger call argument type

These should be addressed separately.

---

## Next Security Steps (Recommended)

1. **Enable CSP headers** — configure `contentSecurityPolicy` in helmet with explicit directives
2. **Add input sanitization** — consider `xss` or `dompurify` for any user HTML content
3. **Implement refresh tokens** — current JWTs are 24h with no revocation mechanism
4. **Add HTTPS enforcement** — ensure nginx/load-balancer enforces TLS; set `HSTS` preload
5. **Database connection pooling** — ensure `DATABASE_URL` uses a pooled connection string (PgBouncer)
6. **Audit logging** — `AuditLog` model exists; ensure all admin actions write to it
7. **Secret scanning** — add `git-secrets` or GitHub secret scanning to CI pipeline
