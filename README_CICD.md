# 🚀 Namaa CI/CD & Production Deployment

Complete CI/CD pipeline and production deployment infrastructure for **Namaa (نماء) AI Medical Receptionist**.

## 🎯 Quick Links

- **[Quick Start →](./DEPLOYMENT_QUICKSTART.md)** - Deploy in 3 steps
- **[Full Guide →](./DEPLOYMENT.md)** - Complete production deployment (16KB)
- **[Architecture →](./CI_CD_SETUP_COMPLETE.md)** - System architecture & setup
- **[File Structure →](./PROJECT_STRUCTURE.md)** - Project organization

## ✨ What's Included

### 🔄 CI/CD Pipeline (GitHub Actions)
- ✅ Automated testing on every push/PR (lint, type check, build)
- ✅ Automated deployment to production on `main` branch
- ✅ Zero-downtime deployment strategy
- ✅ Database migration automation
- ✅ Health checks after deployment

### 🐳 Production Infrastructure
- ✅ Multi-container Docker setup (backend, frontend, PostgreSQL, nginx)
- ✅ Reverse proxy with rate limiting & WebSocket support
- ✅ SSL/TLS ready (Let's Encrypt compatible)
- ✅ Health checks for all services
- ✅ Volume persistence for database
- ✅ Security best practices implemented

### 📚 Comprehensive Documentation
- ✅ Step-by-step deployment guide
- ✅ Quick deployment script
- ✅ Environment variables template
- ✅ Troubleshooting guide
- ✅ Architecture documentation

## 🚀 Quick Start

### 1. Configure Environment
```bash
cp .env.example .env
nano .env  # Fill in your API keys and domain
```

### 2. Deploy
```bash
chmod +x deploy.sh
./deploy.sh deploy
```

### 3. Verify
```bash
curl https://your-domain.com/health
```

**That's it!** 🎉

## 📦 Files Created

| Category | Files | Purpose |
|----------|-------|---------|
| **GitHub Actions** | `ci.yml`, `deploy.yml` | Automated CI/CD pipeline |
| **Docker** | Backend/Frontend Dockerfiles, docker-compose | Container orchestration |
| **Infrastructure** | `nginx.conf`, `deploy.sh` | Reverse proxy & deployment |
| **Configuration** | `.env.example` | Environment variables (50+) |
| **Documentation** | 3 comprehensive guides | Complete deployment docs |

**Total:** 15 new files, ~54 KB of configuration

## 🏗️ Architecture

```
Internet → Nginx (:80, :443)
    ├── /api/* → Backend (Fastify :3000)
    │   └── PostgreSQL :5432
    └── /* → Frontend (React SPA)
```

**Stack:**
- Backend: Fastify + Prisma + OpenAI + Gemini + Twilio + ElevenLabs
- Frontend: React + Vite + Tailwind CSS
- Database: PostgreSQL 16
- Infrastructure: Docker + Nginx

## 🔧 Available Commands

```bash
./deploy.sh deploy      # Full deployment
./deploy.sh update      # Update (zero-downtime)
./deploy.sh restart     # Restart all services
./deploy.sh logs        # View logs
./deploy.sh status      # Check service status
./deploy.sh backup      # Backup database
./deploy.sh stop        # Stop all services
```

## 🔐 Security Features

- ✅ Non-root users in containers
- ✅ Multi-stage Docker builds (minimal images)
- ✅ Security headers (CSP, X-Frame-Options, etc.)
- ✅ Rate limiting (10 req/s API, 30 req/s general)
- ✅ CORS configuration
- ✅ JWT authentication ready
- ✅ Environment-based secrets

## 📊 CI/CD Pipeline

### On Every Push/PR
1. **Backend**: Install deps → Generate Prisma → Type check → Test
2. **Frontend**: Install deps → Lint → Type check → Build
3. **Integration**: Verify all checks passed

### On Push to Main
1. Build Docker images (backend + frontend)
2. SSH to VPS
3. Pull latest code
4. Run database migrations
5. Deploy with zero-downtime
6. Health check verification

**Required GitHub Secrets:**
- `VPS_HOST`, `VPS_USERNAME`, `VPS_SSH_KEY`
- `VPS_PROJECT_PATH`, `VPS_URL`

## 📋 Prerequisites

### VPS Requirements
- **OS**: Ubuntu 22.04+ (recommended)
- **CPU**: 2+ cores (4+ recommended)
- **RAM**: 4GB minimum (8GB+ recommended)
- **Storage**: 20GB minimum (50GB+ recommended)

### Required API Keys
- OpenAI API key (GPT-4)
- Google Gemini API key
- Twilio Account (SID, Auth Token, Phone Number)
- ElevenLabs API key
- Domain name with DNS access

## 🎯 Next Steps

1. **Review Configuration**
   - Read [DEPLOYMENT.md](./DEPLOYMENT.md)
   - Check `.env.example` for required variables

2. **Setup GitHub Actions**
   - Add required secrets to repository
   - Push code to trigger CI pipeline

3. **Deploy to VPS**
   - Provision server (Ubuntu 22.04+)
   - Install Docker & Docker Compose
   - Configure domain & SSL
   - Run deployment script

4. **Monitor**
   - Check service status: `./deploy.sh status`
   - View logs: `./deploy.sh logs`
   - Setup automated backups

## 📚 Documentation

### Main Guides
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** (16 KB)
  - Complete production deployment guide
  - Prerequisites & server setup
  - Environment configuration
  - Database setup
  - SSL/TLS configuration
  - CI/CD setup
  - Monitoring & maintenance
  - Troubleshooting

- **[DEPLOYMENT_QUICKSTART.md](./DEPLOYMENT_QUICKSTART.md)** (2 KB)
  - Quick 3-step deployment
  - Common commands
  - Troubleshooting tips

### Technical Documentation
- **[CI_CD_SETUP_COMPLETE.md](./CI_CD_SETUP_COMPLETE.md)** (9 KB)
  - Architecture overview
  - CI/CD pipeline details
  - Security features
  - Technology stack

- **[PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)** (9 KB)
  - Complete file structure
  - Key files explained
  - Service architecture
  - Quick commands

### Configuration
- **[.env.example](./.env.example)** (4 KB)
  - All environment variables documented
  - Security notes & generation commands
  - Optional configurations

## 🐛 Troubleshooting

### Service won't start?
```bash
docker compose -f docker-compose.prod.yml logs backend
docker compose -f docker-compose.prod.yml restart
```

### Database connection issues?
```bash
docker compose -f docker-compose.prod.yml ps postgres
docker compose -f docker-compose.prod.yml run --rm backend npm run db:migrate
```

### SSL certificate issues?
```bash
sudo certbot renew --force-renewal
ls -la ssl/
```

**More troubleshooting:** See [DEPLOYMENT.md](./DEPLOYMENT.md#troubleshooting)

## ✅ Verification Checklist

- [x] CI workflow configured
- [x] CD workflow configured
- [x] Backend Dockerfile created
- [x] Frontend Dockerfile created
- [x] Docker Compose configured
- [x] Nginx reverse proxy configured
- [x] Environment variables documented
- [x] Deployment script created
- [x] Health checks configured
- [x] Security best practices implemented
- [x] Documentation complete

## 🎉 Status

**Ready for Production Deployment!**

All files have been created and verified. The repository now has:
- ✅ Complete CI/CD pipeline
- ✅ Production-ready Docker configuration
- ✅ Comprehensive deployment documentation
- ✅ Quick deployment tools
- ✅ Security best practices

## 📞 Support

- **GitHub Issues**: https://github.com/farisRajhi/ai-agent/issues
- **Documentation**: See guides listed above

---

**Last Updated**: 2026-02-17  
**Version**: 1.0.0  
**Repository**: https://github.com/farisRajhi/ai-agent  
**Project**: Namaa (نماء) AI Medical Receptionist
