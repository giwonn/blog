# API Rewrite — Plan K2: Cutover Design

**Date:** 2026-04-15
**Status:** Approved for planning
**Parent:** `docs/superpowers/specs/2026-04-13-api-rewrite-design.md`
**Depends on:** Plan K1 (parity + baseline + drop migrations)
**Feeds:** Plan K3 (cleanup)

## Goal

Execute the actual cutover from the Kotlin API to the Hono/Bun API against the live server. Ship the infrastructure artifacts the cutover needs (Dockerfiles, docker-compose, nginx config, deploy script), add a front-facing reverse proxy layer so the Next.js blog + admin can be blue-green–deployed in the future, run the pre-inserted baseline + drop migrations against the production DB, flip nginx upstreams to point at Hono, and stop the Kotlin containers. Leave Kotlin code untouched — K3 deletes it. Rollback window stays open until K3 ships.

## Non-Goals

- Deleting `apps/api/` (Plan K3)
- Removing old frontend repositories or their CI/CD configuration (Plan K3)
- Jenkins SCM reconfiguration to point at the monorepo (Plan K3 — Jenkins stays pointed at old frontend repos during K2 so those repos can still deploy hotfixes if K2 rolls back)
- Schema changes beyond the two K1 migrations (baseline pre-insert + drop dead tables)
- Frontend code changes — the Next.js blog + admin stay bit-for-bit identical
- Observability / metrics / alerting overhaul
- Any DNS / Cloudflare changes — external routing is unchanged

## Architecture

### Target container topology (end of K2)

```
┌─────────────────────────────────────────────────────────────────┐
│                           blog-network                          │
│                                                                 │
│   ┌──────────────────────┐                                      │
│   │  reverse-proxy nginx │   (aliases: giwon-blog-api-blog,     │
│   │  publishes 3000/3001 │              giwon-blog-api-admin)   │
│   │            8080/8081 │                                      │
│   └─────┬────┬────┬──────┘                                      │
│         │    │    │                                             │
│   :3000 │    │    │ :3001                                       │
│         ▼    │    ▼                                             │
│   ┌──────┐   │ ┌───────┐                                        │
│   │blog- │   │ │admin- │   (Next.js, unchanged code)            │
│   │blue  │   │ │blue   │                                        │
│   └──┬───┘   │ └───┬───┘                                        │
│      │       │     │                                            │
│      └───────┴─────┴───→ reverse-proxy:8080 / :8081             │
│                          (hostname 'giwon-blog-api-blog')       │
│                                │                                │
│   :8080                       :8081                             │
│         │                      │                                │
│         ▼                      ▼                                │
│   ┌──────────────┐       ┌───────────────┐                      │
│   │api-blog-next │       │api-admin-next │   (Hono/Bun)         │
│   │     -blue    │       │     -blue     │                      │
│   └──────┬───────┘       └───────┬───────┘                      │
│          │                       │                              │
│          └────────┬──────────────┘                              │
│                   ▼                                             │
│          ┌────────────────┐      ┌─────────────┐                │
│          │giwon-blog-db   │      │giwon-blog-  │                │
│          │(postgres:17)   │      │redis        │                │
│          └────────────────┘      └─────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

Key observations:
- **Single reverse-proxy container** owns host port publishes for 3000, 3001, 8080, 8081
- **Frontends stop publishing host ports** — only `expose`
- **Frontends unchanged code** — they still talk to `giwon-blog-api-blog:8080`, which is now an alias on the reverse-proxy
- **Hono backends are named `api-blog-next-blue` / `api-admin-next-blue`** for consistency with the existing blue-green naming — the `-next-` infix distinguishes them from the old Kotlin `api-blog-blue` during the transition
- **Old Kotlin containers stay running until the flip is verified**, then get stopped (still retained until K3)

### Why reuse the existing Kotlin nginx container for the flip (rejected)

It would be simpler to edit the Kotlin nginx's `default.conf` in place to point at the Hono backends and `nginx -s reload`. Frontend doesn't change, 0 downtime.

This is rejected because:
- K2 is also supposed to introduce frontend reverse-proxy routing for future frontend blue-green
- Extending the Kotlin nginx config to handle frontend routing, while keeping it in `apps/api/nginx/`, pollutes the doomed Kotlin directory
- Moving the nginx config to `infra/nginx/` at monorepo root is a one-time move — better to do it as part of K2 than to split across K2/K3

Instead K2 introduces a **new reverse-proxy container** living at `infra/nginx/` and accepts a short downtime window (~5–10 seconds) when the old nginx container stops and the new one starts. The window is acceptable for a personal blog with no live traffic on the new API.

### Downtime during the flip

Single brief window, ~5–10 seconds, when:
1. Old Kotlin `giwon-blog-api-nginx` container stops (removes aliases, unbinds host ports)
2. New `reverse-proxy` container starts (takes aliases, binds ports)

Rollback: if the new container fails to start or the smoke curls fail, bring the old container back up (`docker compose -f apps/api/docker-compose.yml up -d nginx`). It will reclaim the aliases and ports, and traffic resumes on Kotlin.

## Work Breakdown

### 1. Hono Dockerfiles

Two multi-stage Dockerfiles under `apps/api-next/`:

**`apps/api-next/Dockerfile.api-blog`**
```dockerfile
# Build stage
FROM oven/bun:1.3.12-alpine AS build
WORKDIR /build
COPY apps/api-next/package.json apps/api-next/bun.lock ./
COPY apps/api-next/apps/blog/package.json ./apps/blog/
COPY apps/api-next/packages/core/package.json ./packages/core/
RUN bun install --frozen-lockfile
COPY apps/api-next/apps/blog ./apps/blog
COPY apps/api-next/packages/core ./packages/core
COPY apps/api-next/tsconfig.base.json ./
# Bun runs TypeScript natively — no build step, but a typecheck gate is nice to have
RUN cd apps/blog && bun run --bun tsc --noEmit

# Runtime stage
FROM oven/bun:1.3.12-alpine AS runtime
WORKDIR /app
COPY --from=build /build ./
USER bun
ENV NODE_ENV=production
EXPOSE 8080
CMD ["bun", "run", "--bun", "apps/blog/src/index.ts"]
```

**`apps/api-next/Dockerfile.api-admin`** — same shape but `apps/admin` and port 8081.

Build context is the **monorepo root** (`~/github/new-blog`) so both apps can be copied from `apps/api-next/...`. The compose `build.context` must reflect this.

#### Alternative rejected: pre-bundled Bun `bun build --compile`
Bun can compile to a single binary. Advantages: small, fast start. Disadvantages: bun:sql, croner, jose, and `@api-next/core` cross-package imports may hit quirks. Skip for now; runtime Bun image is well understood.

### 2. `apps/api-next/docker-compose.yml`

New file. Defines the four Hono backend services (blue + green variants of each API) and the `blog-network` external reference. Mirrors the shape of `apps/api/docker-compose.yml`:

```yaml
name: giwon-blog-api-next

x-api-blog: &api-blog-common
  build:
    context: ../../        # monorepo root
    dockerfile: apps/api-next/Dockerfile.api-blog
  restart: unless-stopped
  expose:
    - "8080"
  networks:
    - blog-network
  environment:
    DATABASE_URL: postgresql://giwon:${DB_PASSWORD}@giwon-blog-db:5432/giwon_blog
    REDIS_URL: redis://giwon-blog-redis:6379
    ADMIN_JWT_SECRET: ${ADMIN_JWT_SECRET}
    ADMIN_GOOGLE_SUB: ${ADMIN_GOOGLE_SUB}
    IMAGE_STORAGE_PATH: /data/blog/images
    IMAGE_PUBLIC_URL: http://giwon-blog-api-blog:8080/images
    NODE_ENV: production
    LOG_LEVEL: info
    BLOG_PORT: "8080"
    ADMIN_PORT: "8081"
  volumes:
    - blog-images:/data/blog/images
  depends_on: []
  healthcheck:
    test: ["CMD", "wget", "-q", "--spider", "http://localhost:8080/health"]
    interval: 10s
    timeout: 5s
    retries: 3

x-api-admin: &api-admin-common
  build:
    context: ../../
    dockerfile: apps/api-next/Dockerfile.api-admin
  restart: unless-stopped
  expose:
    - "8081"
  networks:
    - blog-network
  environment:
    DATABASE_URL: postgresql://giwon:${DB_PASSWORD}@giwon-blog-db:5432/giwon_blog
    REDIS_URL: redis://giwon-blog-redis:6379
    ADMIN_JWT_SECRET: ${ADMIN_JWT_SECRET}
    ADMIN_GOOGLE_SUB: ${ADMIN_GOOGLE_SUB}
    IMAGE_STORAGE_PATH: /data/blog/images
    IMAGE_PUBLIC_URL: http://giwon-blog-api-blog:8080/images
    NODE_ENV: production
    LOG_LEVEL: info
    BLOG_PORT: "8080"
    ADMIN_PORT: "8081"
  volumes:
    - blog-images:/data/blog/images
  healthcheck:
    test: ["CMD", "wget", "-q", "--spider", "http://localhost:8081/health"]
    interval: 10s
    timeout: 5s
    retries: 3

services:
  api-blog-next-blue:
    <<: *api-blog-common
    container_name: api-blog-next-blue

  api-blog-next-green:
    <<: *api-blog-common
    container_name: api-blog-next-green
    profiles: ["green"]

  api-admin-next-blue:
    <<: *api-admin-common
    container_name: api-admin-next-blue

  api-admin-next-green:
    <<: *api-admin-common
    container_name: api-admin-next-green
    profiles: ["green"]

networks:
  blog-network:
    external: true

volumes:
  blog-images:
    external: true    # shares the volume from apps/api/docker-compose.yml
```

**Environment variables** come from a `.env` file in the same directory (gitignored) that the user populates on the server before first deploy. `.env.example` is committed with placeholders.

**Shared `blog-images` volume:** Kotlin's compose creates the volume; K2's compose reuses it with `external: true`. Data survives the cutover. Plan K3 will claim ownership later.

### 3. `infra/nginx/default.conf` + `infra/nginx/docker-compose.yml`

The unified reverse proxy that replaces `apps/api/nginx/` and adds frontend routing.

**`infra/nginx/default.conf`**:

```nginx
upstream api-blog-backend {
    server api-blog-next-blue:8080;
}
upstream api-admin-backend {
    server api-admin-next-blue:8081;
}
upstream blog-frontend {
    server blog-blue:3000;
}
upstream admin-frontend {
    server admin-blue:3000;
}

server {
    listen 8080;
    location / {
        proxy_pass http://api-blog-backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        client_max_body_size 15M;  # image upload needs >10M
    }
}

server {
    listen 8081;
    location / {
        proxy_pass http://api-admin-backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        client_max_body_size 15M;
    }
}

server {
    listen 3000;
    location / {
        proxy_pass http://blog-frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

server {
    listen 3001;
    location / {
        proxy_pass http://admin-frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

**`infra/nginx/docker-compose.yml`**:

```yaml
name: giwon-blog-reverse-proxy

services:
  reverse-proxy:
    image: nginx:alpine
    container_name: giwon-blog-reverse-proxy
    restart: unless-stopped
    ports:
      - "3000:3000"
      - "3001:3001"
      - "8080:8080"
      - "8081:8081"
    networks:
      blog-network:
        aliases:
          - giwon-blog-api-blog      # inherited from Kotlin nginx
          - giwon-blog-api-admin     # inherited from Kotlin nginx
    volumes:
      - ./default.conf:/etc/nginx/conf.d/default.conf:ro

networks:
  blog-network:
    external: true
```

The bind-mount of `default.conf` lets the deploy script `sed -i` the upstream line and `docker exec reverse-proxy nginx -s reload` — same pattern as the old `apps/api/scripts/deploy.sh`.

### 4. Frontend compose file updates

Both `apps/blog/docker-compose.yml` and `apps/admin/docker-compose.yml` are modified in place:
1. Remove `ports: ["3000:3000"]` / `["3001:3000"]`
2. Add `expose: ["3000"]`
3. Rename `container_name: giwon-blog` → `container_name: blog-blue`, `giwon-blog-admin` → `admin-blue`
4. Use an anchor `&blog-common` so a `blog-green` variant (with `profiles: ["green"]`) can be added
5. Keep the existing env vars — they still reference `giwon-blog-api-blog:8080`, which now resolves to the reverse-proxy alias

### 5. Deploy script

`infra/scripts/deploy-api-next.sh` — a near-copy of the existing `apps/api/scripts/deploy.sh`, adapted for Hono service names:

```bash
#!/bin/bash
set -e
COMPOSE="apps/api-next/docker-compose.yml"
NGINX_CONF="infra/nginx/default.conf"
# Detect current blue/green for api-next
if docker ps --format '{{.Names}}' | grep -q "api-blog-next-blue"; then
    CURRENT="blue"; NEXT="green"
else
    CURRENT="green"; NEXT="blue"
fi
# Build next
docker compose -f $COMPOSE --profile "$NEXT" build api-blog-next-$NEXT api-admin-next-$NEXT
docker compose -f $COMPOSE --profile "$NEXT" up -d api-blog-next-$NEXT api-admin-next-$NEXT
# Wait for healthchecks (30 × 5s)
for i in $(seq 1 30); do
    blog_h=$(docker inspect --format='{{.State.Health.Status}}' api-blog-next-$NEXT 2>/dev/null || echo starting)
    adm_h=$(docker inspect --format='{{.State.Health.Status}}' api-admin-next-$NEXT 2>/dev/null || echo starting)
    if [ "$blog_h" = healthy ] && [ "$adm_h" = healthy ]; then break; fi
    sleep 5
    [ $i -eq 30 ] && { echo "health timeout"; docker logs --tail 200 api-blog-next-$NEXT api-admin-next-$NEXT; exit 1; }
done
# Flip nginx upstream
sed -i "s/api-blog-next-$CURRENT/api-blog-next-$NEXT/g; s/api-admin-next-$CURRENT/api-admin-next-$NEXT/g" "$NGINX_CONF"
docker exec giwon-blog-reverse-proxy nginx -s reload
# Tear down old
docker compose -f $COMPOSE stop api-blog-next-$CURRENT api-admin-next-$CURRENT || true
docker compose -f $COMPOSE rm -f api-blog-next-$CURRENT api-admin-next-$CURRENT || true
docker image prune -f
```

A parallel `infra/scripts/deploy-frontend.sh` does the same for `blog-blue/green` and `admin-blue/green`.

Both scripts are for POST-K2 deploys — inside K2 itself the cutover is a one-shot manual runbook.

### 6. Cutover execution runbook (SSH, manual)

The runbook lives inside Plan K2's plan document and will be executed by the user via SSH. The plan task corresponding to the runbook **pauses and briefs** — the agent does not execute SSH commands.

Phases:

1. **Pre-flight**
   - SSH to server, `cd /opt/blog` (or wherever the monorepo is deployed)
   - `git fetch && git checkout main && git pull`
   - Confirm the commit hash matches what was just merged
   - Verify `.env` file exists in `apps/api-next/` with prod creds filled in (DB_PASSWORD, ADMIN_JWT_SECRET, ADMIN_GOOGLE_SUB)
   - `docker network ls | grep blog-network` — must exist
2. **Bring up Hono backends alongside Kotlin**
   - `docker compose -f apps/api-next/docker-compose.yml build api-blog-next-blue api-admin-next-blue`
   - `docker compose -f apps/api-next/docker-compose.yml up -d api-blog-next-blue api-admin-next-blue`
   - Wait for healthchecks
   - `curl` Hono containers directly via `docker exec` against `api-blog-next-blue:8080/health` and `api-admin-next-blue:8081/health`
   - **Do not touch nginx yet.** Kotlin is still serving traffic.
3. **Apply DB migrations**
   - From the server or a psql client, connect to `giwon_blog` database
   - Run the baseline pre-insert (from `apps/api-next/packages/core/drizzle/0000_baseline.meta.md`): `CREATE SCHEMA IF NOT EXISTS drizzle; CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations ...; INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('<hash>', 0);`
   - Run `drizzle-kit migrate` against prod (either from the server via `docker exec api-blog-next-blue bunx drizzle-kit migrate` OR from a local machine with prod DATABASE_URL tunneled)
   - Verify: both dead tables are gone, `drizzle.__drizzle_migrations` has 2 rows, other tables untouched
   - Record `\dt` output as a checkpoint
4. **Smoke-test Hono via internal network**
   - `docker exec giwon-blog-reverse-proxy sh -c 'wget -qO- http://api-blog-next-blue:8080/articles?page=0&size=5'` (or curl from any container on the network)
   - A handful of representative endpoints (5-10), one per domain
   - Verify responses shape matches expectations
5. **The cutover flip (brief downtime)**
   - Stop old Kotlin nginx: `docker compose -f apps/api/docker-compose.yml stop nginx`
   - Stop old frontend containers: `docker compose -f apps/blog/docker-compose.yml stop blog`, `docker compose -f apps/admin/docker-compose.yml stop admin` (they republish host ports which conflict with the new reverse-proxy)
   - Bring up new reverse-proxy: `docker compose -f infra/nginx/docker-compose.yml up -d`
   - Bring up renamed frontends: `docker compose -f apps/blog/docker-compose.yml up -d blog-blue`, same for admin
   - Wait ~5 seconds for nginx to settle
   - `curl http://localhost:8080/health` and `http://localhost:8081/health` from the server
   - `curl http://localhost:3000/` and `http://localhost:3001/` — expect 200 or a Next.js-generated response
6. **Browser smoke**
   - Open blog.giwon.dev in a real browser; verify home, an article, images load
   - Open admin.giwon.dev; log in, dashboard renders, one POST and one PUT work
7. **Stop old Kotlin backends (retained, not removed)**
   - `docker compose -f apps/api/docker-compose.yml stop api-blog-blue api-admin-blue`
   - Containers remain on disk (stopped) for rollback.
8. **Mark K2 complete; rollback window is OPEN until K3**

**Rollback procedure** (any time after step 5 before K3):
   - `docker compose -f infra/nginx/docker-compose.yml stop reverse-proxy`
   - `docker compose -f apps/blog/docker-compose.yml stop blog-blue`, admin same
   - `docker compose -f apps/api/docker-compose.yml start nginx api-blog-blue api-admin-blue` (restarts the stopped Kotlin containers)
   - `docker compose -f apps/blog/docker-compose.yml up -d blog` — wait, we'd need to rename back. Best rollback is actually a script that does the whole thing. Plan K2 deliverable: `infra/scripts/rollback-to-kotlin.sh`.
   - DB state: the K1 baseline pre-insert does not change the schema; Flyway is unaffected; the dead table drops would need manual re-creation via `CREATE TABLE` from the baseline SQL, which is low-stakes since nothing reads them. Write the re-create SQL into the rollback runbook.

### 7. Jenkins reconfig runbook (deferred to K3)

Plan K2 does **not** touch Jenkins. Jenkins stays pointed at the old frontend repos and the old Kotlin API repo. This is deliberate: if K2 rolls back, Jenkins can still deploy hotfixes to the old Kotlin API or old frontends. K3 is where Jenkins moves over to the monorepo.

That said, Plan K2's runbook explicitly notes that during the K2 window, pushing to the old repos is discouraged unless a rollback is in progress.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Hono backend fails health check on first run | Medium | High — blocks cutover | Container stays isolated, no traffic. Investigate logs, rebuild. 0 user impact. |
| Drizzle migrate fails on production (e.g. MAXVALUE bug re-surfaces somehow) | Low | Medium — DB schema mismatch | Baseline is pre-inserted BEFORE drizzle-kit migrate runs, so no CREATE TABLE attempts. Only 0001 (drop) runs. Risk is limited to DROP TABLE syntax issues, which were dry-run-verified in K1. |
| New nginx container fails to bind 3000/3001/8080/8081 | Low | High — total outage | Likely cause: port conflict with a zombie process. Mitigation: pre-flight check `ss -tlnp \| grep -E ':(3000\|3001\|8080\|8081)'` before flip. |
| Frontend containers fail to reach Hono via `giwon-blog-api-blog` alias | Medium | High — frontend broken | Verified via curl from a Next.js container BEFORE stopping Kotlin. If broken, rollback. |
| Image upload writes to wrong volume | Low | Medium | `blog-images` volume is `external: true` in the new compose — identical volume. Image path unchanged. |
| DB password drift between Kotlin and Hono configs | Medium | High — Hono can't connect | Pre-flight: `docker exec api-blog-next-blue env \| grep DATABASE_URL` and test connect before flip. |
| CORS origins differ between Kotlin (`CORS_ALLOWED_ORIGINS`) and Hono | Low | Medium | Hono inherits the same env var naming in its compose. Plan K2 task-level grep confirms the Hono code reads the same envs. |
| `expose` change for frontend containers requires recreating them → cache loss | N/A | Low | Next.js containers are stateless. Safe. |

## K2 Deliverables

1. `apps/api-next/Dockerfile.api-blog` and `Dockerfile.api-admin` (new, multi-stage Bun)
2. `apps/api-next/docker-compose.yml` (new)
3. `apps/api-next/.env.example` (new, documents required prod env vars)
4. `infra/nginx/default.conf` (new)
5. `infra/nginx/docker-compose.yml` (new)
6. `infra/scripts/deploy-api-next.sh` (new)
7. `infra/scripts/deploy-frontend.sh` (new)
8. `infra/scripts/rollback-to-kotlin.sh` (new, documents the rollback flow)
9. `apps/blog/docker-compose.yml` — modified (ports → expose, rename, anchor)
10. `apps/admin/docker-compose.yml` — modified (same)
11. Cutover runbook embedded in the Plan K2 plan document
12. Execution of the runbook on the live server, via pause-and-brief checkpoints
13. DB migrations applied (baseline pre-insert + drop dead tables)
14. Hono containers running, Kotlin backends stopped (not removed)
15. Smoke verification passed (curl + browser)
16. `bunx turbo run lint` 5/5 and `bun run test` 4/4 still green at the end
17. Rollback window documented as OPEN until K3 ships

## Plan K2 Non-Goals (repeat for emphasis)

- No deletion of `apps/api/`
- No Jenkins SCM URL changes
- No old-repo archiving
- No frontend source changes
- No DNS / external routing changes
- No CI/CD pipeline rewrites
