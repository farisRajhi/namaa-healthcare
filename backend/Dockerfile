# ============================================
# Stage 1: Install dependencies
# ============================================
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci

# ============================================
# Stage 2: Build TypeScript
# ============================================
FROM node:20-alpine AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/package-lock.json ./package-lock.json
COPY --from=deps /app/prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ============================================
# Stage 3: Production image
# ============================================
FROM node:20-alpine AS production

RUN apk add --no-cache dumb-init curl

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force

# Copy compiled output from build stage
COPY --from=build /app/dist ./dist

# Copy public assets if needed
COPY public ./public

# Create non-root user
RUN addgroup -g 1001 -S namaa && \
    adduser -S namaa -u 1001 -G namaa

RUN chown -R namaa:namaa /app
USER namaa

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
