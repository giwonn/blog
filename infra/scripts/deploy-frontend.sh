#!/bin/bash
# Blue-green deploy for the blog + admin frontend stacks.
# Run from the monorepo root: bash infra/scripts/deploy-frontend.sh
set -e

BLOG_COMPOSE="apps/blog/docker-compose.yml"
ADMIN_COMPOSE="apps/admin/docker-compose.yml"
NGINX_CONF="infra/nginx/default.conf"
LOCK_FILE="/tmp/giwon-blog-frontend-deploy.lock"

# Acquire deploy lock
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
    echo "Another frontend deployment is already running. Waiting..."
    flock 200
fi

# Release lock on exit
trap 'flock -u 200' EXIT

# Detect current active color (check blog side; admin mirrors it)
if docker ps --format '{{.Names}}' | grep -q "^blog-blue$"; then
    CURRENT="blue"
    NEXT="green"
else
    CURRENT="green"
    NEXT="blue"
fi

echo "Current: $CURRENT → Next: $NEXT"

# 1. Build new images
echo "Building new frontend images for $NEXT..."
docker compose -f "$BLOG_COMPOSE" build "blog-${NEXT}"
docker compose -f "$ADMIN_COMPOSE" build "admin-${NEXT}"

# 2. Start new containers
echo "Starting $NEXT frontend containers..."
docker compose -f "$BLOG_COMPOSE" up -d --remove-orphans "blog-${NEXT}"
docker compose -f "$ADMIN_COMPOSE" up -d --remove-orphans "admin-${NEXT}"

# 3. Wait for containers to be running + HTTP ready (60s max, 2s steps)
echo "Waiting for frontend containers to be ready..."
DEADLINE=$((SECONDS + 60))
BLOG_READY=false
ADMIN_READY=false

while [ "$SECONDS" -lt "$DEADLINE" ]; do
    BLOG_STATUS=$(docker inspect --format='{{.State.Status}}' "blog-${NEXT}" 2>/dev/null || echo "missing")
    ADMIN_STATUS=$(docker inspect --format='{{.State.Status}}' "admin-${NEXT}" 2>/dev/null || echo "missing")

    if [ "$BLOG_STATUS" = "running" ]; then
        if docker exec "blog-${NEXT}" wget -q --spider http://localhost:3000/ 2>/dev/null; then
            BLOG_READY=true
        fi
    fi

    if [ "$ADMIN_STATUS" = "running" ]; then
        if docker exec "admin-${NEXT}" wget -q --spider http://localhost:3000/ 2>/dev/null; then
            ADMIN_READY=true
        fi
    fi

    if [ "$BLOG_READY" = "true" ] && [ "$ADMIN_READY" = "true" ]; then
        echo "Both frontend containers are ready!"
        break
    fi

    echo "  Waiting... (blog=$BLOG_STATUS/ready=$BLOG_READY, admin=$ADMIN_STATUS/ready=$ADMIN_READY)"
    sleep 2
done

if [ "$BLOG_READY" != "true" ] || [ "$ADMIN_READY" != "true" ]; then
    echo "Frontend readiness timeout! Rolling back $NEXT containers..."
    echo "=== blog-${NEXT} logs ==="
    docker logs --tail 200 "blog-${NEXT}" 2>&1 || true
    echo "=== admin-${NEXT} logs ==="
    docker logs --tail 200 "admin-${NEXT}" 2>&1 || true
    docker compose -f "$BLOG_COMPOSE" stop "blog-${NEXT}"
    docker compose -f "$BLOG_COMPOSE" rm -f "blog-${NEXT}"
    docker compose -f "$ADMIN_COMPOSE" stop "admin-${NEXT}"
    docker compose -f "$ADMIN_COMPOSE" rm -f "admin-${NEXT}"
    exit 1
fi

# 4. Flip Nginx upstreams to new color.
# Use specific "server <name>:PORT" patterns to avoid matching api-blog-next-* lines.
echo "Switching Nginx upstream to $NEXT..."
sed -i \
    "s/server blog-${CURRENT}:3000/server blog-${NEXT}:3000/g; s/server admin-${CURRENT}:3000/server admin-${NEXT}:3000/g" \
    "$NGINX_CONF"
docker exec giwon-blog-reverse-proxy nginx -s reload

# 5. Stop and remove old containers
echo "Stopping $CURRENT frontend containers..."
docker compose -f "$BLOG_COMPOSE" stop "blog-${CURRENT}"
docker compose -f "$BLOG_COMPOSE" rm -f "blog-${CURRENT}"
docker compose -f "$ADMIN_COMPOSE" stop "admin-${CURRENT}"
docker compose -f "$ADMIN_COMPOSE" rm -f "admin-${CURRENT}"

# 6. Clean up dangling images
docker image prune -f

echo "Deploy complete! Active frontend color: $NEXT"
