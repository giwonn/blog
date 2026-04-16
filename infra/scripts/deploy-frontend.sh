#!/bin/bash
# Rolling deploy for a single frontend service (blog or admin).
# Usage: bash infra/scripts/deploy-frontend.sh <blog|admin>
set -e

SERVICE="${1:?Usage: deploy-frontend.sh <blog|admin>}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

case "$SERVICE" in
  blog)  COMPOSE="$REPO_ROOT/apps/blog/docker-compose.yml" ;;
  admin) COMPOSE="$REPO_ROOT/apps/admin/docker-compose.yml" ;;
  *)     echo "Unknown service: $SERVICE"; exit 1 ;;
esac

cleanup() {
    echo "[$SERVICE] Cleaning up Docker resources..."
    docker image prune -a -f 2>/dev/null || true
    docker builder prune -f --keep-storage=2GB 2>/dev/null || true
}
trap cleanup EXIT

echo "[$SERVICE] Building new image..."
docker compose -f "$COMPOSE" build "$SERVICE"

echo "[$SERVICE] Rolling deploy..."
docker compose -f "$COMPOSE" up -d --no-recreate --scale "$SERVICE"=2
sleep 10
docker compose -f "$COMPOSE" up -d --scale "$SERVICE"=1

echo "[$SERVICE] Deploy complete!"
