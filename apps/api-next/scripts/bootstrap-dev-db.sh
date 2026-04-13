#!/usr/bin/env bash
# Bootstrap the api-next local dev Postgres by applying the existing legacy
# Flyway migrations from apps/api/. Idempotent: skips if the marker table
# `flyway_schema_history` already has rows.
#
# Usage:
#   cd apps/api-next && ./scripts/bootstrap-dev-db.sh
#
# Prereqs:
#   - `docker compose up -d postgres` has been run (api-next-dev-db is healthy)

set -euo pipefail

CONTAINER=api-next-dev-db
DB=api_next_dev
USER=api_next
MIGRATIONS_DIR="$(cd "$(dirname "$0")/../../api/core/src/main/resources/db/migration" && pwd)"

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "error: container ${CONTAINER} is not running. Run 'docker compose up -d postgres' from apps/api-next/ first." >&2
  exit 1
fi

# Idempotency check — if any user table already exists, assume bootstrap is done.
existing=$(docker exec "$CONTAINER" psql -U "$USER" -d "$DB" -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='settings'")
if [ "$existing" -ge 1 ]; then
  echo "bootstrap: settings table already exists, nothing to do."
  exit 0
fi

echo "bootstrap: applying Flyway migrations from ${MIGRATIONS_DIR}"
for sql in "$MIGRATIONS_DIR"/V*.sql; do
  echo "  -> $(basename "$sql")"
  docker exec -i "$CONTAINER" psql -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 < "$sql" >/dev/null
done

# Record what was applied in flyway_schema_history so the legacy app could in
# theory connect to this DB without re-running its own migrations. Kept minimal
# (installed_rank, version, description, type, script, success).
docker exec "$CONTAINER" psql -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -c "
  CREATE TABLE IF NOT EXISTS flyway_schema_history (
    installed_rank int NOT NULL PRIMARY KEY,
    version varchar(50),
    description varchar(200) NOT NULL,
    type varchar(20) NOT NULL,
    script varchar(1000) NOT NULL,
    checksum int,
    installed_by varchar(100) NOT NULL DEFAULT current_user,
    installed_on timestamp NOT NULL DEFAULT now(),
    execution_time int NOT NULL DEFAULT 0,
    success boolean NOT NULL DEFAULT true
  );
" >/dev/null

rank=1
for sql in "$MIGRATIONS_DIR"/V*.sql; do
  filename=$(basename "$sql")
  version=$(echo "$filename" | sed -E 's/^V([0-9]+)__.*/\1/')
  description=$(echo "$filename" | sed -E 's/^V[0-9]+__([^.]*)\.sql$/\1/' | tr '_' ' ')
  docker exec "$CONTAINER" psql -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -c "
    INSERT INTO flyway_schema_history (installed_rank, version, description, type, script)
    VALUES (${rank}, '${version}', '${description}', 'SQL', '${filename}')
    ON CONFLICT DO NOTHING
  " >/dev/null
  rank=$((rank + 1))
done

echo "bootstrap: done."
