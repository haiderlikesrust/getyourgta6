#!/bin/sh
set -e

cd /app

echo "Applying database schema..."
prisma db push --skip-generate --schema=./prisma/schema.prisma

chown -R nextjs:nodejs /data

echo "Starting Next.js on port ${PORT:-3000}..."
exec su -s /bin/sh nextjs -c "node server.js"
