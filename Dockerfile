# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
# Skip postinstall (prisma generate) — schema isn't copied yet; run in builder instead
RUN npm ci --ignore-scripts

FROM base AS builder
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public

# Prisma + Next need a DATABASE_URL at build time (schema only; no real DB required)
ENV DATABASE_URL="file:/tmp/build.db"
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL="file:/data/dev.db"

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Prisma schema for startup migrations (CLI installed globally below)
COPY --from=builder /app/prisma ./prisma

# Full Prisma CLI with engines (partial node_modules copy breaks .bin/prisma)
RUN npm install -g prisma@6.19.3

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
  && mkdir -p /data \
  && chown -R nextjs:nodejs /data

EXPOSE 3000
VOLUME ["/data"]

ENTRYPOINT ["/entrypoint.sh"]
