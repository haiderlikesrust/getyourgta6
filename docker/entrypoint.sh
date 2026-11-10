#!/bin/sh
# Container entrypoint. Syncs the database schema, publishes this build's static
# files, then runs Next as PID 1 (unprivileged) so it receives SIGTERM directly.
set -e

cd /app

if [ -f deployment-id ]; then
  NEXT_DEPLOYMENT_ID="$(cat deployment-id)"
  export NEXT_DEPLOYMENT_ID
fi

# Additive changes only: during an update the previous version is still serving
# from this same database. A change that would drop data fails here, the new
# container never becomes healthy, and the old one keeps running.
echo "Applying database schema..."
prisma db push --skip-generate --schema=./prisma/schema.prisma

node deploy/publish-static.mjs

chown -R nextjs:nodejs /data /app/.next/static

echo "Starting Next.js on port ${PORT:-3000} (build ${NEXT_DEPLOYMENT_ID:-unknown})..."
exec setpriv --reuid=nextjs --regid=nodejs --init-groups node server.js
