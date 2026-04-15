#!/bin/bash
# Blue-green deploy for the Hono api-next stack.
# Run from the monorepo root: bash infra/scripts/deploy-api-next.sh
set -e

COMPOSE="apps/api-next/docker-compose.prod.yml"
NGINX_CONF="infra/nginx/default.conf"
LOCK_FILE="/tmp/giwon-blog-api-next-deploy.lock"

# Acquire deploy lock
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
    echo "Another api-next deployment is already running. Waiting..."
    flock 200
fi

# Release lock on exit
trap 'flock -u 200' EXIT

# Detect current active color
if docker ps --format '{{.Names}}' | grep -q "api-blog-next-blue"; then
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
    docker compose -f "$COMPOSE" --profile green build api-blog-next-green api-admin-next-green
else
    docker compose -f "$COMPOSE" build api-blog-next-blue api-admin-next-blue
fi

# 2. Start new containers
echo "Starting $NEXT containers..."
if [ "$NEXT" = "green" ]; then
    docker compose -f "$COMPOSE" --profile green up -d --remove-orphans api-blog-next-green api-admin-next-green
else
    docker compose -f "$COMPOSE" up -d --remove-orphans api-blog-next-blue api-admin-next-blue
fi

# 3. Wait for health checks (30 × 5s = 150s max)
echo "Waiting for health checks..."
for i in $(seq 1 30); do
    BLOG_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' "api-blog-next-${NEXT}" 2>/dev/null || echo "starting")
    ADMIN_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' "api-admin-next-${NEXT}" 2>/dev/null || echo "starting")

    if [ "$BLOG_HEALTH" = "healthy" ] && [ "$ADMIN_HEALTH" = "healthy" ]; then
        echo "Both api-next containers are healthy!"
        break
    fi

    if [ "$i" -eq 30 ]; then
        echo "Health check timeout! Rolling back $NEXT containers..."
        echo "=== api-blog-next-${NEXT} logs ==="
        docker logs --tail 200 "api-blog-next-${NEXT}" 2>&1 || true
        echo "=== api-admin-next-${NEXT} logs ==="
        docker logs --tail 200 "api-admin-next-${NEXT}" 2>&1 || true
        if [ "$NEXT" = "green" ]; then
            docker compose -f "$COMPOSE" --profile green stop "api-blog-next-${NEXT}" "api-admin-next-${NEXT}"
            docker compose -f "$COMPOSE" --profile green rm -f "api-blog-next-${NEXT}" "api-admin-next-${NEXT}"
        else
            docker compose -f "$COMPOSE" stop "api-blog-next-${NEXT}" "api-admin-next-${NEXT}"
            docker compose -f "$COMPOSE" rm -f "api-blog-next-${NEXT}" "api-admin-next-${NEXT}"
        fi
        exit 1
    fi

    echo "  Waiting... attempt $i/30 (blog=$BLOG_HEALTH, admin=$ADMIN_HEALTH)"
    sleep 5
done

# 4. Flip Nginx upstream to new color
echo "Switching Nginx upstream to $NEXT..."
sed -i "s/api-blog-next-${CURRENT}/api-blog-next-${NEXT}/g; s/api-admin-next-${CURRENT}/api-admin-next-${NEXT}/g" "$NGINX_CONF"
docker exec giwon-blog-reverse-proxy nginx -s reload

# 5. Stop and remove old containers
echo "Stopping $CURRENT containers..."
if [ "$CURRENT" = "green" ]; then
    docker compose -f "$COMPOSE" --profile green stop "api-blog-next-${CURRENT}" "api-admin-next-${CURRENT}"
    docker compose -f "$COMPOSE" --profile green rm -f "api-blog-next-${CURRENT}" "api-admin-next-${CURRENT}"
else
    docker compose -f "$COMPOSE" stop "api-blog-next-${CURRENT}" "api-admin-next-${CURRENT}"
    docker compose -f "$COMPOSE" rm -f "api-blog-next-${CURRENT}" "api-admin-next-${CURRENT}"
fi

# 6. Clean up dangling images
docker image prune -f

echo "Deploy complete! Active api-next color: $NEXT"
