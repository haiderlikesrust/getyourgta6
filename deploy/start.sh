#!/usr/bin/env bash
# Build and start getyourgta6.fun (run from repo root, after .env is configured).
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
echo "Site: https://getyourgta6.fun (after DNS points to this server)"
