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
    echo "[$SERVICE] Cleaning up unused images..."
    docker image prune -f 2>/dev/null || true
}
trap cleanup EXIT

wait_healthy() {
    local NEW_ID
    NEW_ID=$(docker compose -f "$COMPOSE" ps -q "$SERVICE" | tail -1)
    echo "[$SERVICE] Waiting for container to become healthy..."
    local i=0
    while [ $i -lt 30 ]; do
        local status
        status=$(docker inspect --format='{{.State.Health.Status}}' "$NEW_ID" 2>/dev/null || echo "unknown")
        if [ "$status" = "healthy" ]; then
            echo "[$SERVICE] Container is healthy"
            return 0
        fi
        sleep 2
        i=$((i + 1))
    done
    echo "[$SERVICE] WARNING: Container did not become healthy in time"
    return 1
}

echo "[$SERVICE] Building new image..."
docker compose -f "$COMPOSE" build "$SERVICE"

echo "[$SERVICE] Rolling deploy..."
docker compose -f "$COMPOSE" up -d --no-recreate --scale "$SERVICE"=2
wait_healthy
docker compose -f "$COMPOSE" up -d --scale "$SERVICE"=1

echo "[$SERVICE] Deploy complete!"
