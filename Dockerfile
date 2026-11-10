# syntax=docker/dockerfile:1
# One Next.js server: the site, the API and the 5-minute worker. Dokploy runs it as a
# Swarm service and updates it start-first, so the new version is healthy and serving
# before the old one is stopped (docs/DOKPLOY.md).

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
# Skip postinstall (prisma generate): the schema isn't copied yet; the builder runs it.
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM base AS builder
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public

# Prisma + Next need a DATABASE_URL at build time (schema only; no real DB required)
ENV DATABASE_URL="file:/tmp/build.db"
# A new id per build: a browser still on the previous version reloads on its next
# navigation instead of mixing old and new code. Pass the commit as DEPLOYMENT_ID if
# you like; the build time is the fallback.
ARG DEPLOYMENT_ID
RUN ID="${DEPLOYMENT_ID:-$(date +%s)}" \
  && echo "$ID" > deployment-id \
  && NEXT_DEPLOYMENT_ID="$ID" npm run build \
  && rm -rf .next/cache \
  && mv .next/static static-build

FROM base AS runner
# NEXT_MANUAL_SIG_HANDLE: instrumentation.ts handles SIGTERM, so a stopping server
# finishes the job and requests in flight. WORKER_ENABLED: run the 5-minute worker in-app.
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL="file:/data/dev.db" \
    NEXT_MANUAL_SIG_HANDLE=true \
    WORKER_ENABLED=true

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs \
  # Full Prisma CLI with engines, for the schema sync at start
  && npm install -g prisma@6.19.3 --no-audit --no-fund

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/static-build ./static-build
COPY --from=builder /app/deployment-id ./deployment-id
COPY --from=builder /app/prisma ./prisma
COPY deploy/publish-static.mjs ./deploy/publish-static.mjs
COPY docker/entrypoint.sh /entrypoint.sh

# /data holds the SQLite database: mount a named volume there or it is lost on every update.
# .next/static is filled at start; a volume there keeps earlier builds' files for open pages.
RUN chmod +x /entrypoint.sh \
  && mkdir -p /data .next/static \
  && chown -R nextjs:nodejs /data .next/static

EXPOSE 3000

HEALTHCHECK --interval=5s --timeout=3s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

ENTRYPOINT ["/entrypoint.sh"]
