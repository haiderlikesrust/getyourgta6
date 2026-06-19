#!/bin/sh
set -e

cd /app

echo "Applying database schema..."
./node_modules/.bin/prisma db push --skip-generate

echo "Starting Next.js on port ${PORT:-3000}..."
exec node server.js
