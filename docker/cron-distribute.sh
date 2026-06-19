#!/bin/sh
set -e
curl -fsS \
  -H "x-cron-secret: ${CRON_SECRET}" \
  "http://app:3000/api/cron/distribute" \
  || echo "distribute cron failed at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
