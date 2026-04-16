#!/bin/bash
# Rolling deploy for the Hono API stack.
# Run from the monorepo root: bash infra/scripts/deploy-api.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE="$REPO_ROOT/apps/api/docker-compose.prod.yml"

cleanup() {
    echo "Cleaning up Docker resources..."
    docker image prune -a -f 2>/dev/null || true
    docker builder prune -a -f 2>/dev/null || true
}
trap cleanup EXIT

echo "Building new images..."
docker compose -f "$COMPOSE" build api-blog api-admin

echo "Rolling deploy api-blog..."
docker compose -f "$COMPOSE" up -d --no-recreate --scale api-blog=2
sleep 10
docker compose -f "$COMPOSE" up -d --scale api-blog=1

echo "Rolling deploy api-admin..."
docker compose -f "$COMPOSE" up -d --no-recreate --scale api-admin=2
sleep 10
docker compose -f "$COMPOSE" up -d --scale api-admin=1

echo "Deploy complete!"
