#!/bin/bash
# Blue-green deploy for the Hono API stack.
# Run from the monorepo root: bash infra/scripts/deploy-api.sh
set -e

COMPOSE="apps/api/docker-compose.prod.yml"
NGINX_CONF="infra/nginx/default.conf"
LOCK_FILE="/tmp/giwon-blog-api-deploy.lock"

# Acquire deploy lock
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
    echo "Another API deployment is already running. Waiting..."
    flock 200
fi

# Release lock on exit
trap 'flock -u 200' EXIT

# Detect current active color
if docker ps --format '{{.Names}}' | grep -q "api-blog-blue"; then
    CURRENT="blue"
    NEXT="green"
else
    CURRENT="green"
    NEXT="blue"
fi

echo "Current: $CURRENT → Next: $NEXT"

# 1. Build new images
echo "Building new images for $NEXT..."
if [ "$NEXT" = "green" ]; then
    docker compose -f "$COMPOSE" --profile green build api-blog-green api-admin-green
else
    docker compose -f "$COMPOSE" build api-blog-blue api-admin-blue
fi

# 2. Start new containers
echo "Starting $NEXT containers..."
if [ "$NEXT" = "green" ]; then
    docker compose -f "$COMPOSE" --profile green up -d  api-blog-green api-admin-green
else
    docker compose -f "$COMPOSE" up -d  api-blog-blue api-admin-blue
fi

# 3. Wait for health checks (30 × 5s = 150s max)
echo "Waiting for health checks..."
for i in $(seq 1 30); do
    BLOG_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' "api-blog-${NEXT}" 2>/dev/null || echo "starting")
    ADMIN_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' "api-admin-${NEXT}" 2>/dev/null || echo "starting")

    if [ "$BLOG_HEALTH" = "healthy" ] && [ "$ADMIN_HEALTH" = "healthy" ]; then
        echo "Both API containers are healthy!"
        break
    fi

    if [ "$i" -eq 30 ]; then
        echo "Health check timeout! Rolling back $NEXT containers..."
        echo "=== api-blog-${NEXT} logs ==="
        docker logs --tail 200 "api-blog-${NEXT}" 2>&1 || true
        echo "=== api-admin-${NEXT} logs ==="
        docker logs --tail 200 "api-admin-${NEXT}" 2>&1 || true
        if [ "$NEXT" = "green" ]; then
            docker compose -f "$COMPOSE" --profile green stop "api-blog-${NEXT}" "api-admin-${NEXT}"
            docker compose -f "$COMPOSE" --profile green rm -f "api-blog-${NEXT}" "api-admin-${NEXT}"
        else
            docker compose -f "$COMPOSE" stop "api-blog-${NEXT}" "api-admin-${NEXT}"
            docker compose -f "$COMPOSE" rm -f "api-blog-${NEXT}" "api-admin-${NEXT}"
        fi
        exit 1
    fi

    echo "  Waiting... attempt $i/30 (blog=$BLOG_HEALTH, admin=$ADMIN_HEALTH)"
    sleep 5
done

# 4. Flip Nginx upstream to new color
echo "Switching Nginx upstream to $NEXT..."
sed -i "s/api-blog-${CURRENT}/api-blog-${NEXT}/g; s/api-admin-${CURRENT}/api-admin-${NEXT}/g" "$NGINX_CONF"
docker exec giwon-blog-reverse-proxy nginx -s reload

# 5. Stop and remove old containers
echo "Stopping $CURRENT containers..."
if [ "$CURRENT" = "green" ]; then
    docker compose -f "$COMPOSE" --profile green stop "api-blog-${CURRENT}" "api-admin-${CURRENT}"
    docker compose -f "$COMPOSE" --profile green rm -f "api-blog-${CURRENT}" "api-admin-${CURRENT}"
else
    docker compose -f "$COMPOSE" stop "api-blog-${CURRENT}" "api-admin-${CURRENT}"
    docker compose -f "$COMPOSE" rm -f "api-blog-${CURRENT}" "api-admin-${CURRENT}"
fi

# 6. Clean up unused images and build cache
docker image prune -a -f
docker builder prune -a -f

echo "Deploy complete! Active API color: $NEXT"
