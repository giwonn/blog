# api-next

The new TypeScript/Bun/Hono backend that will replace the legacy Kotlin/Spring Boot `apps/api` after Plan K's cutover. Two processes — `api-blog-next` (public read API) and `api-admin-next` (admin API + schedulers) — share the `@api-next/core` package (env, errors, drizzle client, domain layer).

## Quick start (local dev)

```bash
# 1. Bring up a dedicated local Postgres for api-next (separate from the legacy container).
cd apps/api-next
docker compose up -d postgres

# 2. Bootstrap the schema by replaying the legacy Flyway migrations once.
./scripts/bootstrap-dev-db.sh

# 3. Copy .env.example to .env and edit if needed (DATABASE_URL points at the local container).
cp .env.example .env

# 4. Install workspace deps from the monorepo root if you haven't already.
cd ../..
bun install

# 5. Run a dev server.
cd apps/api-next/apps/blog && bun run dev   # public API on $BLOG_PORT (default 8080)
cd apps/api-next/apps/admin && bun run dev  # admin API on $ADMIN_PORT (default 8081)
```

## Schema ownership

During the rewrite (Plans A–J), the schema is treated as **frozen at its post-Flyway state**. We do not add new Flyway migrations and we do not add drizzle migrations. `packages/core/src/db/schema.ts` is a generated snapshot of the production schema (via `bunx drizzle-kit introspect`).

If a schema change is unavoidable before cutover (Plan K), the chosen path is:

1. Edit `packages/core/src/db/schema.ts` directly.
2. Run `bunx drizzle-kit generate` to produce a migration SQL file.
3. Apply it manually to the local dev DB (`docker exec api-next-dev-db psql -U api_next -d api_next_dev < drizzle/<file>.sql`).
4. Apply the same SQL to production via whatever channel keeps prod in sync (psql or a temporary Flyway migration). Solo dev = solo discipline.

After Plan K's cutover, drizzle becomes the sole owner: `drizzle-kit generate` + `drizzle-kit migrate` is the only workflow.

## Tests

```bash
# from any workspace under apps/api-next/
bun test

# or from the monorepo root, all workspaces:
NODE_ENV=test bunx turbo run test
```

Tests run against the local dev DB and use `resetDb()` from `@api-next/core/test-helpers` in `beforeEach` to TRUNCATE state. The local DB must be bootstrapped first (step 2 above) — an empty Postgres has no tables to TRUNCATE.

## Layout

```
apps/api-next/
├── apps/
│   ├── blog/   # api-blog-next  — public read API (port 8080)
│   └── admin/  # api-admin-next — admin API + schedulers (port 8081)
└── packages/
    └── core/   # @api-next/core — env, errors, db client, domains/, test-helpers
```
