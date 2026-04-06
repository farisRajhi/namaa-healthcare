# 📁 Tawafud Project Structure

Complete file structure after CI/CD and deployment setup.

## 🌳 Directory Tree

```
ai-agent/
├── .github/
│   └── workflows/
│       ├── ci.yml                    ✅ NEW - CI pipeline (lint, test, build)
│       └── deploy.yml                ✅ NEW - CD pipeline (deploy to production)
│
├── backend/
│   ├── dist/                         (compiled TypeScript output)
│   ├── node_modules/                 (dependencies)
│   ├── prisma/
│   │   ├── migrations/               (database migrations)
│   │   └── schema.prisma             (database schema)
│   ├── src/
│   │   ├── config/                   (configuration)
│   │   ├── controllers/              (route handlers)
│   │   ├── lib/                      (utilities)
│   │   ├── services/                 (business logic)
│   │   ├── types/                    (TypeScript types)
│   │   ├── app.ts                    (Fastify app setup)
│   │   └── server.ts                 (entry point)
│   ├── tests/                        (test files)
│   ├── .dockerignore                 ✅ NEW - Docker build excludes
│   ├── .env                          (local environment - gitignored)
│   ├── .env.example                  (environment template)
│   ├── Dockerfile                    ✅ NEW - Production container build
│   ├── package.json                  (dependencies & scripts)
│   ├── package-lock.json             (dependency lock)
│   └── tsconfig.json                 (TypeScript config)
│
├── frontend/
│   ├── dist/                         (Vite build output)
│   ├── node_modules/                 (dependencies)
│   ├── public/                       (static assets)
│   ├── src/
│   │   ├── components/               (React components)
│   │   ├── contexts/                 (React contexts)
│   │   ├── hooks/                    (custom hooks)
│   │   ├── i18n/                     (internationalization)
│   │   ├── lib/                      (utilities)
│   │   ├── pages/                    (page components)
│   │   ├── types/                    (TypeScript types)
│   │   ├── App.tsx                   (root component)
│   │   ├── main.tsx                  (entry point)
│   │   └── index.css                 (global styles)
│   ├── .dockerignore                 ✅ NEW - Docker build excludes
│   ├── Dockerfile                    ✅ NEW - Production container build
│   ├── nginx.conf                    ✅ NEW - SPA routing configuration
│   ├── package.json                  (dependencies & scripts)
│   ├── package-lock.json             (dependency lock)
│   ├── tsconfig.json                 (TypeScript config)
│   ├── vite.config.ts                (Vite configuration)
│   └── tailwind.config.js            (Tailwind CSS config)
│
├── ssl/                              (SSL certificates - create manually)
│   ├── fullchain.pem                 (→ Let's Encrypt certificate)
│   └── privkey.pem                   (→ Let's Encrypt private key)
│
├── backups/                          (database backups - auto-created)
│   └── backup-YYYYMMDD-HHMMSS.sql.gz (timestamped backups)
│
├── .dockerignore                     ✅ NEW - Root Docker excludes
├── .env                              (production environment - gitignored)
├── .env.example                      ✅ NEW - Complete environment template
├── .gitignore                        (git excludes)
├── docker-compose.yml                (development setup)
├── docker-compose.prod.yml           ✅ NEW - Production orchestration
├── nginx.conf                        ✅ NEW - Main reverse proxy config
├── deploy.sh                         ✅ NEW - Quick deployment script
├── DEPLOYMENT.md                     ✅ NEW - Complete deployment guide
├── DEPLOYMENT_QUICKSTART.md          ✅ NEW - Quick start guide
├── CI_CD_SETUP_COMPLETE.md           ✅ NEW - Setup documentation
├── SUBAGENT_COMPLETION_REPORT.md     ✅ NEW - Completion report
├── FILES_CREATED_SUMMARY.md          ✅ NEW - File creation summary
├── PROJECT_STRUCTURE.md              ✅ NEW - This file
└── README.md                         (project documentation)
```

## 📦 Key Files Explained

### CI/CD Pipeline
- **`.github/workflows/ci.yml`**  
  Runs on every push/PR. Tests backend & frontend (lint, type check, build).

- **`.github/workflows/deploy.yml`**  
  Runs on push to `main`. Builds Docker images, deploys to VPS, runs migrations.

### Docker Configuration
- **`backend/Dockerfile`**  
  Multi-stage build: Builder stage (compile TypeScript) + Production stage (run compiled code).

- **`frontend/Dockerfile`**  
  Multi-stage build: Builder stage (Vite build) + Nginx stage (serve static files).

- **`docker-compose.prod.yml`**  
  Orchestrates 4 services: PostgreSQL, Backend, Frontend, Nginx.

### Infrastructure
- **`nginx.conf`**  
  Main reverse proxy. Routes `/api/*` to backend, `/*` to frontend.  
  Includes rate limiting, WebSocket support, security headers.

- **`deploy.sh`**  
  Quick deployment script with 8 commands:  
  `build`, `deploy`, `update`, `restart`, `stop`, `logs`, `status`, `backup`.

### Configuration
- **`.env.example`**  
  Template with 50+ environment variables for database, APIs, security, etc.

## 🔑 Environment Variables

Copy `.env.example` to `.env` and configure:

### Required
- Database: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- Security: `JWT_SECRET`, `WEBHOOK_API_KEY`
- OpenAI: `OPENAI_API_KEY`
- Gemini: `GEMINI_API_KEY`
- Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- ElevenLabs: `ELEVENLABS_API_KEY`
- Domain: `BASE_URL`, `VOICE_WS_URL`, `CORS_ORIGIN`

### Optional
- Logging: `LOG_LEVEL`
- Voice: `VOICE_DEFAULT_DIALECT`, `VOICE_MAX_CALL_DURATION_SEC`
- Organization: `DEFAULT_ORG_ID`

## 🚀 Deployment Flow

```
1. Code Push to GitHub
        ↓
2. GitHub Actions CI
   - Lint code
   - Type check
   - Run tests
   - Build project
        ↓
3. Push to main branch
        ↓
4. GitHub Actions CD
   - Build Docker images
   - SSH to VPS
   - Pull latest code
   - Run migrations
   - Deploy containers
   - Health check
        ↓
5. Production Running
   - Backend API (Fastify)
   - Frontend SPA (React)
   - Database (PostgreSQL)
   - Reverse Proxy (Nginx)
```

## 📊 Service Architecture

```
                    Internet
                        ↓
            ┌───────────────────────┐
            │   Nginx (:80, :443)   │
            │   - Rate limiting     │
            │   - SSL/TLS          │
            │   - Security headers │
            └───────────┬───────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
        ▼                               ▼
┌───────────────┐            ┌──────────────────┐
│   Frontend    │            │     Backend      │
│  React + Vite │            │ Fastify + Prisma │
│  Nginx (:80)  │            │   Node (:3000)   │
└───────────────┘            └────────┬─────────┘
                                      │
                                      ▼
                            ┌──────────────────┐
                            │   PostgreSQL     │
                            │     (:5432)      │
                            └──────────────────┘
```

## 🛠️ Quick Commands

```bash
# Development
npm run dev                    # Backend dev server
npm run dev                    # Frontend dev server (in frontend/)

# Production
./deploy.sh deploy             # Full deployment
./deploy.sh update             # Update deployment
./deploy.sh logs               # View logs
./deploy.sh status             # Check status
./deploy.sh backup             # Backup database

# Docker
docker compose -f docker-compose.prod.yml up -d    # Start all
docker compose -f docker-compose.prod.yml logs -f   # View logs
docker compose -f docker-compose.prod.yml ps        # Status
docker compose -f docker-compose.prod.yml down      # Stop all

# Database
npm run db:migrate             # Run migrations
npm run db:generate            # Generate Prisma client
npm run db:studio              # Open Prisma Studio
```

## 📚 Documentation

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Complete deployment guide (16KB)
- **[DEPLOYMENT_QUICKSTART.md](./DEPLOYMENT_QUICKSTART.md)** - Quick 3-step guide
- **[CI_CD_SETUP_COMPLETE.md](./CI_CD_SETUP_COMPLETE.md)** - Architecture docs
- **[.env.example](./.env.example)** - Environment variables reference

## 🔐 Security Checklist

- [x] Non-root users in Docker containers
- [x] Multi-stage builds (minimal production images)
- [x] Security headers (CSP, X-Frame-Options, etc.)
- [x] Rate limiting on API endpoints
- [x] CORS configuration
- [x] JWT authentication
- [x] Environment-based secrets (not hardcoded)
- [x] SSL/TLS ready
- [x] Database not exposed to public internet
- [x] Health checks on all services

## 📈 Resource Requirements

### Minimum VPS Specs
- **CPU**: 2 cores
- **RAM**: 4 GB
- **Storage**: 20 GB SSD
- **OS**: Ubuntu 22.04 LTS

### Recommended VPS Specs
- **CPU**: 4 cores
- **RAM**: 8 GB
- **Storage**: 50 GB SSD
- **OS**: Ubuntu 22.04 LTS

### Port Usage
- `80` - HTTP (Nginx)
- `443` - HTTPS (Nginx)
- `3000` - Backend (internal only)
- `5432` - PostgreSQL (internal only)

## ✅ Status

**Project Status**: ✅ Production Ready

**CI/CD Status**: ✅ Configured  
**Deployment**: ✅ Automated  
**Documentation**: ✅ Complete  
**Security**: ✅ Implemented  
**Monitoring**: ✅ Configured  

---

**Last Updated**: 2026-02-17  
**Version**: 1.0.0  
**Repository**: https://github.com/farisRajhi/ai-agent
