#!/bin/bash
set -e

COMPOSE_FILE="docker-compose.yml"
NGINX_CONF="nginx/default.conf"
LOCK_FILE="/tmp/giwon-blog-deploy.lock"

# 배포 락 획득
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
    echo "Another deployment is already running. Waiting..."
    flock 200
fi

# 종료 시 락 해제
trap 'flock -u 200' EXIT

# 현재 활성 색상 확인
if docker ps --format '{{.Names}}' | grep -q "api-blog-blue"; then
    CURRENT="blue"
    NEXT="green"
else
    CURRENT="green"
    NEXT="blue"
fi

echo "Current: $CURRENT → Next: $NEXT"

# 1. 새 이미지 빌드
echo "Building new images..."
docker compose -f $COMPOSE_FILE build api-blog-${NEXT} api-admin-${NEXT}

# 2. 새 컨테이너 띄우기
echo "Starting $NEXT containers..."
docker compose -f $COMPOSE_FILE up -d --remove-orphans api-blog-${NEXT} api-admin-${NEXT}

# 3. Health check 대기
echo "Waiting for health check..."
for i in $(seq 1 30); do
    BLOG_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' api-blog-${NEXT} 2>/dev/null || echo "starting")
    ADMIN_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' api-admin-${NEXT} 2>/dev/null || echo "starting")

    if [ "$BLOG_HEALTH" = "healthy" ] && [ "$ADMIN_HEALTH" = "healthy" ]; then
        echo "Both containers are healthy!"
        break
    fi

    if [ $i -eq 30 ]; then
        echo "Health check timeout! Rolling back..."
        echo "=== api-blog-${NEXT} logs ==="
        docker logs --tail 200 api-blog-${NEXT} 2>&1 || true
        echo "=== api-admin-${NEXT} logs ==="
        docker logs --tail 200 api-admin-${NEXT} 2>&1 || true
        docker compose -f $COMPOSE_FILE stop api-blog-${NEXT} api-admin-${NEXT}
        docker compose -f $COMPOSE_FILE rm -f api-blog-${NEXT} api-admin-${NEXT}
        exit 1
    fi

    echo "  Waiting... (blog=$BLOG_HEALTH, admin=$ADMIN_HEALTH)"
    sleep 5
done

# 4. Nginx upstream 전환 (디렉토리 마운트라 sed -i 가능)
echo "Switching Nginx upstream to $NEXT..."
sed -i "s/api-blog-${CURRENT}/api-blog-${NEXT}/g; s/api-admin-${CURRENT}/api-admin-${NEXT}/g" $NGINX_CONF
docker exec giwon-blog-api-nginx nginx -s reload

# 5. 이전 컨테이너 제거
echo "Stopping $CURRENT containers..."
docker compose -f $COMPOSE_FILE stop api-blog-${CURRENT} api-admin-${CURRENT}
docker compose -f $COMPOSE_FILE rm -f api-blog-${CURRENT} api-admin-${CURRENT}

# 6. 정리
docker image prune -f

echo "Deploy complete! Active: $NEXT"
