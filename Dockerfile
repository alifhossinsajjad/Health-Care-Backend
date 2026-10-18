# ==============================================================================
# Production Dockerfile for Healthcare Backend (Node.js + TypeScript + Prisma)
# ==============================================================================

# 1. Base Image: Lightweight Node.js 22 on Alpine Linux
FROM node:22-alpine

# 2. Install essential system dependencies (openssl & libc6-compat are required for Prisma Engine on Alpine)
RUN apk add --no-cache openssl libc6-compat

# 3. Set Working Directory inside the container
WORKDIR /app

# 4. Copy dependency and Prisma schema manifests first (Leverages Docker Layer Caching)
COPY package*.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma/

# 5. Install dependencies and generate Prisma Client (Generated to ./generated/prisma)
RUN npm install --legacy-peer-deps
RUN npx prisma generate

# 6. Copy remaining application source code & view templates
COPY . .

# 7. Configure runtime environment
ENV PORT=5000
ENV NODE_ENV=production

# 8. Expose the application port
EXPOSE 5000

# 9. Start the server using tsx (Fast, reliable execution preserving ESM paths & EJS templates)
CMD ["npx", "tsx", "src/server.ts"]
