# ── Build stage: install dependencies ──
# Build context must be the monorepo root (package-lock.json lives there)
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy monorepo root manifests first (for npm workspaces)
COPY package.json package-lock.json ./
# Copy workspace package.json files so npm ci can resolve them
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
RUN npm ci

# ── Build stage: compile Next.js app ──
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client (must run from apps/web where prisma/ lives)
RUN cd apps/web && npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1
RUN cd apps/web && npm run build

# ── Production runner ──
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]