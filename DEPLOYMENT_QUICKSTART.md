# 🚀 Quick Start Deployment Guide

Simplified deployment guide for Tawafud AI Medical Receptionist.

## Prerequisites

- Ubuntu 22.04+ VPS with Docker & Docker Compose
- Domain name pointing to your server
- Required API keys (OpenAI, Gemini, Twilio, ElevenLabs)

## Quick Deploy (3 Steps)

### 1. Clone and Configure

```bash
# Clone repository
git clone https://github.com/farisRajhi/ai-agent.git /opt/tawafud
cd /opt/tawafud

# Configure environment
cp .env.example .env
nano .env  # Fill in your API keys and domain
```

### 2. Setup SSL (Let's Encrypt)

```bash
# Install Certbot
sudo apt install -y certbot

# Generate certificate
sudo certbot certonly --standalone -d your-domain.com

# Link certificates
mkdir -p ssl
sudo ln -sf /etc/letsencrypt/live/your-domain.com/fullchain.pem ssl/fullchain.pem
sudo ln -sf /etc/letsencrypt/live/your-domain.com/privkey.pem ssl/privkey.pem
```

### 3. Deploy

```bash
# Make deploy script executable
chmod +x deploy.sh

# Deploy!
./deploy.sh deploy
```

## Verify Deployment

```bash
# Check service status
./deploy.sh status

# View logs
./deploy.sh logs

# Test health endpoint
curl https://your-domain.com/health
```

## Common Commands

```bash
# Update deployment
./deploy.sh update

# Restart services
./deploy.sh restart

# Backup database
./deploy.sh backup

# Stop services
./deploy.sh stop
```

## Troubleshooting

### Services not starting?
```bash
# Check logs
docker compose -f docker-compose.prod.yml logs backend

# Verify .env configuration
grep -v "^#" .env | grep -v "^$"
```

### Database connection failed?
```bash
# Check database is running
docker compose -f docker-compose.prod.yml ps postgres

# Run migrations
docker compose -f docker-compose.prod.yml run --rm backend npm run db:migrate
```

### SSL certificate issues?
```bash
# Verify certificate files
ls -la ssl/

# Test certificate
openssl x509 -in ssl/fullchain.pem -text -noout
```

## Full Documentation

For complete deployment guide, see **[DEPLOYMENT.md](./DEPLOYMENT.md)**

## CI/CD Setup

See **[DEPLOYMENT.md](./DEPLOYMENT.md#cicd-setup)** for GitHub Actions configuration.

## Need Help?

- Full docs: [DEPLOYMENT.md](./DEPLOYMENT.md)
- GitHub Issues: https://github.com/farisRajhi/ai-agent/issues
