#!/bin/bash
# Blue-green deploy for a single frontend service (blog or admin).
# Usage: bash infra/scripts/deploy-frontend.sh <blog|admin>
# Run from the monorepo root.
set -e

SERVICE="${1:?Usage: deploy-frontend.sh <blog|admin>}"

case "$SERVICE" in
  blog)
    COMPOSE="apps/blog/docker-compose.yml"
    CONTAINER_PREFIX="blog"
    UPSTREAM_PATTERN="server blog-"
    PORT=3000
    ;;
  admin)
    COMPOSE="apps/admin/docker-compose.yml"
    CONTAINER_PREFIX="admin"
    UPSTREAM_PATTERN="server admin-"
    PORT=3000
    ;;
  *)
    echo "Unknown service: $SERVICE. Use 'blog' or 'admin'."
    exit 1
    ;;
esac

NGINX_CONF="infra/nginx/default.conf"
LOCK_FILE="/tmp/giwon-blog-${SERVICE}-deploy.lock"

exec 200>"$LOCK_FILE"
if ! flock -n 200; then
    echo "Another $SERVICE deployment is already running. Waiting..."
    flock 200
fi
trap 'flock -u 200' EXIT

if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_PREFIX}-blue$"; then
    CURRENT="blue"
    NEXT="green"
else
    CURRENT="green"
    NEXT="blue"
fi

echo "[$SERVICE] Current: $CURRENT → Next: $NEXT"

echo "[$SERVICE] Building ${CONTAINER_PREFIX}-${NEXT}..."
docker compose -f "$COMPOSE" build "${CONTAINER_PREFIX}-${NEXT}"

echo "[$SERVICE] Starting ${CONTAINER_PREFIX}-${NEXT}..."
docker compose -f "$COMPOSE" up -d  "${CONTAINER_PREFIX}-${NEXT}"

echo "[$SERVICE] Waiting for container to be ready..."
DEADLINE=$((SECONDS + 60))
READY=false

while [ "$SECONDS" -lt "$DEADLINE" ]; do
    STATUS=$(docker inspect --format='{{.State.Status}}' "${CONTAINER_PREFIX}-${NEXT}" 2>/dev/null || echo "missing")
    if [ "$STATUS" = "running" ]; then
        if docker exec "${CONTAINER_PREFIX}-${NEXT}" wget -q --spider "http://localhost:${PORT}/" 2>/dev/null; then
            READY=true
            echo "[$SERVICE] ${CONTAINER_PREFIX}-${NEXT} is ready!"
            break
        fi
    fi
    echo "  Waiting... (status=$STATUS)"
    sleep 2
done

if [ "$READY" != "true" ]; then
    echo "[$SERVICE] Readiness timeout! Rolling back..."
    docker logs --tail 200 "${CONTAINER_PREFIX}-${NEXT}" 2>&1 || true
    docker compose -f "$COMPOSE" stop "${CONTAINER_PREFIX}-${NEXT}"
    docker compose -f "$COMPOSE" rm -f "${CONTAINER_PREFIX}-${NEXT}"
    exit 1
fi

echo "[$SERVICE] Switching Nginx upstream to $NEXT..."
sed -i "s/${UPSTREAM_PATTERN}${CURRENT}:${PORT}/${UPSTREAM_PATTERN}${NEXT}:${PORT}/g" "$NGINX_CONF"
docker exec giwon-blog-reverse-proxy nginx -s reload

echo "[$SERVICE] Stopping ${CONTAINER_PREFIX}-${CURRENT}..."
docker compose -f "$COMPOSE" stop "${CONTAINER_PREFIX}-${CURRENT}"
docker compose -f "$COMPOSE" rm -f "${CONTAINER_PREFIX}-${CURRENT}"

docker image prune -a -f
docker builder prune -a -f

echo "[$SERVICE] Deploy complete! Active: ${CONTAINER_PREFIX}-${NEXT}"
