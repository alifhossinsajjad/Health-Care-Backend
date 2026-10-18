# ==============================================================================
# Enterprise Multi-Stage Production Dockerfile (HIPAA & SOC2 Compliant)
# Healthcare Telemedicine Backend Architecture
# ==============================================================================

# ----------------- STAGE 1: Dependency Resolver & Cache -----------------
FROM node:22-alpine AS deps
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

# Copy dependency manifests and Prisma configuration
COPY package*.json prisma.config.ts ./
COPY prisma ./prisma/

# Clean installation of dependencies and Prisma Client generation
RUN npm install --legacy-peer-deps
RUN npx prisma generate

# ----------------- STAGE 2: Production Runner (Non-Root & Secure) -----------------
FROM node:22-alpine AS runner

# Install essential runtime utilities:
# - openssl & libc6-compat: Required by Prisma Engine on Alpine Linux
# - tini: Lightweight init system to properly handle Linux signals (SIGTERM/SIGINT) for PID 1
# - wget: Used for automated container healthcheck probes
RUN apk add --no-cache openssl libc6-compat tini wget

WORKDIR /app

# Enterprise Security Rule: Run as unprivileged non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 -G nodejs nodejs

# Copy dependencies and generated artifacts with non-root ownership (Instant, zero runtime delay)
COPY --chown=nodejs:nodejs --from=deps /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs --from=deps /app/generated ./generated
COPY --chown=nodejs:nodejs --from=deps /app/package*.json ./
COPY --chown=nodejs:nodejs --from=deps /app/prisma.config.ts ./
COPY --chown=nodejs:nodejs --from=deps /app/prisma ./prisma

# Copy application source code and TypeScript configuration with non-root ownership
COPY --chown=nodejs:nodejs src ./src
COPY --chown=nodejs:nodejs tsconfig.json ./

# Switch to non-root user
USER nodejs

# Configure production environment variables
ENV PORT=5000
ENV NODE_ENV=production

EXPOSE 5000

# Automated Container Healthcheck probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

# Start container with tini init process for clean graceful shutdown
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npx", "tsx", "src/server.ts"]
