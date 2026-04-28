# ============================================
# Tawafud Backend Dockerfile
# Multi-stage build for production deployment
# ============================================

# ────────────────────────────────────────────
# Stage 1: Build
# ────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Prisma needs openssl on Alpine (musl) to load the schema engine.
RUN apk add --no-cache openssl

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma Client
RUN npm run db:generate

# Build TypeScript
RUN npm run build

# ────────────────────────────────────────────
# Stage 2: Production
# ────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Install dumb-init for signal handling and openssl for Prisma on musl.
RUN apk add --no-cache dumb-init openssl

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Generate Prisma Client for production
RUN npx prisma generate

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/server.js"]
