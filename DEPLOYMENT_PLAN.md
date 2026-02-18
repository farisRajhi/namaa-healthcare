# 🚀 Namaa (نماء) — Production Deployment Plan

**Generated:** 2026-02-18  
**Target:** Ubuntu 22.04 LTS VPS  
**Stack:** Fastify + Prisma + PostgreSQL 16 + Twilio + OpenAI/Gemini + ElevenLabs + React/Vite/Tailwind  
**Estimated Setup Time:** 1–2 hours for an experienced engineer

---

## Table of Contents

1. [Pre-Deployment Checklist](#1-pre-deployment-checklist)
2. [VPS Initial Setup](#2-vps-initial-setup)
3. [Required Environment Variables](#3-required-environment-variables)
4. [Docker Compose Template](#4-docker-compose-template)
5. [Nginx Config Template](#5-nginx-config-template)
6. [Database Migration Strategy](#6-database-migration-strategy)
7. [SSL / HTTPS Setup](#7-ssl--https-setup)
8. [Deploy Steps — Step by Step](#8-deploy-steps--step-by-step)
9. [Post-Deploy Verification](#9-post-deploy-verification)
10. [Maintenance & Backups](#10-maintenance--backups)
11. [Known Blockers & Gaps](#11-known-blockers--gaps)

---

## 1. Pre-Deployment Checklist

Before starting, have the following ready:

| Item | Status | Notes |
|------|--------|-------|
| VPS with Ubuntu 22.04 | ☐ | 4 vCPU / 8 GB RAM minimum |
| Domain name + DNS | ☐ | Point A record to VPS IP |
| OpenAI API key | ☐ | For GPT-4 (chat & STT) |
| Google Gemini API key | ☐ | For Gemini Live voice |
| Twilio Account | ☐ | SID + Auth Token + Phone number |
| ElevenLabs API key | ☐ | For TTS (OpenAI path) |
| All API keys rotated | ☐ | ⚠️ Rotate before first deploy |
| Strong JWT_SECRET | ☐ | `openssl rand -base64 64` |
| Strong DB password | ☐ | `openssl rand -base64 32` |
| SSH key for GitHub Actions | ☐ | Optional, for CI/CD |

---

## 2. VPS Initial Setup

### 2.1 System Packages

```bash
# Update & install essentials
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git htop ufw fail2ban

# Configure firewall
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 2.2 Install Docker & Docker Compose

```bash
# Install Docker (official script)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
rm get-docker.sh

# Add current user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose plugin
sudo apt install -y docker-compose-plugin

# Verify
docker --version          # Docker 24.x+
docker compose version    # Docker Compose 2.x+
```

### 2.3 Clone Repository

```bash
sudo mkdir -p /opt/namaa
sudo chown $USER:$USER /opt/namaa
cd /opt/namaa
git clone https://github.com/farisRajhi/ai-agent.git .
```

---

## 3. Required Environment Variables

Copy `.env.example` to `.env` and fill in all values:

```bash
cd /opt/namaa
cp .env.example .env
nano .env
chmod 600 .env   # Restrict permissions!
```

### Complete Variable Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| **Database** | | | |
| `POSTGRES_USER` | ✅ | DB username | `app` |
| `POSTGRES_PASSWORD` | ✅ | DB password (strong!) | `openssl rand -base64 32` |
| `POSTGRES_DB` | ✅ | Database name | `hospital_booking` |
| `POSTGRES_PORT` | ✅ | Exposed host port | `5432` |
| `DATABASE_URL` | ✅ | Full Prisma connection URL | See below |
| **Server** | | | |
| `BACKEND_PORT` | ✅ | Backend listen port | `3000` |
| `NODE_ENV` | ✅ | Environment | `production` |
| `LOG_LEVEL` | ✅ | Pino log level | `info` |
| **Security** | | | |
| `JWT_SECRET` | ✅ ⚠️ | JWT signing secret — MUST be strong | `openssl rand -base64 64` |
| `CORS_ORIGIN` | ✅ | Allowed origins (comma-separated) | `https://your-domain.com` |
| `WEBHOOK_API_KEY` | ✅ | Webhook auth key | `openssl rand -hex 32` |
| **OpenAI** | | | |
| `OPENAI_API_KEY` | ✅ | OpenAI API key | `sk-proj-...` |
| `LLM_MODEL` | ✅ | LLM model to use | `gpt-4-turbo-preview` |
| `LLM_MAX_TOKENS` | ✅ | Max tokens per response | `1024` |
| `LLM_TEMPERATURE` | ✅ | LLM temperature | `0.7` |
| **Gemini** | | | |
| `GEMINI_API_KEY` | ✅ | Google Gemini API key | `AIzaSy...` |
| `USE_GEMINI_VOICE` | ✅ | Use Gemini for voice calls | `true` |
| **Twilio** | | | |
| `TWILIO_ACCOUNT_SID` | ✅ | Twilio Account SID | `AC...` |
| `TWILIO_AUTH_TOKEN` | ✅ | Twilio Auth Token | `...` |
| `TWILIO_PHONE_NUMBER` | ✅ | Twilio phone (E.164) | `+966xxxxxxxxx` |
| **ElevenLabs** | | | |
| `ELEVENLABS_API_KEY` | ✅ | ElevenLabs TTS key | `...` |
| **Voice Settings** | | | |
| `VOICE_DEFAULT_DIALECT` | ✅ | Default Arabic dialect | `msa` |
| `VOICE_MAX_CALL_DURATION_SEC` | ✅ | Max call length | `600` |
| `VOICE_SILENCE_TIMEOUT_MS` | ✅ | Silence detection threshold | `1500` |
| **URLs** | | | |
| `BASE_URL` | ✅ | Production base URL | `https://your-domain.com` |
| `VOICE_WS_URL` | ✅ | WebSocket URL for voice | `wss://your-domain.com/api/voice/stream` |
| **Org** | | | |
| `DEFAULT_ORG_ID` | ✅ | UUID of default org (get from DB after seed) | `<uuid>` |
| **Frontend** | | | |
| `VITE_API_URL` | ✅ | API URL for frontend build | `https://your-domain.com/api` |
| `VITE_WS_URL` | ✅ | WebSocket URL for frontend | `wss://your-domain.com/api/voice/stream` |
| `VITE_APP_NAME` | ✅ | App name | `Namaa` |
| **Nginx** | | | |
| `NGINX_HTTP_PORT` | ✅ | HTTP port | `80` |
| `NGINX_HTTPS_PORT` | ✅ | HTTPS port | `443` |

### Generate Secrets

```bash
# Strong JWT secret (64 bytes base64)
openssl rand -base64 64

# Strong DB password (32 bytes base64)
openssl rand -base64 32

# Webhook API key (32 bytes hex)
openssl rand -hex 32
```

### DATABASE_URL Format

In `docker-compose.prod.yml`, this is auto-constructed pointing to the `postgres` service.  
For local `.env` reference:
```
DATABASE_URL=postgresql://app:YOUR_PASSWORD@postgres:5432/hospital_booking?schema=public
```

---

## 4. Docker Compose Template

The project already has `docker-compose.prod.yml`. It is production-ready with:
- PostgreSQL 16 with health check
- Backend multi-stage build (non-root, dumb-init, health check)
- Frontend multi-stage build (Nginx, SPA fallback)
- Nginx reverse proxy with WebSocket support
- Internal Docker network (services not exposed directly)
- Named volumes for data persistence

The file is at `docker-compose.prod.yml` in the project root.  
**No changes needed** — it correctly references all env vars from `.env`.

### Optional: Add Resource Limits

Add this to each service in `docker-compose.prod.yml` for production stability:

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
  
  frontend:
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
  
  postgres:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
```

---

## 5. Nginx Config Template

The project already has `nginx.conf` at the project root. It handles:
- HTTP on port 80
- API proxy to backend on `/api/`
- WebSocket upgrade for `/api/voice/stream`
- Twilio webhook pass-through for `/api/webhooks/twilio`
- Frontend SPA proxy
- Health check endpoint
- Rate limiting (10 req/s for API, 30 req/s general)
- Security headers

### Enabling HTTPS (Let's Encrypt)

After obtaining certs, uncomment the HTTPS block in `nginx.conf`:

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # HSTS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # ... same location blocks as HTTP config ...
}

# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

Then copy certs to `ssl/` directory:
```bash
mkdir -p /opt/namaa/ssl
# Symlink or copy Let's Encrypt certs:
sudo ln -sf /etc/letsencrypt/live/your-domain.com/fullchain.pem /opt/namaa/ssl/fullchain.pem
sudo ln -sf /etc/letsencrypt/live/your-domain.com/privkey.pem /opt/namaa/ssl/privkey.pem
```

---

## 6. Database Migration Strategy

### Issue: Only 1 migration exists
The schema was largely applied via `prisma db push` rather than migrations. To fix:

```bash
# On first production deploy, create a baseline migration
docker compose -f docker-compose.prod.yml run --rm backend \
  npx prisma migrate deploy

# If migrate deploy fails (schema drift), reset and apply:
docker compose -f docker-compose.prod.yml run --rm backend \
  npx prisma migrate reset --force
```

### Ongoing Migration Workflow

For future schema changes:
```bash
# Development: create migration
cd backend
npx prisma migrate dev --name describe_your_change

# Production: apply migrations
docker compose -f docker-compose.prod.yml run --rm backend \
  npx prisma migrate deploy
```

### Seed Initial Data

```bash
docker compose -f docker-compose.prod.yml run --rm backend \
  npm run db:generate

# Seed demo hospital data (idempotent — safe to run multiple times)
docker compose -f docker-compose.prod.yml run --rm backend \
  npx prisma db seed
```

### Get DEFAULT_ORG_ID

After seeding, get your org UUID:
```bash
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U app -d hospital_booking -c "SELECT org_id, name FROM orgs;"
```

Copy the UUID and set `DEFAULT_ORG_ID=<uuid>` in `.env`, then restart backend:
```bash
docker compose -f docker-compose.prod.yml restart backend
```

---

## 7. SSL / HTTPS Setup

### Option A: Let's Encrypt (Recommended)

```bash
# Install certbot
sudo apt install -y certbot

# Get certificate (standalone — Docker must NOT be on port 80 yet)
sudo certbot certonly --standalone \
  -d your-domain.com \
  -d www.your-domain.com \
  --email your@email.com \
  --agree-tos --non-interactive

# Set up symlinks
mkdir -p /opt/namaa/ssl
sudo ln -sf /etc/letsencrypt/live/your-domain.com/fullchain.pem /opt/namaa/ssl/fullchain.pem
sudo ln -sf /etc/letsencrypt/live/your-domain.com/privkey.pem /opt/namaa/ssl/privkey.pem
sudo chmod -R 755 /etc/letsencrypt/live/
sudo chmod -R 755 /etc/letsencrypt/archive/

# Auto-renewal cron
echo "0 3 * * * certbot renew --quiet && docker compose -f /opt/namaa/docker-compose.prod.yml exec nginx nginx -s reload" | sudo crontab -
```

### Option B: Cloudflare Proxy (Simplest)

If using Cloudflare:
1. Point your domain to VPS IP in Cloudflare DNS
2. Enable "Proxied" (orange cloud)
3. Set SSL mode to "Full" in Cloudflare
4. No certificate needed on VPS — Cloudflare handles it
5. Nginx only needs HTTP config (Cloudflare handles HTTPS termination)

---

## 8. Deploy Steps — Step by Step

### Step 1: Configure Environment (5 min)

```bash
cd /opt/namaa
cp .env.example .env
nano .env  # Fill in ALL values
chmod 600 .env
```

### Step 2: Start Database First (2 min)

```bash
docker compose -f docker-compose.prod.yml up -d postgres
# Wait for healthy status
docker compose -f docker-compose.prod.yml ps
```

### Step 3: Run Migrations & Seed (5 min)

```bash
# Generate Prisma client
docker compose -f docker-compose.prod.yml run --rm backend npm run db:generate

# Apply schema (first deploy)
docker compose -f docker-compose.prod.yml run --rm backend npx prisma migrate deploy || \
docker compose -f docker-compose.prod.yml run --rm backend npx prisma db push

# Seed demo data
docker compose -f docker-compose.prod.yml run --rm backend npx prisma db seed
```

### Step 4: Get Org ID (1 min)

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U app -d hospital_booking -c "SELECT org_id, name FROM orgs LIMIT 1;"
# Copy UUID to DEFAULT_ORG_ID in .env
nano .env
```

### Step 5: Build & Start All Services (10–20 min)

```bash
# Build all images
docker compose -f docker-compose.prod.yml build

# Start everything
docker compose -f docker-compose.prod.yml up -d

# Monitor startup
docker compose -f docker-compose.prod.yml logs -f --tail=50
```

### Step 6: SSL Setup (10 min)

```bash
# Follow Section 7 above
```

### Step 7: Configure Twilio Webhooks (5 min)

In Twilio Console → Phone Numbers → Your number:
- **Voice URL (webhook):** `https://your-domain.com/api/voice/incoming` (HTTP POST)
- **Status Callback:** `https://your-domain.com/api/voice/status` (HTTP POST)
- **Fallback URL:** `https://your-domain.com/api/voice/fallback` (HTTP POST)
- **WhatsApp Webhook:** `https://your-domain.com/api/whatsapp/webhook` (HTTP POST)

### Step 8: Verify Deployment

```bash
./deploy.sh status
curl https://your-domain.com/health
curl https://your-domain.com/api/voice/health
```

---

## 9. Post-Deploy Verification

### Health Checks

```bash
# Backend health
curl https://your-domain.com/health
# Expected: {"status":"ok","timestamp":"...","version":"1.1.0"}

# Voice health
curl https://your-domain.com/api/voice/health
# Expected: {"status":"ok","twilio":...}

# Frontend loads
curl -I https://your-domain.com/
# Expected: HTTP/2 200

# Swagger docs (should be accessible)
curl -I https://your-domain.com/docs
```

### Container Status

```bash
docker compose -f docker-compose.prod.yml ps
# All services should be: Up (healthy)
```

### Database Connection

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U app -d hospital_booking -c "SELECT count(*) FROM orgs;"
```

### Test Login

```bash
curl -X POST https://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@hospital.sa","password":"Admin1234!"}'
# Expected: {"token":"..."}
```

---

## 10. Maintenance & Backups

### Daily Database Backup (Auto)

```bash
# Create backup script
cat > /opt/namaa/backup.sh << 'EOF'
#!/bin/bash
set -e
cd /opt/namaa
mkdir -p backups
BACKUP_FILE="backups/backup-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U app hospital_booking | gzip > "$BACKUP_FILE"
# Keep last 14 days
find backups/ -name "backup-*.sql.gz" -mtime +14 -delete
echo "Backup created: $BACKUP_FILE"
EOF
chmod +x /opt/namaa/backup.sh

# Add to cron: daily at 2 AM
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/namaa/backup.sh >> /opt/namaa/backups/backup.log 2>&1") | crontab -
```

### Manual Backup / Restore

```bash
# Backup
./deploy.sh backup

# Restore
gunzip < backups/backup-YYYYMMDD-HHMMSS.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
    psql -U app hospital_booking
```

### Update Deployment

```bash
cd /opt/namaa
./deploy.sh update
```

### View Logs

```bash
./deploy.sh logs          # All services
./deploy.sh logs backend  # Just backend
```

### Useful `deploy.sh` Commands

| Command | Description |
|---------|-------------|
| `./deploy.sh deploy` | Full build + migrate + start |
| `./deploy.sh update` | Pull code + rebuild + zero-downtime restart |
| `./deploy.sh restart` | Restart all services |
| `./deploy.sh stop` | Stop all services |
| `./deploy.sh logs` | Follow all logs |
| `./deploy.sh status` | Show service status + disk usage |
| `./deploy.sh backup` | Backup database |
| `./deploy.sh build` | Build Docker images only |

---

## 11. Known Blockers & Gaps

These are the **most critical issues** from the `DEPLOYMENT_AUDIT.md` that should be resolved before serving real patients:

### 🔴 P0 — Security (Must Fix Before Any Production Traffic)

| Issue | Fix | Effort |
|-------|-----|--------|
| **API keys may be exposed** in git history | Rotate ALL keys (OpenAI, Gemini, Twilio, ElevenLabs) immediately | 30 min |
| **Default JWT_SECRET** in `.env` | Generate: `openssl rand -base64 64` | 5 min |
| **No `@fastify/helmet`** (missing security headers) | `npm install @fastify/helmet` + register in `app.ts` | 1 hr |
| **No global rate limiting** | Register `@fastify/rate-limit` globally in `app.ts` | 1 hr |
| **No RBAC enforcement** | Role model exists; add middleware checking `role.permissions` | 3-5 days |
| **HTTP status codes** on errors (some return 200 for not-found) | Fix routes to return 404/400 correctly | 1-2 hrs |

> **ALREADY FIXED in this session:** `server.ts` now has graceful SIGTERM/SIGINT shutdown.

### 🟡 P1 — Production Quality (Fix Within First Week)

| Issue | Fix | Effort |
|-------|-----|--------|
| **Only 1 DB migration** | Generate proper baseline migration | 1 hr |
| **No automated tests** | Add vitest unit tests for critical paths | 1-2 weeks |
| **No monitoring/alerting** | Add Sentry (error tracking) + uptime monitoring | 1 day |
| **Max call duration not enforced** | Add timer in voice WebSocket handlers | 2 hrs |
| **WebSocket endpoints unauthenticated** | Add callSid validation on connect | 2 hrs |
| **No Redis** (deployed but unused) | Use Redis for rate limiting store | 1-2 days |

### 🟢 P2 — Nice to Have (Post-Launch)

| Issue | Fix |
|-------|-----|
| Real OTP for patient portal | SMS-based OTP verification |
| EMR integration (Nphies, Epic FHIR) | HL7/FHIR bridge |
| Conversation summarization | LLM post-call summaries |
| Multi-org billing / SaaS layer | Usage tracking + invoicing |

---

## Estimated Setup Timeline

| Phase | Time |
|-------|------|
| VPS setup + Docker install | 20 min |
| DNS + SSL | 20 min |
| `.env` configuration | 15 min |
| Docker build + deploy | 15-25 min |
| Migrations + seed + verify | 10 min |
| Twilio webhook setup | 5 min |
| **Total** | **~1.5 hours** |

> Note: Security fixes (P0 items above) add another 1–3 days of work before the system is safe for real patient data.

---

*Deployment plan generated 2026-02-18. See also: `DEPLOYMENT.md`, `DEPLOYMENT_AUDIT.md`, `deploy.sh`.*
