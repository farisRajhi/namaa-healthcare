#!/bin/bash

# ============================================
# Namaa Quick Deploy Script
# ============================================

set -e

echo "🚀 Namaa Deployment Script"
echo "=========================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
  echo -e "${RED}❌ Error: .env file not found${NC}"
  echo "Please copy .env.example to .env and configure it"
  echo "  cp .env.example .env"
  echo "  nano .env"
  exit 1
fi

echo -e "${GREEN}✓${NC} .env file found"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo -e "${RED}❌ Error: Docker is not running${NC}"
  exit 1
fi

echo -e "${GREEN}✓${NC} Docker is running"

# Parse command line arguments
ACTION=${1:-deploy}

case $ACTION in
  build)
    echo ""
    echo "🔨 Building Docker images..."
    docker compose -f docker-compose.prod.yml build
    echo -e "${GREEN}✓${NC} Build complete"
    ;;
    
  deploy)
    echo ""
    echo "📦 Deploying Namaa..."
    
    # Build images
    echo "Building images..."
    docker compose -f docker-compose.prod.yml build
    
    # Run migrations
    echo "Running database migrations..."
    docker compose -f docker-compose.prod.yml run --rm backend npm run db:migrate || true
    
    # Start services
    echo "Starting services..."
    docker compose -f docker-compose.prod.yml up -d
    
    # Wait for services to be ready
    echo "Waiting for services to start..."
    sleep 10
    
    # Health check
    echo "Running health check..."
    if curl -f http://localhost/health > /dev/null 2>&1; then
      echo -e "${GREEN}✓${NC} Health check passed"
    else
      echo -e "${YELLOW}⚠${NC} Health check failed, but services may still be starting"
    fi
    
    echo ""
    echo -e "${GREEN}🎉 Deployment complete!${NC}"
    echo ""
    echo "View logs:"
    echo "  docker compose -f docker-compose.prod.yml logs -f"
    echo ""
    echo "Check status:"
    echo "  docker compose -f docker-compose.prod.yml ps"
    ;;
    
  update)
    echo ""
    echo "🔄 Updating Namaa..."
    
    # Pull latest code
    git pull origin main
    
    # Rebuild images
    docker compose -f docker-compose.prod.yml build
    
    # Run migrations
    docker compose -f docker-compose.prod.yml run --rm backend npm run db:migrate || true
    
    # Zero-downtime restart
    docker compose -f docker-compose.prod.yml up -d --no-deps --build
    
    echo -e "${GREEN}✓${NC} Update complete"
    ;;
    
  restart)
    echo ""
    echo "🔄 Restarting services..."
    docker compose -f docker-compose.prod.yml restart
    echo -e "${GREEN}✓${NC} Services restarted"
    ;;
    
  stop)
    echo ""
    echo "🛑 Stopping services..."
    docker compose -f docker-compose.prod.yml down
    echo -e "${GREEN}✓${NC} Services stopped"
    ;;
    
  logs)
    docker compose -f docker-compose.prod.yml logs -f
    ;;
    
  status)
    echo ""
    echo "📊 Service Status:"
    docker compose -f docker-compose.prod.yml ps
    echo ""
    echo "💾 Disk Usage:"
    docker system df
    ;;
    
  backup)
    echo ""
    echo "💾 Creating database backup..."
    mkdir -p backups
    BACKUP_FILE="backups/backup-$(date +%Y%m%d-%H%M%S).sql.gz"
    docker compose -f docker-compose.prod.yml exec postgres pg_dump -U app hospital_booking | gzip > $BACKUP_FILE
    echo -e "${GREEN}✓${NC} Backup created: $BACKUP_FILE"
    ;;
    
  *)
    echo "Usage: $0 {build|deploy|update|restart|stop|logs|status|backup}"
    echo ""
    echo "Commands:"
    echo "  build   - Build Docker images"
    echo "  deploy  - Full deployment (build + migrate + start)"
    echo "  update  - Pull code and update deployment"
    echo "  restart - Restart all services"
    echo "  stop    - Stop all services"
    echo "  logs    - View logs (follow mode)"
    echo "  status  - Show service status and disk usage"
    echo "  backup  - Backup database"
    exit 1
    ;;
esac
