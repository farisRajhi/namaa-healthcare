# DEPLOYMENT_CHECKLIST.md — Tawafud (توافد) Production Deployment

> **Project:** Tawafud AI Medical Receptionist  
> **Created:** 2026-02-17  
> **Stack:** Fastify · PostgreSQL 16 · React 18 · Twilio · Gemini · OpenAI · ElevenLabs  
> **Target:** Saudi Arabia (Riyadh timezone, Arabic-first, NPHIES-aware)

---

## Table of Contents

1. [Pre-Deployment Readiness](#1-pre-deployment-readiness)
2. [Infrastructure Requirements](#2-infrastructure-requirements)
3. [Database Setup & Migration](#3-database-setup--migration)
4. [Security Hardening](#4-security-hardening)
5. [Twilio Production Setup](#5-twilio-production-setup)
6. [ElevenLabs Production Setup](#6-elevenlabs-production-setup)
7. [Replacing ngrok for Production](#7-replacing-ngrok-for-production)
8. [CI/CD Pipeline](#8-cicd-pipeline)
9. [Monitoring & Observability](#9-monitoring--observability)
10. [Backup & Disaster Recovery](#10-backup--disaster-recovery)
11. [Post-Deployment Verification](#11-post-deployment-verification)
12. [Rollback Procedures](#12-rollback-procedures)
13. [Saudi Healthcare Compliance (NPHIES)](#13-saudi-healthcare-compliance-nphies)
14. [Cost Estimate](#14-cost-estimate)
15. [Go-Live Day Runbook](#15-go-live-day-runbook)

---

## 1. Pre-Deployment Readiness

### 1.1 Code Freeze & Review

- [ ] All features merged to `main` branch
- [ ] Code review completed for all pending PRs
- [ ] No `TODO` / `FIXME` / `HACK` in critical paths (voice, auth, appointments)
- [ ] TypeScript strict mode — zero build errors: `cd backend && npm run build`
- [ ] Frontend builds cleanly: `cd frontend && npm run build`
- [ ] Widget builds cleanly: `cd frontend && npm run build:widget`

### 1.2 Test Suite

- [ ] API tests pass: `cd backend && npm test`
- [ ] Manual smoke test of all critical flows:
  - [ ] Admin register → login → create facility/department/provider/service
  - [ ] Patient portal login (phone + DOB) → book appointment → view prescriptions
  - [ ] AI chat (Arabic + English) → appointment booking via conversation
  - [ ] Inbound voice call → Twilio → Gemini voice → appointment created
  - [ ] WhatsApp inbound → AI response → appointment flow
  - [ ] Outbound campaign execution
  - [ ] Embeddable widget on external page
- [ ] Load test critical endpoints (appointments, chat, voice) with expected concurrency
- [ ] Voice call quality test with real Saudi phone numbers (Twilio → Gemini round-trip)

### 1.3 Environment Variable Audit

- [ ] **`JWT_SECRET`** — Generate cryptographically secure secret (≥64 chars):
  ```powershell
  node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
  ```
- [ ] **`WEBHOOK_API_KEY`** — Generate unique key for webhook authentication
- [ ] **`SKIP_TWILIO_VERIFY`** — Set to `false` (or remove entirely)
- [ ] **`NODE_ENV`** — Set to `production`
- [ ] **`LOG_LEVEL`** — Set to `warn` or `info` (not `debug`)
- [ ] **`CORS_ORIGIN`** — Restrict to production domains only (no `localhost`)
- [ ] **`BASE_URL`** — Set to production HTTPS domain (replaces ngrok)
- [ ] **`VOICE_WS_URL`** — Set to production WSS domain (replaces ngrok)
- [ ] **`DATABASE_URL`** — Points to production PostgreSQL (not dev DB)
- [ ] All API keys rotated from development values:
  - [ ] `OPENAI_API_KEY`
  - [ ] `GEMINI_API_KEY`
  - [ ] `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN`
  - [ ] `ELEVENLABS_API_KEY`
- [ ] Default database password `faris2002` changed to strong password
- [ ] `DEFAULT_ORG_ID` set to production org UUID

### 1.4 Dependency Audit

- [ ] `npm audit` — zero critical/high vulnerabilities in backend
- [ ] `npm audit` — zero critical/high vulnerabilities in frontend
- [ ] All dependencies at stable versions (no `alpha`/`beta`/`rc` in production)
- [ ] Lock files (`package-lock.json`) committed for both backend and frontend

---

## 2. Infrastructure Requirements

### 2.1 Compute (Recommended: Saudi Arabia Region)

| Component | Minimum | Recommended | Notes |
|-----------|---------|-------------|-------|
| **Backend (Fastify)** | 2 vCPU, 4 GB RAM | 4 vCPU, 8 GB RAM | Voice streaming is CPU-intensive |
| **Frontend (Nginx)** | 1 vCPU, 1 GB RAM | 2 vCPU, 2 GB RAM | Static SPA, low overhead |
| **PostgreSQL 16** | 2 vCPU, 4 GB RAM, 50 GB SSD | 4 vCPU, 8 GB RAM, 100 GB SSD | 40+ models, appointment data grows fast |
| **Redis 7** | 1 vCPU, 1 GB RAM | 2 vCPU, 2 GB RAM | Session cache, rate limiting |
| **n8n (optional)** | 1 vCPU, 1 GB RAM | 2 vCPU, 2 GB RAM | Workflow automation |

### 2.2 Cloud Provider Options (Saudi Presence)

| Provider | Saudi Region | Notes |
|----------|-------------|-------|
| **AWS** | `me-south-1` (Bahrain) | Closest major cloud region; NPHIES-friendly |
| **Azure** | UAE North / Qatar | Azure has strong Saudi gov partnerships |
| **Alibaba Cloud** | Saudi Arabia (Riyadh) | Direct Saudi presence, CITC-aligned |
| **STC Cloud** | Riyadh | Local Saudi provider, PDPL-compliant by default |
| **SCCC** | Riyadh | Saudi Cloud Computing Company, gov-endorsed |

**Recommendation:** AWS `me-south-1` or STC Cloud for data residency compliance.

### 2.3 Networking

- [ ] **Domain:** Purchase production domain (e.g., `tawafud.raskh.app` or `app.tawafud.raskh.app`)
- [ ] **SSL/TLS:** Certificate for HTTPS (Let's Encrypt or managed cloud cert)
- [ ] **DNS:** A/CNAME records for:
  - `app.tawafud.raskh.app` → Frontend (Nginx)
  - `api.tawafud.raskh.app` → Backend (Fastify)
  - `ws.tawafud.raskh.app` → WebSocket endpoint (voice streams)
- [ ] **Reverse Proxy:** Nginx or cloud load balancer with:
  - HTTPS termination
  - WebSocket upgrade support (`Connection: Upgrade`)
  - Rate limiting at edge
  - Request size limits (file uploads for prescriptions)
- [ ] **Firewall Rules:**
  - Inbound: 80 (HTTP→HTTPS redirect), 443 (HTTPS), WSS on 443
  - PostgreSQL: internal network only (no public exposure)
  - Redis: internal network only
  - SSH: restricted to admin IPs only
- [ ] **Static IP** for Twilio webhook allowlisting

### 2.4 Docker Production Setup

- [ ] Backend `Dockerfile` exists and builds correctly
- [ ] Frontend `Dockerfile` exists (Nginx serving built SPA)
- [ ] Production `docker-compose.prod.yml` with:
  - No exposed database ports to public
  - Proper restart policies (`unless-stopped`)
  - Resource limits (memory, CPU)
  - Health checks on all services
  - Named volumes for data persistence
- [ ] Container registry (ECR / ACR / Docker Hub) for built images

---

## 3. Database Setup & Migration

### 3.1 Production Database Provisioning

- [ ] PostgreSQL 16 instance provisioned (managed service preferred: RDS / Cloud SQL / Azure DB)
- [ ] Database created: `hospital_booking` (or rename for production)
- [ ] Database user created with **least-privilege** access:
  ```sql
  CREATE USER tawafud_app WITH PASSWORD '<STRONG_PASSWORD>';
  GRANT CONNECT ON DATABASE hospital_booking TO tawafud_app;
  GRANT USAGE ON SCHEMA public TO tawafud_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tawafud_app;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tawafud_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tawafud_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO tawafud_app;
  ```
- [ ] Separate read-only user for analytics/reporting
- [ ] Connection pooling configured (PgBouncer or managed service pool)
- [ ] `max_connections` tuned (default 100 → adjust based on backend concurrency)

### 3.2 Schema Migration

- [ ] Switch from `prisma db push` to **migration-based** workflow:
  ```powershell
  cd backend
  npx prisma migrate dev --name init    # Generate initial migration
  npx prisma migrate deploy             # Apply to production
  ```
- [ ] Migration files committed to version control
- [ ] Test migration on staging database first
- [ ] Verify all 40+ models created correctly
- [ ] Verify all enums created (`channel`, `appointment_status`, etc.)
- [ ] Verify all indexes and unique constraints

### 3.3 Seed Data (Production)

- [ ] **DO NOT** run full dev seed (`prisma db seed`) on production
- [ ] Create production seed script with only:
  - [ ] Default organization record
  - [ ] Initial admin user (with strong password)
  - [ ] Default roles and permissions
  - [ ] System configuration defaults
  - [ ] Required lookup data (appointment statuses, channels)
- [ ] Verify `DEFAULT_ORG_ID` matches the seeded org UUID

### 3.4 Database Configuration

- [ ] `timezone` set to `Asia/Riyadh` (or `UTC` with app-level conversion)
- [ ] `statement_timeout` set (e.g., 30s) to prevent runaway queries
- [ ] `log_min_duration_statement` set for slow query logging (e.g., 1000ms)
- [ ] SSL/TLS encryption for database connections enabled
- [ ] Connection string uses `sslmode=require`:
  ```
  postgresql://tawafud_app:<PASSWORD>@<HOST>:5432/hospital_booking?schema=public&sslmode=require
  ```

---

## 4. Security Hardening

### 4.1 Authentication & Authorization

- [ ] `JWT_SECRET` — Unique, ≥64 character cryptographically random value
- [ ] JWT token expiry reviewed (currently 24h — consider reducing to 8h with refresh tokens)
- [ ] bcrypt rounds verified at 12 (current) — adequate for production
- [ ] Rate limiting on auth endpoints:
  - `/api/auth/login` — 10 attempts/minute per IP (already configured)
  - `/api/auth/register` — 3 attempts/hour per IP
  - `/api/patient-portal/login` — 5 attempts/minute per phone number
- [ ] Account lockout after repeated failed attempts (consider adding)
- [ ] Password complexity requirements enforced (minimum length, mixed characters)

### 4.2 API Security

- [ ] **CORS** restricted to production domains only
- [ ] **Helmet** headers added (or equivalent Fastify plugin):
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY` (except for widget embed)
  - `Strict-Transport-Security` (HSTS)
  - `Content-Security-Policy`
- [ ] **Request size limits** configured (body parser limits)
- [ ] **Input validation** — All routes use Zod schemas (verify no unvalidated endpoints)
- [ ] **SQL injection** — Prisma ORM parameterizes queries (verify no raw SQL without parameterization)
- [ ] **Twilio signature verification** enabled (`SKIP_TWILIO_VERIFY=false`)
- [ ] **Webhook API key** required for all `/api/webhooks/*` routes
- [ ] **Swagger docs** disabled or protected in production (`/docs` endpoint)

### 4.3 Data Protection (PHI/PII)

- [ ] PII Redactor (`piiRedactor.ts`) active in production:
  - Saudi National ID (Iqama) patterns
  - Phone numbers
  - Email addresses
  - Medical record numbers
- [ ] AI Guardrails (`guardrails.ts`) enforced:
  - No medical diagnosis or treatment advice from AI
  - Blocked actions list verified
- [ ] Audit logging (`auditLogger.ts`) enabled for:
  - Patient data access
  - Appointment modifications
  - Prescription access
  - Admin actions
  - Authentication events
- [ ] Logs do NOT contain PHI/PII (verify log sanitization)
- [ ] Database encryption at rest enabled (cloud provider feature)
- [ ] All API traffic over HTTPS (no plain HTTP)

### 4.4 Secret Management

- [ ] **NO secrets in code or docker-compose.yml** — use environment variables
- [ ] Use a secrets manager (AWS Secrets Manager / Azure Key Vault / HashiCorp Vault)
- [ ] `.env` files excluded from version control (`.gitignore` verified)
- [ ] API keys have minimum required permissions:
  - OpenAI: billing alerts set, usage limits configured
  - Twilio: sub-account with restricted permissions
  - ElevenLabs: usage limits set
  - Gemini: quota limits configured

### 4.5 Network Security

- [ ] PostgreSQL not accessible from public internet
- [ ] Redis not accessible from public internet
- [ ] SSH access restricted to VPN or bastion host
- [ ] Web Application Firewall (WAF) recommended for public endpoints
- [ ] DDoS protection (cloud provider native or Cloudflare)

---

## 5. Twilio Production Setup

### 5.1 Account Configuration

- [ ] **Production Twilio account** (not trial):
  - Upgraded from trial account (if applicable)
  - Billing information added
  - Auto-recharge enabled
- [ ] **Saudi phone number** purchased:
  - Verify Twilio supports Saudi Arabia numbers, or use a US/UK number with Saudi routing
  - Alternatively: Saudi SIP trunk provider → Twilio SIP Domain
- [ ] **Regulatory compliance** completed:
  - Business identity verification
  - Address verification
  - Saudi telecom regulations acknowledged
- [ ] **Phone number capabilities** verified:
  - Voice calling (inbound + outbound)
  - SMS (for appointment reminders)
  - WhatsApp Business API (separate approval process)

### 5.2 Webhook Configuration

- [ ] Voice webhook URL: `https://api.tawafud.raskh.app/api/voice/incoming` (POST)
- [ ] Voice status callback URL: `https://api.tawafud.raskh.app/api/voice/status` (POST)
- [ ] Voice fallback URL configured (plays apology message on backend failure)
- [ ] WhatsApp webhook URL: `https://api.tawafud.raskh.app/api/whatsapp/incoming` (POST)
- [ ] SMS status callback configured
- [ ] Twilio signature verification enabled (`SKIP_TWILIO_VERIFY=false`)
- [ ] `BASE_URL` in backend `.env` matches webhook domain

### 5.3 Voice Stream (WebSocket)

- [ ] `VOICE_WS_URL` set to `wss://ws.tawafud.raskh.app/api/voice/stream-gemini`
- [ ] WebSocket endpoint accessible via WSS (TLS required by Twilio)
- [ ] Nginx/LB configured for WebSocket upgrade on voice stream path
- [ ] Connection timeout tuned for long voice calls (up to 600s / 10 min)
- [ ] Twilio Media Streams enabled on the phone number

### 5.4 WhatsApp Business

- [ ] WhatsApp Business API approved by Meta
- [ ] WhatsApp sender (phone number) approved
- [ ] Message templates approved for:
  - Appointment confirmations
  - Appointment reminders
  - Prescription notifications
- [ ] WhatsApp sandbox disabled (production mode)

### 5.5 Twilio Hardening

- [ ] API credentials stored in secrets manager (not `.env` files on disk)
- [ ] Twilio request URL allowlist configured (only your domain)
- [ ] Geographic permissions restricted (Saudi Arabia, GCC if needed)
- [ ] Call rate limits configured (prevent abuse)
- [ ] Usage triggers / alerts set (cost threshold notifications)

---

## 6. ElevenLabs Production Setup

### 6.1 Account & Plan

- [ ] ElevenLabs account on appropriate plan (Starter/Pro/Scale based on volume):
  - **Starter:** 30K characters/month — ~50 short calls
  - **Pro:** 100K characters/month — ~165 calls
  - **Scale:** 500K characters/month — ~830 calls
  - **Enterprise:** Custom — for high-volume facilities
- [ ] Arabic voice model selected and tested:
  - Verify Arabic pronunciation quality (MSA + regional dialects)
  - Test medical terminology pronunciation
- [ ] Voice cloning considered (if custom brand voice desired)

### 6.2 Integration

- [ ] `ELEVENLABS_API_KEY` set to production key
- [ ] Voice ID configured for selected Arabic voice
- [ ] Latency testing: ElevenLabs API response time from Saudi region
- [ ] Fallback to Gemini native TTS if ElevenLabs is unavailable
- [ ] Character usage monitoring and alerts configured

---

## 7. Replacing ngrok for Production

### 7.1 Current State (Development)

Currently, ngrok provides a public URL for:
1. **Twilio voice webhooks** (`BASE_URL`) — HTTP POST from Twilio
2. **Twilio media streams** (`VOICE_WS_URL`) — WebSocket from Twilio
3. **WhatsApp webhooks** — HTTP POST from Twilio

### 7.2 Production Architecture

Replace ngrok with proper infrastructure:

```
Internet
    │
    ▼
┌─────────────────────────────────┐
│  Cloud Load Balancer / Nginx    │
│  (SSL termination, WebSocket)   │
│  api.tawafud.raskh.app → :3000           │
│  wss://ws.tawafud.raskh.app → :3000      │
└────────────┬────────────────────┘
             │
    ┌────────▼─────────┐
    │  Backend (Fastify)│
    │  Port 3000        │
    │  (Docker container)│
    └──────────────────┘
```

### 7.3 Implementation Steps

- [ ] **Option A — Cloud Load Balancer (Recommended):**
  - AWS ALB / Azure Application Gateway / GCP HTTPS LB
  - Native SSL termination
  - Native WebSocket support
  - Health check integration
  - Auto-scaling target group

- [ ] **Option B — Nginx Reverse Proxy:**
  ```nginx
  # /etc/nginx/sites-available/tawafud-api
  server {
      listen 443 ssl http2;
      server_name api.tawafud.raskh.app;

      ssl_certificate /etc/letsencrypt/live/api.tawafud.raskh.app/fullchain.pem;
      ssl_certificate_key /etc/letsencrypt/live/api.tawafud.raskh.app/privkey.pem;

      # API routes
      location /api/ {
          proxy_pass http://localhost:3000;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto $scheme;
      }

      # WebSocket for voice streams
      location /api/voice/stream-gemini {
          proxy_pass http://localhost:3000;
          proxy_http_version 1.1;
          proxy_set_header Upgrade $http_upgrade;
          proxy_set_header Connection "upgrade";
          proxy_set_header Host $host;
          proxy_read_timeout 600s;  # Voice call max duration
          proxy_send_timeout 600s;
      }

      # WebSocket for chat
      location /api/chat/ws {
          proxy_pass http://localhost:3000;
          proxy_http_version 1.1;
          proxy_set_header Upgrade $http_upgrade;
          proxy_set_header Connection "upgrade";
          proxy_set_header Host $host;
          proxy_read_timeout 300s;
      }

      # Health check
      location /health {
          proxy_pass http://localhost:3000;
      }
  }
  ```

- [ ] **Option C — Cloudflare Tunnel (Simpler alternative):**
  - No public ports needed
  - Built-in DDoS protection
  - WebSocket support
  - Free tier available
  - Note: Verify Cloudflare compliance with Saudi data residency requirements

### 7.4 Environment Variable Updates

```env
# BEFORE (development)
BASE_URL=https://abc123.ngrok-free.app
VOICE_WS_URL=wss://abc123.ngrok-free.app

# AFTER (production)
BASE_URL=https://api.tawafud.raskh.app
VOICE_WS_URL=wss://api.tawafud.raskh.app
```

- [ ] Update `BASE_URL` in production `.env`
- [ ] Update `VOICE_WS_URL` in production `.env`
- [ ] Update Twilio webhook URLs in Twilio console
- [ ] Update WhatsApp webhook URL in Twilio console
- [ ] Verify both HTTPS and WSS work with new domain
- [ ] Remove ngrok dependency from deployment

---

## 8. CI/CD Pipeline

### 8.1 Pipeline Architecture

```
Git Push → Build → Test → Docker Build → Push Image → Deploy → Health Check
```

### 8.2 Recommended: GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy Tawafud

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test_db
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: cd backend && npm ci
      - run: cd backend && npx prisma generate
      - run: cd backend && npm run build
      - run: cd backend && npm test
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test_db

  build-and-deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build & push backend image
        run: |
          docker build -t tawafud-backend:${{ github.sha }} ./backend
          docker tag tawafud-backend:${{ github.sha }} <REGISTRY>/tawafud-backend:latest
          docker push <REGISTRY>/tawafud-backend:latest
      - name: Build & push frontend image
        run: |
          docker build -t tawafud-frontend:${{ github.sha }} ./frontend
          docker tag tawafud-frontend:${{ github.sha }} <REGISTRY>/tawafud-frontend:latest
          docker push <REGISTRY>/tawafud-frontend:latest
      - name: Deploy to production
        run: |
          # SSH to server and pull new images
          ssh deploy@<SERVER> "cd /opt/tawafud && docker compose pull && docker compose up -d"
      - name: Health check
        run: |
          sleep 30
          curl -f https://api.tawafud.raskh.app/health || exit 1
```

### 8.3 Pipeline Stages Detail

- [ ] **Lint:** ESLint on frontend
- [ ] **Type Check:** `tsc --noEmit` on both backend and frontend
- [ ] **Unit Tests:** `npm test` on backend
- [ ] **Build:** Compile TypeScript (backend) + Vite build (frontend + widget)
- [ ] **Docker Build:** Multi-stage Dockerfiles for small images
- [ ] **Push:** Container registry (ECR/ACR/GHCR)
- [ ] **Migration:** `npx prisma migrate deploy` (run before new backend starts)
- [ ] **Deploy:** Rolling update (zero downtime)
- [ ] **Health Check:** Verify `/health` endpoint responds
- [ ] **Smoke Test:** Automated critical path verification
- [ ] **Notify:** Slack/Teams notification on success/failure

### 8.4 Environment Strategy

| Environment | Branch | Purpose | Domain |
|-------------|--------|---------|--------|
| **Development** | `dev` | Local development | `localhost` |
| **Staging** | `staging` | Pre-production testing | `staging.tawafud.raskh.app` |
| **Production** | `main` | Live system | `app.tawafud.raskh.app` |

- [ ] Staging environment mirrors production configuration
- [ ] Database migrations tested on staging before production
- [ ] Manual approval gate for production deployments

---

## 9. Monitoring & Observability

### 9.1 Health Checks

- [ ] Backend: `GET /health` endpoint (already exists)
  - Returns DB connectivity status
  - Returns Redis connectivity status
  - Returns external service reachability
- [ ] Frontend: HTTP 200 on `/`
- [ ] Database: `pg_isready` check
- [ ] Redis: `PING` check
- [ ] Uptime monitoring (UptimeRobot / Pingdom / Better Uptime):
  - `/health` every 1 minute
  - Frontend every 1 minute
  - Alert on 2 consecutive failures

### 9.2 Application Logging

- [ ] Structured JSON logging (Fastify default with `pino`)
- [ ] Log aggregation service:
  - **Option A:** AWS CloudWatch Logs
  - **Option B:** ELK Stack (Elasticsearch + Logstash + Kibana)
  - **Option C:** Grafana Loki + Promtail
  - **Option D:** Datadog
- [ ] Log levels configured:
  - Production: `info` (default) or `warn`
  - Staging: `debug`
- [ ] Sensitive data excluded from logs (PII Redactor in logging pipeline)
- [ ] Log retention: 90 days minimum (regulatory requirement)

### 9.3 Application Performance Monitoring (APM)

- [ ] APM tool integrated:
  - **Option A:** Datadog APM
  - **Option B:** New Relic
  - **Option C:** AWS X-Ray
  - **Option D:** Sentry (errors + performance)
- [ ] Key metrics tracked:
  - API response times (p50, p95, p99)
  - Error rates by endpoint
  - Active WebSocket connections (voice + chat)
  - Database query performance
  - External API latency (OpenAI, Gemini, Twilio, ElevenLabs)

### 9.4 Infrastructure Monitoring

- [ ] Host metrics: CPU, Memory, Disk I/O, Network
- [ ] Container metrics: restart count, resource usage
- [ ] PostgreSQL metrics:
  - Active connections
  - Query duration
  - Table sizes
  - Dead tuples / vacuum status
  - Replication lag (if replica exists)
- [ ] Redis metrics:
  - Memory usage
  - Connected clients
  - Hit/miss ratio

### 9.5 Business Metrics Dashboard

- [ ] Appointments booked per day (AI vs manual)
- [ ] Voice calls: total, duration, completion rate
- [ ] Chat conversations: total, AI resolution rate
- [ ] WhatsApp messages: sent, delivered, read
- [ ] Campaign success rates
- [ ] Patient portal logins
- [ ] API error rate trend
- [ ] AI guardrail triggers (blocked actions)

### 9.6 Alerting

| Alert | Severity | Condition | Channel |
|-------|----------|-----------|---------|
| Backend down | 🔴 Critical | Health check fails 2x | SMS + Call |
| Database down | 🔴 Critical | `pg_isready` fails | SMS + Call |
| High error rate | 🟠 Warning | >5% 5xx in 5 min | Slack/Teams |
| Voice stream failures | 🟠 Warning | >3 failed calls in 10 min | Slack/Teams |
| High API latency | 🟡 Info | p95 >2s for 5 min | Slack/Teams |
| Disk space low | 🟠 Warning | <20% free | Slack/Teams |
| SSL cert expiring | 🟠 Warning | <14 days to expiry | Email |
| Twilio balance low | 🟠 Warning | <$50 remaining | Email + Slack |
| OpenAI quota approaching | 🟡 Info | >80% monthly budget | Email |

---

## 10. Backup & Disaster Recovery

### 10.1 Database Backup

- [ ] **Automated daily backups:**
  - Managed service: Enable automated backups (RDS: 7-day retention)
  - Self-managed: `pg_dump` cron job:
    ```bash
    # Daily at 2:00 AM Riyadh time (23:00 UTC)
    0 23 * * * pg_dump -h localhost -U tawafud_app -d hospital_booking -Fc > /backups/tawafud_$(date +\%Y\%m\%d).dump
    ```
- [ ] **Point-in-time recovery (PITR):**
  - Enable WAL archiving for PostgreSQL
  - Managed service: Enable PITR (RDS supports up to 35 days)
- [ ] **Backup retention:**
  - Daily: 7 days
  - Weekly: 4 weeks
  - Monthly: 12 months
  - Yearly: 7 years (Saudi healthcare data retention requirement)
- [ ] **Backup testing:** Monthly restore test to staging environment
- [ ] **Off-site backup:** Copy to different region/availability zone

### 10.2 Application Backup

- [ ] Docker images tagged with git SHA and `latest`
- [ ] `docker-compose.yml` and configuration files in version control
- [ ] Environment variables backed up in secrets manager (versioned)
- [ ] SSL certificates backed up (or use auto-renewal)
- [ ] Uploaded files (if any) backed up to object storage (S3/Blob)

### 10.3 Disaster Recovery Plan

| Scenario | RTO | RPO | Procedure |
|----------|-----|-----|-----------|
| Backend crash | 5 min | 0 | Docker auto-restart (`unless-stopped`) |
| Database corruption | 1 hour | 5 min (PITR) | Restore from PITR or latest backup |
| Server failure | 30 min | 5 min | Redeploy on new instance from images |
| Region outage | 4 hours | 1 hour | Failover to secondary region (if configured) |
| Data breach | Immediate | N/A | Incident response plan (see Security) |

- [ ] DR plan documented and accessible
- [ ] DR drill performed quarterly
- [ ] Runbook for each scenario

### 10.4 Redis Recovery

- [ ] Redis AOF persistence enabled (`appendonly yes` — already configured)
- [ ] Redis data is ephemeral/cacheable — full loss is recoverable
- [ ] Voice call sessions are in-memory (30-min TTL) — lost calls reconnect

---

## 11. Post-Deployment Verification

### 11.1 Automated Smoke Tests

Run immediately after deployment:

```powershell
# Health check
curl -f https://api.tawafud.raskh.app/health

# Auth flow
$token = (Invoke-RestMethod -Uri "https://api.tawafud.raskh.app/api/auth/login" `
  -Method POST -Body '{"email":"admin@test.com","password":"..."}' `
  -ContentType "application/json").token

# Protected endpoint
Invoke-RestMethod -Uri "https://api.tawafud.raskh.app/api/auth/me" `
  -Headers @{ Authorization = "Bearer $token" }

# Frontend loads
curl -f https://app.tawafud.raskh.app/

# Swagger docs (if enabled)
curl -f https://api.tawafud.raskh.app/docs
```

### 11.2 Manual Verification Checklist

- [ ] **Frontend:**
  - [ ] Landing page loads (Arabic by default, RTL layout)
  - [ ] Language switcher works (AR ↔ EN)
  - [ ] Admin login works
  - [ ] Dashboard loads with data
  - [ ] All sidebar navigation links work
  - [ ] Patient portal login works
  - [ ] Embeddable widget loads on test page
- [ ] **Backend API:**
  - [ ] `/health` returns 200
  - [ ] `/docs` (Swagger) accessible (or confirmed disabled)
  - [ ] Auth register/login/me flow works
  - [ ] CRUD operations: patients, appointments, providers
  - [ ] AI chat responds in Arabic and English
- [ ] **Voice:**
  - [ ] Inbound call → Twilio → Backend → Gemini → Response plays
  - [ ] Full call flow: greeting → patient identification → appointment booking
  - [ ] Call recording/logging working
  - [ ] Voice quality acceptable (no excessive latency)
- [ ] **WhatsApp:**
  - [ ] Inbound message received by backend
  - [ ] AI response sent back to patient
  - [ ] Appointment booking via WhatsApp works
- [ ] **Scheduled Jobs:**
  - [ ] Cron scheduler started (check logs)
  - [ ] Appointment reminders fire on schedule
  - [ ] Hold expiration working (stale holds released)
- [ ] **WebSocket:**
  - [ ] Chat WebSocket connects and streams
  - [ ] Voice stream WebSocket handles media
- [ ] **Multi-tenancy:**
  - [ ] Org scoping verified (data isolation between organizations)

### 11.3 Performance Baseline

- [ ] Record baseline metrics after deployment:
  - API response times (key endpoints)
  - Database query times
  - Voice call setup latency
  - Memory usage at idle
  - CPU usage at idle
- [ ] Compare with pre-deployment benchmarks

---

## 12. Rollback Procedures

### 12.1 Quick Rollback (Docker)

```powershell
# SSH to production server

# 1. Stop current containers
docker compose -f docker-compose.prod.yml down

# 2. Revert to previous image
docker tag <REGISTRY>/tawafud-backend:previous <REGISTRY>/tawafud-backend:latest
docker tag <REGISTRY>/tawafud-frontend:previous <REGISTRY>/tawafud-frontend:latest

# 3. Start with previous version
docker compose -f docker-compose.prod.yml up -d

# 4. Verify health
curl -f https://api.tawafud.raskh.app/health
```

### 12.2 Database Rollback

```powershell
# If migration caused issues:

# Option A: Prisma migrate (if supported)
cd backend
npx prisma migrate resolve --rolled-back <MIGRATION_NAME>

# Option B: Restore from backup
pg_restore -h <HOST> -U tawafud_app -d hospital_booking -c /backups/tawafud_<DATE>.dump
```

### 12.3 Rollback Decision Matrix

| Condition | Action |
|-----------|--------|
| Health check fails after deploy | Immediate rollback |
| Error rate >10% for 5 minutes | Immediate rollback |
| Voice calls failing | Immediate rollback |
| Minor UI bugs | Hotfix forward (no rollback) |
| Data migration issue | Restore DB backup + rollback code |
| Third-party API issue (Twilio/OpenAI) | No rollback — investigate API status |

### 12.4 Rollback Safeguards

- [ ] Always tag the "known good" image before deploying new version
- [ ] Database migrations must be **backward-compatible** (additive only)
- [ ] Keep previous 3 image versions in registry
- [ ] Document rollback procedure and test quarterly

---

## 13. Saudi Healthcare Compliance (NPHIES)

### 13.1 Overview

**NPHIES** (National Platform for Health Information Exchange Services) is Saudi Arabia's national health information exchange, managed by NPHIES under the Council of Health Insurance (CHI). Compliance is required for any healthcare system processing insurance claims or exchanging clinical data.

### 13.2 NPHIES Integration Checklist

- [ ] **Registration:**
  - [ ] Register with NPHIES as a healthcare provider / technology vendor
  - [ ] Obtain NPHIES Provider ID
  - [ ] Complete NPHIES onboarding process
- [ ] **Technical Integration:**
  - [ ] NPHIES API endpoints configured (sandbox → production)
  - [ ] HL7 FHIR R4 compliance for data exchange
  - [ ] Real-time eligibility verification (patient insurance status)
  - [ ] Prior authorization submission (if applicable)
  - [ ] Claim submission and adjudication tracking
- [ ] **Data Standards:**
  - [ ] ICD-10 coding for diagnoses (Arabic + English)
  - [ ] CPT/HCPCS for procedure coding
  - [ ] Saudi Drug Code for prescriptions
  - [ ] National ID (Iqama/Citizen ID) as patient identifier
  - [ ] Insurance policy number tracking
- [ ] **API Security:**
  - [ ] NPHIES OAuth 2.0 authentication
  - [ ] Certificate-based mutual TLS (mTLS) if required
  - [ ] API rate limits respected
  - [ ] Request/response logging for audit trail

### 13.3 Saudi Data Protection (PDPL)

The **Personal Data Protection Law (PDPL)** — Saudi Arabia's equivalent of GDPR — applies to all personal data processing:

- [ ] **Data Residency:** All patient data stored within Saudi Arabia (or approved jurisdictions)
- [ ] **Consent:** Patient consent obtained before data collection/processing
- [ ] **Data Minimization:** Only necessary data collected
- [ ] **Right to Access:** Patients can request their data (patient portal supports this)
- [ ] **Right to Deletion:** Process for patient data deletion requests
- [ ] **Breach Notification:** SDAIA (Saudi Data & AI Authority) notified within 72 hours of breach
- [ ] **Data Protection Impact Assessment (DPIA):** Completed for the system
- [ ] **Data Protection Officer (DPO):** Appointed (if processing large-scale health data)

### 13.4 CBAHI (Saudi Healthcare Accreditation)

If the facility is CBAHI-accredited:

- [ ] Information management standards met (IM chapter)
- [ ] Patient identification standards (at least 2 identifiers)
- [ ] Medication management standards (prescription workflows)
- [ ] Medical records retention (minimum 10 years for adults, longer for minors)

### 13.5 CITC (Communications & IT Commission)

- [ ] Cloud hosting compliant with CITC Cloud Computing Regulatory Framework
- [ ] Data classification completed (healthcare data = sensitive)
- [ ] Cloud provider registered with CITC (if required for Saudi hosting)

### 13.6 Telephony Compliance

- [ ] CITC approval for automated voice calls (if IVR/robocall regulations apply)
- [ ] Caller ID correctly displays facility name/number
- [ ] Call recording consent: Inform patients at call start (voice prompt)
- [ ] Do-not-call list compliance (for outbound campaigns)
- [ ] WhatsApp Business compliance with Meta + Saudi regulations

### 13.7 AI-Specific Regulations

- [ ] AI system registered with SDAIA (if required under Saudi AI Ethics Principles)
- [ ] AI guardrails document scope limitations clearly:
  - AI does NOT provide medical advice/diagnosis
  - AI is administrative only (scheduling, reminders, FAQ)
  - Clear disclosure that patient is interacting with AI (not human)
- [ ] AI bias testing for Arabic dialect understanding
- [ ] Transparency: AI decisions are explainable and logged

---

## 14. Cost Estimate

### 14.1 Infrastructure (Monthly)

| Resource | Service | Est. Monthly Cost |
|----------|---------|-------------------|
| **Compute (Backend)** | AWS EC2 t3.xlarge (4 vCPU, 16GB) or equivalent | $120–$180 |
| **Compute (Frontend)** | AWS EC2 t3.small or CloudFront + S3 | $20–$50 |
| **Database (PostgreSQL)** | AWS RDS db.r6g.large (2 vCPU, 16GB, 100GB) | $200–$350 |
| **Redis** | AWS ElastiCache t3.small | $25–$40 |
| **Load Balancer** | AWS ALB | $25–$35 |
| **Storage / Backups** | S3 + EBS snapshots | $20–$50 |
| **DNS** | Route 53 | $1–$5 |
| **SSL Certificate** | Let's Encrypt (free) / ACM (free on AWS) | $0 |
| **Monitoring** | CloudWatch / Datadog (basic) | $0–$100 |
| **Container Registry** | ECR / GHCR | $5–$15 |
| **n8n (optional)** | EC2 t3.small | $15–$25 |
| **Subtotal Infrastructure** | | **$430–$850** |

### 14.2 Third-Party APIs (Monthly, estimated for ~500 patients/month)

| Service | Usage Estimate | Est. Monthly Cost |
|---------|---------------|-------------------|
| **OpenAI GPT-4 Turbo** | ~2000 chat sessions × 2K tokens avg | $30–$80 |
| **Google Gemini** | Voice sessions (~500 calls × 5 min avg) | $20–$60 |
| **Twilio Voice** | 500 inbound + 200 outbound calls | $50–$150 |
| **Twilio SMS** | 1000 appointment reminders | $10–$30 |
| **Twilio WhatsApp** | 500 conversations | $30–$75 |
| **ElevenLabs TTS** | Pro plan (100K chars) | $22–$99 |
| **Subtotal APIs** | | **$160–$500** |

### 14.3 Operational (Monthly)

| Item | Est. Monthly Cost |
|------|-------------------|
| **Domain name** (.sa) | $5–$15/year → ~$1/month |
| **DevOps / maintenance** (part-time) | $500–$2,000 |
| **Incident response** (on-call) | Variable |
| **Subtotal Operational** | **$500–$2,000** |

### 14.4 Total Monthly Estimate

| Tier | Monthly Cost | Annual Cost |
|------|-------------|-------------|
| **Minimal** (small clinic, low volume) | **$1,100** | **$13,200** |
| **Standard** (medium facility, moderate volume) | **$1,800** | **$21,600** |
| **Growth** (multi-facility, high volume) | **$3,350** | **$40,200** |

### 14.5 One-Time Costs

| Item | Estimated Cost |
|------|---------------|
| Domain registration (`.sa`) | $50–$100 |
| Twilio regulatory bundle | $0–$50 |
| NPHIES integration development | $5,000–$20,000 |
| Security audit / penetration test | $3,000–$10,000 |
| PDPL compliance assessment | $2,000–$8,000 |
| Load testing tools | $0–$500 |
| **Total One-Time** | **$10,000–$38,650** |

---

## 15. Go-Live Day Runbook

### T-7 Days (One Week Before)

- [ ] Staging environment fully tested and signed off
- [ ] All stakeholders notified of go-live date
- [ ] Rollback plan reviewed and rehearsed
- [ ] On-call team identified and scheduled
- [ ] External dependencies verified (Twilio, OpenAI, Gemini, ElevenLabs)
- [ ] Database migration tested on staging
- [ ] Backup and restore procedure tested

### T-1 Day (Day Before)

- [ ] Production environment provisioned and accessible
- [ ] DNS records pre-configured (low TTL: 300s)
- [ ] SSL certificates issued and validated
- [ ] Secrets loaded into secrets manager
- [ ] Final code freeze — no merges to `main`
- [ ] Team briefing: roles, responsibilities, escalation path

### T-0 (Go-Live Day)

```
Timeline (Riyadh Time — UTC+3):
──────────────────────────────────
06:00  Team assembles, final checks
06:30  Database migration (prisma migrate deploy)
07:00  Deploy backend containers
07:15  Deploy frontend containers
07:30  Health checks pass ✓
07:45  Smoke tests (automated)
08:00  Manual verification (voice call, WhatsApp, portal)
08:30  Twilio webhooks pointed to production
09:00  DNS cutover (if applicable)
09:30  Monitor dashboards — watch for errors
10:00  ✅ Go-Live confirmed — notify stakeholders
──────────────────────────────────
```

- [ ] 06:00 — Team online, communication channel open
- [ ] 06:30 — Run database migration: `npx prisma migrate deploy`
- [ ] 06:35 — Seed production data (org, admin user, defaults)
- [ ] 07:00 — Deploy backend: `docker compose up -d backend`
- [ ] 07:05 — Verify backend health: `curl https://api.tawafud.raskh.app/health`
- [ ] 07:15 — Deploy frontend: `docker compose up -d frontend`
- [ ] 07:20 — Verify frontend: `curl https://app.tawafud.raskh.app`
- [ ] 07:30 — Run automated smoke tests
- [ ] 07:45 — Test voice call (real phone → Twilio → backend)
- [ ] 08:00 — Test WhatsApp message flow
- [ ] 08:15 — Test patient portal login and booking
- [ ] 08:30 — Update Twilio webhook URLs to production
- [ ] 08:35 — Verify Twilio signature verification working
- [ ] 09:00 — DNS cutover (update A/CNAME records)
- [ ] 09:30 — Monitor error rates, latency, voice quality
- [ ] 10:00 — **Go / No-Go decision**
- [ ] 10:00 — If Go: Notify stakeholders, begin monitoring period
- [ ] 10:00 — If No-Go: Execute rollback procedure

### T+1 to T+7 (First Week)

- [ ] 24/7 monitoring for first 48 hours
- [ ] Daily standup to review metrics and issues
- [ ] Collect voice call quality feedback from patients/staff
- [ ] Monitor AI conversation accuracy (review random sample)
- [ ] Track appointment completion rates
- [ ] Address any issues with hotfixes
- [ ] Document lessons learned

### T+30 (One Month Review)

- [ ] Performance baseline established
- [ ] Cost actuals vs estimate reviewed
- [ ] User feedback collected and prioritized
- [ ] Security scan performed
- [ ] Backup restore test performed
- [ ] Capacity planning for next quarter

---

## Appendix A: Environment Variable Template (Production)

```env
# ── Server ────────────────────────────────────────
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info

# ── Database ──────────────────────────────────────
DATABASE_URL=postgresql://tawafud_app:<PASSWORD>@<DB_HOST>:5432/hospital_booking?schema=public&sslmode=require

# ── Redis ─────────────────────────────────────────
REDIS_URL=redis://<REDIS_HOST>:6379

# ── Auth ──────────────────────────────────────────
JWT_SECRET=<64+ char cryptographic random>
WEBHOOK_API_KEY=<random key>

# ── CORS ──────────────────────────────────────────
CORS_ORIGIN=https://app.tawafud.raskh.app,https://tawafud.raskh.app

# ── URLs (replace ngrok) ─────────────────────────
BASE_URL=https://api.tawafud.raskh.app
VOICE_WS_URL=wss://api.tawafud.raskh.app

# ── AI ────────────────────────────────────────────
OPENAI_API_KEY=sk-prod-...
LLM_MODEL=gpt-4-turbo-preview
LLM_MAX_TOKENS=1024
LLM_TEMPERATURE=0.7

GEMINI_API_KEY=AIza...
USE_GEMINI_VOICE=true

# ── Twilio ────────────────────────────────────────
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+966...
SKIP_TWILIO_VERIFY=false

# ── ElevenLabs ────────────────────────────────────
ELEVENLABS_API_KEY=...

# ── Voice ─────────────────────────────────────────
VOICE_DEFAULT_DIALECT=msa
VOICE_MAX_CALL_DURATION_SEC=600
VOICE_SILENCE_TIMEOUT_MS=1500

# ── Org ───────────────────────────────────────────
DEFAULT_ORG_ID=<production org UUID>
```

---

## Appendix B: Quick Reference Commands

```powershell
# ── Build ─────────────────────────────────────────
cd backend  && npm ci && npm run build
cd frontend && npm ci && npm run build && npm run build:widget

# ── Database ──────────────────────────────────────
cd backend
npx prisma migrate deploy          # Apply migrations
npx prisma migrate status          # Check migration status
npx prisma db seed                 # Seed data (use production seed!)

# ── Docker ────────────────────────────────────────
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml ps

# ── Backup ────────────────────────────────────────
pg_dump -h <HOST> -U tawafud_app -d hospital_booking -Fc > backup.dump
pg_restore -h <HOST> -U tawafud_app -d hospital_booking -c backup.dump

# ── Monitoring ────────────────────────────────────
curl https://api.tawafud.raskh.app/health
docker stats
docker logs tawafud_backend --tail 100 -f
```

---

> **Document Owner:** DevOps / Engineering Lead  
> **Review Cycle:** Before every major deployment  
> **Last Reviewed:** 2026-02-17
