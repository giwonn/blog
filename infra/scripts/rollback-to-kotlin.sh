#!/bin/bash
# Emergency rollback: put the Kotlin stack back in front of traffic.
# Assumes the Kotlin containers are still stopped-but-present on disk
# (K2 does not remove them; K3 is where they get deleted).
#
# Run from the monorepo root: bash infra/scripts/rollback-to-kotlin.sh
set -e

echo "[rollback] Stopping the Hono api-next containers (ignore errors if already stopped)..."
docker compose -f apps/api/docker-compose.prod.yml stop \
    api-blog-blue api-admin-blue \
    api-blog-green api-admin-green 2>/dev/null || true
docker compose -f apps/api/docker-compose.prod.yml --profile green stop \
    api-blog-green api-admin-green 2>/dev/null || true

echo "[rollback] Stopping frontend containers (blue-green, ignore errors if already stopped)..."
docker compose -f apps/blog/docker-compose.yml stop blog-blue blog-green 2>/dev/null || true
docker compose -f apps/admin/docker-compose.yml stop admin-blue admin-green 2>/dev/null || true

echo "[rollback] Stopping new reverse-proxy (ignore errors if already stopped)..."
docker compose -f infra/nginx/docker-compose.yml stop reverse-proxy 2>/dev/null || true

echo "[rollback] Restarting Kotlin stack (nginx + api-blog-blue + api-admin-blue + postgres + redis)..."
docker compose -f apps/api/docker-compose.yml start nginx api-blog-blue api-admin-blue postgres redis

echo ""
echo "[rollback] ============================================================"
echo "[rollback] MANUAL STEP REQUIRED: frontend compose restoration"
echo "[rollback] ============================================================"
echo "[rollback] The apps/blog/docker-compose.yml and apps/admin/docker-compose.yml"
echo "[rollback] files were edited by K2 (Task 4). The original 'blog' / 'admin'"
echo "[rollback] service names no longer exist. You must restore them manually."
echo ""
echo "[rollback] To find the last pre-K2 commit:"
echo "    git log --oneline -- apps/blog/docker-compose.yml"
echo "    # Identify the commit SHA just before K2 changes (e.g. <pre-k2-sha>)"
echo ""
echo "[rollback] To restore the original compose files:"
echo "    git show <pre-k2-sha>:apps/blog/docker-compose.yml > apps/blog/docker-compose.yml"
echo "    git show <pre-k2-sha>:apps/admin/docker-compose.yml > apps/admin/docker-compose.yml"
echo ""
echo "[rollback] To bring the original frontend containers back up:"
echo "    docker compose -f apps/blog/docker-compose.yml up -d blog"
echo "    docker compose -f apps/admin/docker-compose.yml up -d admin"
echo ""
echo "[rollback] ============================================================"
echo "[rollback] DB ROLLBACK (only if dead-table-drop migration was applied):"
echo "[rollback] ============================================================"
echo "[rollback] If you applied the Drizzle migration that dropped dead tables"
echo "[rollback] and need to recreate them for the Kotlin stack, run:"
echo ""
echo "    # Connect to the Postgres container:"
echo "    docker exec -it postgres psql -U <DB_USER> -d <DB_NAME>"
echo ""
echo "    # Then execute:"
echo "    # CREATE TABLE article_stats (id SERIAL PRIMARY KEY);"
echo "    # CREATE TABLE daily_article_stats (id SERIAL PRIMARY KEY);"
echo "    # DELETE FROM drizzle.__drizzle_migrations WHERE hash IN ('<baseline-hash>', '<drop-hash>');"
echo ""
echo "    # Note: Flyway (Kotlin stack) is unaffected — it does not read these tables."
echo ""
echo "[rollback] ============================================================"
echo "[rollback] Verification curls (run after all services are up):"
echo "[rollback] ============================================================"
echo "    curl -sf http://localhost:8080/health && echo 'api-blog OK'"
echo "    curl -sf http://localhost:8081/health && echo 'api-admin OK'"
echo "    curl -sf http://localhost:3000/       && echo 'blog frontend OK'"
echo "    curl -sf http://localhost:3001/       && echo 'admin frontend OK'"
echo ""
echo "[rollback] Rollback complete. Kotlin stack should now be serving traffic."
