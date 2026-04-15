# Plan K2 Cutover — Session Checkpoint

**Created:** 2026-04-15
**Purpose:** Resume K2 Phase 2 in a fresh session after closing this one.
**Plan:** `docs/superpowers/plans/2026-04-15-api-rewrite-plan-k2-cutover.md`

## TL;DR for resuming

You are mid-cutover. Hono containers are up and healthy but receive no traffic yet. Kotlin is still serving production. Next step is **Task 9: apply DB migrations**. Everything is reversible until Task 11.

## Critical context

- **This CLI session runs ON the production server** (`giwon-server`, `/home/l4279625/github/new-blog`). No SSH, no pause-and-brief for Phase 2 commands — run them directly.
- Git remote: `https://github.com/giwonn/blog` (public). Push checkpoint commits so other machines can fetch.
- Kotlin containers still running (rollback path alive): `api-blog-blue`, `api-admin-blue`, `giwon-blog-api-nginx`, `giwon-blog`, `giwon-blog-admin`.
- Rollback script: `infra/scripts/rollback-to-kotlin.sh`.

## Phase 1 — DONE (commits)

`967b8d0` Dockerfiles → `a6023c7` split dev/prod compose → `3608911` nginx unified → `3279992` frontend blue-green → `1383043` deploy scripts → `4957119` nginx expose-only → `f076765` JWT removal → `84b9208` audit correction → `cbb12d5` volume external name override.

## Phase 2 — progress

- **Task 7 (build images):** done earlier in Phase 2 (both Dockerfiles built clean).
- **Task 8 (start Hono alongside Kotlin):** DONE.
  - Command run: `docker compose -f apps/api-next/docker-compose.prod.yml up -d api-blog-next-blue api-admin-next-blue`
  - Health check: first poll returned `blog=healthy admin=healthy`. Both containers stable, no traffic routed.
- **Task 9 (DB migrations):** NEXT. See below.
- **Tasks 10–14:** pending (smoke, flip, browser verify, stop Kotlin, close-out log).

## Resume here → Task 9: Apply DB migrations

Baseline hash (from K1 local dry-run, documented in `apps/api-next/packages/core/drizzle/0000_baseline.meta.md`):

```
7b3255d657ce5f687bddd7b68a0dfae797854ba8c2ac4c03fe6820560fcf0f68
```

### Step 9.1 — Pre-insert baseline row (tells drizzle baseline is already applied)

```bash
docker exec -i giwon-blog-db psql -U giwon -d giwon_blog <<'SQL'
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
VALUES ('7b3255d657ce5f687bddd7b68a0dfae797854ba8c2ac4c03fe6820560fcf0f68', (extract(epoch from now())*1000)::bigint);
SELECT hash, created_at FROM drizzle.__drizzle_migrations;
SQL
```

Verify exactly one row returned with the above hash.

### Step 9.2 — Run drizzle migrate inside container (applies 0001 drop dead tables)

```bash
docker exec api-blog-next-blue sh -c 'cd apps/api-next/packages/core && bun x drizzle-kit migrate'
```

Expected: applies `0001_drop_dead_tables.sql`, drops `article_stats` and `daily_article_stats`. Baseline is skipped (hash already present).

### Step 9.3 — Verify

```bash
docker exec giwon-blog-db psql -U giwon -d giwon_blog -c "\dt" | grep -E 'article_stats|daily_article_stats' || echo "GONE (expected)"
docker exec giwon-blog-db psql -U giwon -d giwon_blog -c "SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id;"
```

Expect two rows: baseline hash + drop-dead-tables hash.

## After Task 9

Continue with Task 10 (internal smoke), Task 11 (the flip), Task 12 (browser verify), Task 13 (stop Kotlin), Task 14 (close-out log) — see plan file.

## Decisions still informal

- **Volume name hack (option A):** `docker-compose.prod.yml` uses `name: giwon-blog-api_blog-images` override to inherit Kotlin's existing volume. K3 will clean this up by renaming the volume properly.
- **DB creds in compose:** hardcoded `giwon:giwon1234`. Acceptable because API is internal-only (`expose:` not `ports:`).

## Rollback

If anything after Task 9 goes wrong:

```bash
bash infra/scripts/rollback-to-kotlin.sh
```

This stops Hono + reverse-proxy, restarts Kotlin nginx + frontends. Dead tables dropped in Task 9 are NOT restored by this script — take a DB snapshot before Task 9 if you want zero-loss rollback (pre-K2 snapshot `giwon_blog_pre_k2_20260415_143035.sql.gz` already exists in home dir).
