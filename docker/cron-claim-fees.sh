#!/bin/sh
set -e
curl -fsS \
  -H "x-cron-secret: ${CRON_SECRET}" \
  "http://app:3000/api/cron/claim-fees" \
  || echo "claim-fees cron failed at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
