#!/usr/bin/env bash
# Plain docker-compose deploy of gta6fund.xyz (run from repo root, after .env is configured).
# This path restarts the site on every update. For zero-downtime updates use Dokploy: docs/DOKPLOY.md
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "Missing .env — copy .env.example and fill in secrets first."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not found. Run: sudo bash deploy/install-docker.sh"
  exit 1
fi

docker compose up -d --build

echo ""
echo "Deployment started. Check status:"
echo "  docker compose ps"
echo "  docker compose logs -f app"
echo ""
echo "Site: https://gta6fund.xyz (after DNS points to this server)"
