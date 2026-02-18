# 🚀 Namaa (نماء) AI Medical Receptionist - Production Deployment Guide

Complete guide for deploying Namaa to any VPS with Docker.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Server Setup](#server-setup)
3. [Environment Configuration](#environment-configuration)
4. [Database Setup](#database-setup)
5. [SSL/TLS Configuration](#ssltls-configuration)
6. [Deployment](#deployment)
7. [CI/CD Setup](#cicd-setup)
8. [Monitoring & Maintenance](#monitoring--maintenance)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software on VPS
- **OS**: Ubuntu 22.04 LTS or later (recommended)
- **Docker**: 24.0+ 
- **Docker Compose**: 2.0+
- **Git**: 2.0+
- **Nginx** (optional if using external reverse proxy)

### Required Accounts & API Keys
- [x] OpenAI API key (for GPT-4)
- [x] Google Gemini API key (for voice)
- [x] Twilio Account (SID, Auth Token, Phone Number)
- [x] ElevenLabs API key (for TTS)
- [x] Domain name with DNS access
- [x] SSL certificate (Let's Encrypt recommended)

### Server Requirements
- **CPU**: 2+ cores (4+ recommended for production)
- **RAM**: 4GB minimum (8GB+ recommended)
- **Storage**: 20GB minimum (50GB+ for logs and media)
- **Network**: Static IP address

---

## Server Setup

### 1. Initial Server Configuration

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install essential tools
sudo apt install -y curl wget git htop ufw fail2ban

# Configure firewall
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### 2. Install Docker & Docker Compose

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add current user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose
sudo apt install -y docker-compose-plugin

# Verify installation
docker --version
docker compose version
```

### 3. Create Project Directory

```bash
# Create deployment directory
sudo mkdir -p /opt/namaa
sudo chown $USER:$USER /opt/namaa
cd /opt/namaa

# Clone repository
git clone https://github.com/farisRajhi/ai-agent.git .

# Or if using SSH
# git clone git@github.com:farisRajhi/ai-agent.git .
```

---

## Environment Configuration

### 1. Create Production Environment File

```bash
cd /opt/namaa
cp .env.example .env
nano .env  # or use vim, vi, etc.
```

### 2. Configure Required Variables

Edit `.env` and set all the following variables:

#### Database
```env
POSTGRES_USER=app
POSTGRES_PASSWORD=<generate-strong-password>
POSTGRES_DB=hospital_booking
POSTGRES_PORT=5432
```

**Generate secure password:**
```bash
openssl rand -base64 32
```

#### Security
```env
JWT_SECRET=<generate-jwt-secret>
WEBHOOK_API_KEY=<generate-webhook-key>
```

**Generate JWT secret:**
```bash
openssl rand -base64 64
```

**Generate webhook key:**
```bash
openssl rand -hex 32
```

#### API Keys
```env
OPENAI_API_KEY=sk-proj-...
GEMINI_API_KEY=AIzaSy...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+966...
ELEVENLABS_API_KEY=...
```

#### Domain Configuration
```env
BASE_URL=https://your-domain.com
VOICE_WS_URL=wss://your-domain.com/api/voice/stream
CORS_ORIGIN=https://your-domain.com,https://www.your-domain.com
```

#### Organization
```env
# Get this UUID from database after first deployment
DEFAULT_ORG_ID=<your-org-uuid>
```

### 3. Secure Environment File

```bash
# Restrict permissions
chmod 600 .env

# Verify it's not tracked by git
git status  # .env should not appear
```

---

## Database Setup

### 1. Start PostgreSQL

```bash
cd /opt/namaa
docker compose -f docker-compose.prod.yml up -d postgres
```

### 2. Wait for Database to be Ready

```bash
# Check database health
docker compose -f docker-compose.prod.yml ps postgres

# View logs
docker compose -f docker-compose.prod.yml logs -f postgres
```

### 3. Run Migrations

```bash
# Run Prisma migrations
docker compose -f docker-compose.prod.yml run --rm backend npm run db:migrate

# Verify migrations
docker compose -f docker-compose.prod.yml exec postgres psql -U app -d hospital_booking -c "\dt"
```

### 4. Seed Initial Data (Optional)

```bash
# If you have a seed file
docker compose -f docker-compose.prod.yml run --rm backend npm run db:seed
```

### 5. Get Organization UUID

```bash
# Query the database for your organization ID
docker compose -f docker-compose.prod.yml exec postgres psql -U app -d hospital_booking -c "SELECT id, name FROM organizations;"

# Copy the UUID and update .env
nano .env  # Set DEFAULT_ORG_ID=<uuid-from-above>
```

---

## SSL/TLS Configuration

### Option 1: Let's Encrypt (Recommended)

#### Install Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx

# Stop nginx if running
docker compose -f docker-compose.prod.yml stop nginx
```

#### Generate Certificates

```bash
# Replace with your domain
sudo certbot certonly --standalone -d your-domain.com -d www.your-domain.com

# Certificates will be in:
# /etc/letsencrypt/live/your-domain.com/fullchain.pem
# /etc/letsencrypt/live/your-domain.com/privkey.pem
```

#### Copy Certificates to Project

```bash
cd /opt/namaa
mkdir -p ssl

# Create symlinks (auto-renew friendly)
sudo ln -sf /etc/letsencrypt/live/your-domain.com/fullchain.pem ssl/fullchain.pem
sudo ln -sf /etc/letsencrypt/live/your-domain.com/privkey.pem ssl/privkey.pem

# Set permissions
sudo chown -R $USER:$USER ssl/
```

#### Update nginx.conf

Edit `/opt/namaa/nginx.conf` and uncomment the HTTPS section:

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # ... rest of configuration
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

#### Auto-Renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Crontab is auto-configured by certbot
# Verify with:
sudo systemctl status certbot.timer
```

### Option 2: Custom SSL Certificate

If you have your own certificates:

```bash
cd /opt/namaa
mkdir -p ssl
cp /path/to/your/fullchain.pem ssl/
cp /path/to/your/privkey.pem ssl/
chmod 600 ssl/*.pem
```

---

## Deployment

### 1. Build Docker Images

```bash
cd /opt/namaa

# Build all services
docker compose -f docker-compose.prod.yml build

# Or build individually
docker compose -f docker-compose.prod.yml build backend
docker compose -f docker-compose.prod.yml build frontend
```

### 2. Start All Services

```bash
# Start in detached mode
docker compose -f docker-compose.prod.yml up -d

# View logs
docker compose -f docker-compose.prod.yml logs -f

# Check service status
docker compose -f docker-compose.prod.yml ps
```

### 3. Verify Deployment

```bash
# Check health endpoints
curl http://localhost/health

# Check API
curl http://localhost/api/health

# View container logs
docker compose -f docker-compose.prod.yml logs backend
docker compose -f docker-compose.prod.yml logs frontend
docker compose -f docker-compose.prod.yml logs nginx
```

### 4. Test from External

```bash
# From another machine
curl https://your-domain.com/health
curl https://your-domain.com/api/health

# Test WebSocket (requires wscat: npm install -g wscat)
wscat -c wss://your-domain.com/api/voice/stream
```

---

## CI/CD Setup

### 1. GitHub Actions Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add the following secrets:

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `VPS_HOST` | Server IP or hostname | `203.0.113.1` |
| `VPS_USERNAME` | SSH username | `ubuntu` |
| `VPS_SSH_KEY` | Private SSH key | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `VPS_PORT` | SSH port (optional) | `22` |
| `VPS_PROJECT_PATH` | Deployment path | `/opt/namaa` |
| `VPS_URL` | Production URL | `https://your-domain.com` |
| `DOCKER_USERNAME` | Docker Hub username (optional) | - |
| `DOCKER_PASSWORD` | Docker Hub password (optional) | - |

### 2. Generate SSH Key for GitHub Actions

On your VPS:

```bash
# Generate deploy key
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_deploy

# Add public key to authorized_keys
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys

# Copy private key (paste this into VPS_SSH_KEY secret)
cat ~/.ssh/github_deploy
```

### 3. Enable GitHub Actions

The workflows are already configured in `.github/workflows/`:

- **ci.yml** - Runs on every push/PR (lint, type check, test)
- **deploy.yml** - Deploys to production on push to `main`

Verify workflows:
1. Go to repository → Actions
2. You should see "CI - Lint, Type Check & Test" and "Deploy to Production"

### 4. Test CI/CD Pipeline

```bash
# Make a small change and push
git checkout -b test-deployment
echo "# Test" >> README.md
git add README.md
git commit -m "test: CI/CD pipeline"
git push origin test-deployment

# Create PR and merge to main to trigger deployment
```

---

## Monitoring & Maintenance

### View Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f frontend
docker compose -f docker-compose.prod.yml logs -f postgres
docker compose -f docker-compose.prod.yml logs -f nginx

# Last 100 lines
docker compose -f docker-compose.prod.yml logs --tail=100 backend
```

### Resource Monitoring

```bash
# Container stats
docker stats

# Disk usage
df -h
docker system df

# Clean up unused images
docker image prune -a

# Clean up everything unused
docker system prune -a --volumes
```

### Database Backup

```bash
# Create backup directory
mkdir -p /opt/namaa/backups

# Backup database
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U app hospital_booking | gzip > /opt/namaa/backups/backup-$(date +%Y%m%d-%H%M%S).sql.gz

# Restore from backup
gunzip < /opt/namaa/backups/backup-YYYYMMDD-HHMMSS.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres psql -U app hospital_booking
```

### Automated Backups (Cron)

```bash
# Create backup script
cat > /opt/namaa/backup.sh << 'EOF'
#!/bin/bash
cd /opt/namaa
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U app hospital_booking | \
  gzip > /opt/namaa/backups/backup-$(date +%Y%m%d-%H%M%S).sql.gz

# Keep only last 7 days
find /opt/namaa/backups -name "backup-*.sql.gz" -mtime +7 -delete
EOF

chmod +x /opt/namaa/backup.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add this line:
# 0 2 * * * /opt/namaa/backup.sh >> /opt/namaa/backups/backup.log 2>&1
```

### Update Deployment

```bash
cd /opt/namaa

# Pull latest code
git pull origin main

# Rebuild and restart
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# Run migrations if schema changed
docker compose -f docker-compose.prod.yml run --rm backend npm run db:migrate
```

### Zero-Downtime Update

```bash
# Build new images
docker compose -f docker-compose.prod.yml build

# Update without downtime (rolling restart)
docker compose -f docker-compose.prod.yml up -d --no-deps --build backend
docker compose -f docker-compose.prod.yml up -d --no-deps --build frontend
```

### Health Checks

Create a monitoring script:

```bash
cat > /opt/namaa/healthcheck.sh << 'EOF'
#!/bin/bash
set -e

echo "Checking Namaa services..."

# Backend health
if curl -f http://localhost/api/health > /dev/null 2>&1; then
  echo "✅ Backend: OK"
else
  echo "❌ Backend: FAILED"
  exit 1
fi

# Frontend health
if curl -f http://localhost/ > /dev/null 2>&1; then
  echo "✅ Frontend: OK"
else
  echo "❌ Frontend: FAILED"
  exit 1
fi

# Database health
if docker compose -f /opt/namaa/docker-compose.prod.yml exec postgres pg_isready -U app > /dev/null 2>&1; then
  echo "✅ Database: OK"
else
  echo "❌ Database: FAILED"
  exit 1
fi

echo "✅ All services healthy!"
EOF

chmod +x /opt/namaa/healthcheck.sh
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check logs
docker compose -f docker-compose.prod.yml logs backend

# Check if ports are in use
sudo netstat -tulpn | grep -E ':(80|443|3000|5432)'

# Restart services
docker compose -f docker-compose.prod.yml restart

# Rebuild from scratch
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
```

### Database Connection Issues

```bash
# Check database is running
docker compose -f docker-compose.prod.yml ps postgres

# Test connection
docker compose -f docker-compose.prod.yml exec postgres psql -U app -d hospital_booking -c "SELECT 1;"

# Check DATABASE_URL in .env
grep DATABASE_URL .env

# Regenerate Prisma client
docker compose -f docker-compose.prod.yml run --rm backend npm run db:generate
```

### SSL Certificate Issues

```bash
# Verify certificates exist
ls -la /opt/namaa/ssl/

# Test certificate validity
openssl x509 -in /opt/namaa/ssl/fullchain.pem -text -noout

# Renew Let's Encrypt
sudo certbot renew --force-renewal

# Check nginx config
docker compose -f docker-compose.prod.yml exec nginx nginx -t
```

### High Memory Usage

```bash
# Check container memory
docker stats

# Restart services with memory limits
docker compose -f docker-compose.prod.yml down
# Edit docker-compose.prod.yml and add:
# deploy:
#   resources:
#     limits:
#       memory: 1G
docker compose -f docker-compose.prod.yml up -d
```

### API Errors

```bash
# Check backend logs
docker compose -f docker-compose.prod.yml logs -f backend

# Test API directly (bypass nginx)
docker compose -f docker-compose.prod.yml exec backend curl http://localhost:3000/health

# Restart backend
docker compose -f docker-compose.prod.yml restart backend
```

### Twilio Webhook Not Receiving Calls

```bash
# Verify webhook URL in Twilio console matches:
# https://your-domain.com/api/webhooks/twilio/voice

# Check nginx routing
docker compose -f docker-compose.prod.yml logs -f nginx

# Test webhook endpoint
curl -X POST https://your-domain.com/api/webhooks/twilio/voice \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=TEST"
```

### WebSocket Connection Issues

```bash
# Test WebSocket directly
wscat -c ws://localhost:3000/api/voice/stream

# Check nginx WebSocket config
docker compose -f docker-compose.prod.yml exec nginx cat /etc/nginx/conf.d/default.conf | grep -A 5 "location /api/voice/stream"

# View WebSocket logs
docker compose -f docker-compose.prod.yml logs -f backend | grep -i websocket
```

### Disk Space Full

```bash
# Check disk usage
df -h
docker system df

# Clean up Docker
docker system prune -a --volumes

# Clean old logs
sudo journalctl --vacuum-time=3d

# Remove old backups
find /opt/namaa/backups -name "*.sql.gz" -mtime +7 -delete
```

### Container Keeps Restarting

```bash
# Check container status
docker compose -f docker-compose.prod.yml ps

# View recent logs
docker compose -f docker-compose.prod.yml logs --tail=50 backend

# Check if health check is failing
docker inspect namaa-backend | grep -A 10 Health

# Disable health check temporarily
# Edit docker-compose.prod.yml and comment out healthcheck section
```

---

## Additional Resources

### Useful Commands

```bash
# View all containers
docker ps -a

# Stop all services
docker compose -f docker-compose.prod.yml down

# Remove everything (including volumes - DATA LOSS!)
docker compose -f docker-compose.prod.yml down -v

# Execute command in running container
docker compose -f docker-compose.prod.yml exec backend sh

# View environment variables
docker compose -f docker-compose.prod.yml exec backend env

# Restart single service
docker compose -f docker-compose.prod.yml restart backend
```

### Performance Tuning

Edit `docker-compose.prod.yml` to add resource limits:

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

### Security Checklist

- [ ] Firewall configured (UFW)
- [ ] Fail2ban installed and configured
- [ ] SSL certificates valid and auto-renewing
- [ ] Strong passwords for all services
- [ ] `.env` file has restricted permissions (600)
- [ ] Database not exposed to public internet
- [ ] Regular security updates (`apt update && apt upgrade`)
- [ ] Automated backups configured
- [ ] Monitoring and alerting set up

---

## Support

For issues or questions:
- GitHub Issues: https://github.com/farisRajhi/ai-agent/issues
- Documentation: Check `README.md` and other docs in the repository

---

**🎉 Deployment Complete! Your Namaa AI Medical Receptionist is now live!**
