#!/bin/bash
# Rolling deploy for the Hono API stack.
# Run from the monorepo root: bash infra/scripts/deploy-api.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE="$REPO_ROOT/apps/api/docker-compose.prod.yml"

cleanup() {
    echo "Cleaning up unused images..."
    docker image prune -f 2>/dev/null || true
}
trap cleanup EXIT

wait_healthy() {
    local SERVICE="$1"
    local NEW_ID
    NEW_ID=$(docker compose -f "$COMPOSE" ps -q "$SERVICE" | tail -1)
    echo "Waiting for $SERVICE to become healthy..."
    local i=0
    while [ $i -lt 30 ]; do
        local status
        status=$(docker inspect --format='{{.State.Health.Status}}' "$NEW_ID" 2>/dev/null || echo "unknown")
        if [ "$status" = "healthy" ]; then
            echo "$SERVICE is healthy"
            return 0
        fi
        sleep 2
        i=$((i + 1))
    done
    echo "WARNING: $SERVICE did not become healthy in time"
    return 1
}

echo "Building new images..."
docker compose -f "$COMPOSE" build --parallel api-blog api-admin

echo "Rolling deploy api-blog..."
docker compose -f "$COMPOSE" up -d --no-recreate --scale api-blog=2
wait_healthy api-blog
docker compose -f "$COMPOSE" up -d --scale api-blog=1

echo "Rolling deploy api-admin..."
docker compose -f "$COMPOSE" up -d --no-recreate --scale api-admin=2
wait_healthy api-admin
docker compose -f "$COMPOSE" up -d --scale api-admin=1

echo "Deploy complete!"
