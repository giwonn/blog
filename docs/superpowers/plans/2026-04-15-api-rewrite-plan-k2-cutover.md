# API Rewrite — Plan K2: Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the infra artifacts (Dockerfiles, docker-compose, nginx config, deploy scripts) for the Hono API, then execute the live cutover against the production server via a pause-and-brief runbook. End state: traffic flows through Hono, Kotlin containers are stopped but not deleted, rollback window stays open until Plan K3.

**Architecture:** Unified reverse-proxy container at `infra/nginx/` owns ports 3000/3001/8080/8081 and inherits the `giwon-blog-api-blog` / `giwon-blog-api-admin` network aliases from the old Kotlin nginx. Hono backends (`api-blog-next-blue`, `api-admin-next-blue`) join the shared `blog-network`. Frontends stop publishing host ports and rename to `blog-blue` / `admin-blue`. Kotlin backends stop but their containers remain on disk for rollback.

**Tech Stack:** Bun 1.3.12 runtime image (`oven/bun:1.3.12-alpine`), nginx:alpine, docker compose, bash deploy scripts, pre-existing drizzle-kit toolchain.

**Design reference:** `docs/superpowers/specs/2026-04-15-api-rewrite-plan-k2-cutover-design.md`

---

## Scope Check

Phase 1 (local): 6 tasks adding artifacts + 1 verification. Phase 2 (server): 7 pause-and-brief tasks executing the cutover runbook against the real server. Kotlin code and Jenkins remain untouched — Plan K3 handles those.

## Manual intervention philosophy

Plan K2 is the single most dangerous phase of the rewrite. Every task that touches the real server is a **pause-and-brief checkpoint**: the agent writes out the exact commands, explains the expected output, explains the rollback, and stops. The user executes on the server, verifies, and replies "done" before the agent continues to the next task. No agent SSH automation, no silent state changes.

## File Structure

```
# NEW files (Phase 1)
apps/api-next/
├── Dockerfile.api-blog                    # multi-stage Bun build for blog
├── Dockerfile.api-admin                   # same shape, port 8081
├── docker-compose.prod.yml                # hono backends, blue/green (PROD only)
├── .env.example.prod                      # prod env template (for docker-compose.prod.yml)
└── .env.example                           # dev env template (for local bun test / drizzle)
# NOTE: docker-compose.yml stays as the DEV compose (api-next-dev-db + api-next-dev-redis)

infra/
├── nginx/
│   ├── default.conf                       # unified reverse proxy config
│   └── docker-compose.yml                 # reverse-proxy container
└── scripts/
    ├── deploy-api-next.sh                 # future api blue-green deploys
    ├── deploy-frontend.sh                 # future frontend blue-green deploys
    └── rollback-to-kotlin.sh              # emergency rollback

# MODIFIED files (Phase 1)
apps/blog/docker-compose.yml               # ports→expose, rename blog-blue, anchor for green
apps/admin/docker-compose.yml              # same
```

---

# Phase 1 — Local Artifacts (no deploy)

## Task 1: Hono Dockerfiles (api-blog + api-admin)

**Files:**
- Create: `apps/api-next/Dockerfile.api-blog`
- Create: `apps/api-next/Dockerfile.api-admin`
- Create: `apps/api-next/.dockerignore`

- [ ] **Step 1: Write `Dockerfile.api-blog`**

The build context will be the monorepo root (`~/github/new-blog`), so paths are rooted at `apps/api-next/...`.

```dockerfile
# syntax=docker/dockerfile:1
FROM oven/bun:1.3.12-alpine AS build
WORKDIR /build

# Copy workspace manifests first for better caching
COPY apps/api-next/package.json apps/api-next/bun.lock ./
COPY apps/api-next/apps/blog/package.json ./apps/blog/
COPY apps/api-next/apps/admin/package.json ./apps/admin/
COPY apps/api-next/packages/core/package.json ./packages/core/

RUN bun install --frozen-lockfile

# Source
COPY apps/api-next/apps/blog ./apps/blog
COPY apps/api-next/apps/admin ./apps/admin
COPY apps/api-next/packages/core ./packages/core
COPY apps/api-next/tsconfig.base.json ./

# Typecheck gate (no emit — Bun runs TS directly)
RUN cd apps/blog && bun x tsc --noEmit

FROM oven/bun:1.3.12-alpine AS runtime
WORKDIR /app
COPY --from=build /build ./
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
ENV NODE_ENV=production
EXPOSE 8080
CMD ["bun", "run", "--bun", "apps/blog/src/index.ts"]
```

Note: `tsc` is reachable via `bun x` because it comes via the typescript dep already in package.json. If the typecheck fails because `tsc` is not resolvable, use `bun tsc` or `bun run --bun tsc` depending on the local toolchain — pick whichever works when you verify the build locally.

- [ ] **Step 2: Write `Dockerfile.api-admin`**

Same as Dockerfile.api-blog but swap:
- `cd apps/blog` → `cd apps/admin` in the typecheck step
- `EXPOSE 8080` → `EXPOSE 8081`
- `apps/blog/src/index.ts` → `apps/admin/src/index.ts`

- [ ] **Step 3: Write `apps/api-next/.dockerignore`**

```
node_modules
**/node_modules
**/.next
**/dist
**/coverage
**/.turbo
**/*.log
storage/
```

- [ ] **Step 4: Build both images locally to verify**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog
docker build -f apps/api-next/Dockerfile.api-blog -t api-blog-next:k2-verify .
docker build -f apps/api-next/Dockerfile.api-admin -t api-admin-next:k2-verify .
```

Both must succeed. If `bun x tsc --noEmit` fails, inspect the error — a real type error must be fixed before proceeding, not worked around.

- [ ] **Step 5: Smoke-run each image locally (no DB)**

Start api-blog-next briefly to confirm the binary starts. It will crash when it can't reach the DB, but it should log startup messages before crashing:

```bash
docker run --rm --name k2-smoke-blog \
  -e DATABASE_URL="postgresql://bogus:bogus@localhost:1/nope" \
  -e ADMIN_JWT_SECRET="$(openssl rand -hex 32)" \
  -e ADMIN_GOOGLE_SUB="dev" \
  -e REDIS_URL="redis://localhost:1" \
  api-blog-next:k2-verify &
sleep 3
docker logs k2-smoke-blog 2>&1 | head -20
docker stop k2-smoke-blog 2>/dev/null || true
```

Expected: logs show "server starting" / Hono listening line OR a clean DB-connection error. NOT a module-not-found / import error — that would indicate Dockerfile paths are wrong.

Repeat for api-admin-next.

- [ ] **Step 6: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/Dockerfile.api-blog apps/api-next/Dockerfile.api-admin apps/api-next/.dockerignore
git commit -m "feat(api-next): add production Dockerfiles for blog + admin

Multi-stage build on oven/bun:1.3.12-alpine. Monorepo-root build
context so @api-next/core and both apps are copied in one step.
tsc --noEmit acts as a typecheck gate inside the build image."
```

---

## Task 2: `apps/api-next/docker-compose.prod.yml` + `.env.example` + `.env.example.prod`

> **Note:** The dev compose at `apps/api-next/docker-compose.yml` stays unchanged — it defines the local `api-next-dev-db` (postgres:5433) and `api-next-dev-redis` (redis:6380) containers used by `bun test` and drizzle dry-runs. The prod compose is a NEW separate file at `apps/api-next/docker-compose.prod.yml`.

**Files:**
- Create: `apps/api-next/docker-compose.prod.yml` (NEW — prod Hono backends, blue/green)
- Update: `apps/api-next/.env.example` (restore dev-focused template)
- Create: `apps/api-next/.env.example.prod` (prod env template for docker-compose.prod.yml)

- [ ] **Step 1: Write the prod compose file**

Write the exact content from the design spec's section 2 into `apps/api-next/docker-compose.prod.yml` (NOT docker-compose.yml). Key details:
- `name: giwon-blog-api-next`
- Two anchors: `x-api-blog` and `x-api-admin`
- Four services: `api-blog-next-blue`, `api-blog-next-green` (profile), `api-admin-next-blue`, `api-admin-next-green` (profile)
- `blog-network` is `external: true`
- `blog-images` volume is `external: true`
- `build.context: ../../` (monorepo root) and `build.dockerfile: apps/api-next/Dockerfile.api-blog` (for blog) / `Dockerfile.api-admin` (for admin)

Use `${DB_PASSWORD}`, `${ADMIN_JWT_SECRET}`, `${ADMIN_GOOGLE_SUB}` env interpolation — docker compose will read them from a sibling `.env` file at runtime.

- [ ] **Step 2: Write `.env.example` (dev template) and `.env.example.prod` (prod template)**

`.env.example` is the local dev template (used by `bun test`, drizzle dry-runs):
```
# Copy to apps/api-next/.env and fill in real values for local development.
# For local dev, first run: (cd apps/api-next && docker compose up -d postgres)
# That brings up a dedicated Postgres at localhost:5433 for api-next.

DATABASE_URL=postgresql://api_next:api_next_dev_pwd@localhost:5433/api_next_dev
ADMIN_JWT_SECRET=CHANGE_ME_at_least_32_characters_long_secret
ADMIN_GOOGLE_SUB=your-google-sub-here
...
```

`.env.example.prod` is the production template (used by `docker-compose.prod.yml`):
```
# Used by docker-compose.prod.yml on the production server. Copy to .env when deploying.

DB_PASSWORD=<prod-db-password>
ADMIN_JWT_SECRET=<random-hex-48-chars-or-more>
ADMIN_GOOGLE_SUB=<sub1>,<sub2>
```

- [ ] **Step 3: Update `.gitignore`**

Ensure `apps/api-next/.env` is gitignored (it should already be, given Plan J added this). Confirm:
```bash
grep -n "\.env$\|api-next/\.env" ~/github/new-blog/apps/api-next/.gitignore
```
If missing, add `.env` to `apps/api-next/.gitignore`.

- [ ] **Step 4: docker compose config validation**

```bash
cd ~/github/new-blog/apps/api-next
# Dev compose (no env vars needed)
docker compose config > /dev/null
echo "dev exit=$?"

# Prod compose (needs dummy env vars for interpolation)
cat > /tmp/k2-validate.env <<EOF
DB_PASSWORD=x
ADMIN_JWT_SECRET=$(openssl rand -hex 32)
ADMIN_GOOGLE_SUB=x
EOF
docker compose -f docker-compose.prod.yml --env-file /tmp/k2-validate.env config > /dev/null
echo "prod exit=$?"
rm /tmp/k2-validate.env
```

Both must exit 0. If errors, fix the compose file.

- [ ] **Step 5: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/docker-compose.prod.yml apps/api-next/.env.example apps/api-next/.env.example.prod apps/api-next/.gitignore
git commit -m "feat(api-next): add production docker-compose + env template

Four services with blue/green profiles in docker-compose.prod.yml,
sharing the external blog-network and blog-images volume with the
Kotlin stack. Dev compose (docker-compose.yml) remains unchanged.
Sensitive values read from a sibling .env (gitignored); the
committed .env.example.prod documents the prod keys."
```

---

## Task 3: Unified reverse-proxy nginx (`infra/nginx/`)

**Files:**
- Create: `infra/nginx/default.conf`
- Create: `infra/nginx/docker-compose.yml`

- [ ] **Step 1: Write `infra/nginx/default.conf`**

Write the exact content from the design spec's section 3. Four `upstream` blocks (api-blog-backend, api-admin-backend, blog-frontend, admin-frontend) followed by four `server` blocks listening on 8080, 8081, 3000, 3001. Include `client_max_body_size 15M;` on the two API servers for image upload.

- [ ] **Step 2: Write `infra/nginx/docker-compose.yml`**

Write the exact content from the design spec. Key details:
- `name: giwon-blog-reverse-proxy`
- Single service `reverse-proxy` from `nginx:alpine`
- `container_name: giwon-blog-reverse-proxy`
- `ports` publishes 3000, 3001, 8080, 8081
- `networks.blog-network.aliases` has BOTH `giwon-blog-api-blog` AND `giwon-blog-api-admin` (these are inherited from the old Kotlin nginx; frontend containers resolve these names to the reverse proxy)
- Bind-mount `./default.conf:/etc/nginx/conf.d/default.conf:ro`
- `blog-network: external: true`

- [ ] **Step 3: Validate nginx config syntax**

```bash
cd ~/github/new-blog
docker run --rm -v "$PWD/infra/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro" nginx:alpine nginx -t 2>&1
```

Expected: `nginx: configuration file /etc/nginx/nginx.conf test is successful`. If the upstreams reference containers that don't exist at test time, that's OK — nginx -t only checks syntax, not runtime DNS.

- [ ] **Step 4: Validate compose config**

```bash
cd ~/github/new-blog/infra/nginx
docker compose config > /dev/null
echo "exit=$?"
```
Must exit 0.

- [ ] **Step 5: Commit**

```bash
cd ~/github/new-blog
git add infra/nginx/default.conf infra/nginx/docker-compose.yml
git commit -m "feat(infra): add unified reverse-proxy nginx

New giwon-blog-reverse-proxy container publishes 3000/3001/8080/8081
and inherits the giwon-blog-api-blog / giwon-blog-api-admin network
aliases from the old Kotlin nginx so the frontend never needs to
change hostnames. Will replace apps/api/nginx/ during K2 cutover."
```

---

## Task 4: Frontend compose updates (blog + admin)

**Files:**
- Modify: `apps/blog/docker-compose.yml`
- Modify: `apps/admin/docker-compose.yml`

- [ ] **Step 1: Edit `apps/blog/docker-compose.yml`**

Refactor to use an anchor so the green variant is cheap to add, remove host-port publish, rename container, keep env vars and network unchanged:

```yaml
name: giwon-blog

x-blog: &blog-common
  build:
    context: .
    dockerfile: Dockerfile
    args:
      - IMAGE_PUBLIC_URL=http://giwon-blog-api-blog:8080/images
  restart: unless-stopped
  expose:
    - "3000"
  networks:
    - blog-network
  environment:
    - NODE_ENV=production
    - API_BASE_URL=http://giwon-blog-api-blog:8080
    - IMAGE_PUBLIC_URL=http://giwon-blog-api-blog:8080/images

services:
  blog-blue:
    <<: *blog-common
    container_name: blog-blue

  blog-green:
    <<: *blog-common
    container_name: blog-green
    profiles: ["green"]

networks:
  blog-network:
    external: true
```

Note: the old service name was `blog` (container `giwon-blog`). The new names are `blog-blue` / `blog-green`. The old service entry is gone entirely.

- [ ] **Step 2: Edit `apps/admin/docker-compose.yml`**

Same shape:

```yaml
name: giwon-blog-admin

x-admin: &admin-common
  build:
    context: .
    dockerfile: Dockerfile
    args:
      - IMAGE_PUBLIC_URL=http://giwon-blog-api-blog:8080/images
  restart: unless-stopped
  expose:
    - "3000"
  networks:
    - blog-network
  environment:
    - NODE_ENV=production
    - API_BASE_URL=http://giwon-blog-api-admin:8081
    - IMAGE_PUBLIC_URL=http://giwon-blog-api-blog:8080/images

services:
  admin-blue:
    <<: *admin-common
    container_name: admin-blue

  admin-green:
    <<: *admin-common
    container_name: admin-green
    profiles: ["green"]

networks:
  blog-network:
    external: true
```

- [ ] **Step 3: Validate both**

```bash
cd ~/github/new-blog/apps/blog && docker compose config > /dev/null && echo blog=ok
cd ~/github/new-blog/apps/admin && docker compose config > /dev/null && echo admin=ok
```

Both must print `ok`.

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/blog/docker-compose.yml apps/admin/docker-compose.yml
git commit -m "refactor(blog,admin): prepare frontends for blue-green

Replace single service with blue/green variants, drop host port
publishes (the new reverse-proxy takes over 3000/3001), rename
containers to blog-blue and admin-blue. No code or env changes —
the frontends still talk to giwon-blog-api-blog:8080, which will
resolve to the new reverse-proxy after K2 cutover."
```

---

## Task 5: Deploy scripts + rollback

**Files:**
- Create: `infra/scripts/deploy-api-next.sh`
- Create: `infra/scripts/deploy-frontend.sh`
- Create: `infra/scripts/rollback-to-kotlin.sh`

- [ ] **Step 1: Write `deploy-api-next.sh`**

Near-verbatim copy of `apps/api/scripts/deploy.sh`, adapted for the new service names. Key changes from the template in the spec:
- `COMPOSE="apps/api-next/docker-compose.prod.yml"`
- `NGINX_CONF="infra/nginx/default.conf"`
- Service names: `api-blog-next-blue/green`, `api-admin-next-blue/green`
- Reverse-proxy container: `giwon-blog-reverse-proxy`
- `set -e`, file lock via `/tmp/giwon-blog-api-next-deploy.lock`
- Healthcheck wait loop: 30 × 5s
- `sed -i` the upstream lines in the nginx config
- `docker exec giwon-blog-reverse-proxy nginx -s reload`
- Stop + rm the old color
- `chmod +x` when committing

- [ ] **Step 2: Write `deploy-frontend.sh`**

Same pattern, but:
- Works on `apps/blog/docker-compose.yml` AND `apps/admin/docker-compose.yml` together
- Service names: `blog-blue/green`, `admin-blue/green`
- `sed -i` updates `blog-frontend` and `admin-frontend` upstream blocks in `infra/nginx/default.conf`
- Separate lock file: `/tmp/giwon-blog-frontend-deploy.lock`

If the healthchecks aren't defined on the frontend compose (they weren't in the original), either add them in Task 4 (safer) or in this script use `docker inspect --format='{{.State.Status}}' blog-green` and just wait for `running`. Choose whichever is less invasive — if the existing frontend Dockerfile has no healthcheck, running-is-enough is fine.

- [ ] **Step 3: Write `rollback-to-kotlin.sh`**

```bash
#!/bin/bash
# Emergency rollback: put the Kotlin stack back in front of traffic.
# Assumes the Kotlin containers are still stopped-but-present on disk
# (K2 does not remove them; K3 is where they get deleted).
set -e

echo "[rollback] stopping the Hono + reverse-proxy stack..."
docker compose -f apps/api-next/docker-compose.prod.yml stop api-blog-next-blue api-admin-next-blue api-blog-next-green api-admin-next-green 2>/dev/null || true
docker compose -f apps/blog/docker-compose.yml stop blog-blue blog-green 2>/dev/null || true
docker compose -f apps/admin/docker-compose.yml stop admin-blue admin-green 2>/dev/null || true
docker compose -f infra/nginx/docker-compose.yml stop reverse-proxy 2>/dev/null || true

echo "[rollback] restarting the Kotlin stack..."
docker compose -f apps/api/docker-compose.yml start nginx api-blog-blue api-admin-blue postgres redis

echo "[rollback] restarting original frontend containers..."
# The original frontend compose has been edited by K2; if rollback is needed,
# restore it with: git show HEAD~<N>:apps/blog/docker-compose.yml > apps/blog/docker-compose.yml
# (same for admin), then `docker compose up -d`. Or use the manual steps below.
echo "[rollback] manual step: frontend compose was edited by K2."
echo "  To restore ORIGINAL blog/admin containers:"
echo "    git stash  # save any pending changes"
echo "    git show <commit-before-K2>:apps/blog/docker-compose.yml > apps/blog/docker-compose.yml"
echo "    git show <commit-before-K2>:apps/admin/docker-compose.yml > apps/admin/docker-compose.yml"
echo "    docker compose -f apps/blog/docker-compose.yml up -d blog"
echo "    docker compose -f apps/admin/docker-compose.yml up -d admin"

echo "[rollback] verify: curl http://localhost:8080/health ; http://localhost:8081/health ; http://localhost:3000/ ; http://localhost:3001/"
```

It's OK for rollback to have manual steps at the end — rollback is a rare, attended operation. Document clearly what the operator must do.

Also document in the script (comments or echo) the DB rollback:
```
# If you applied the dead table drop migration and need those tables back:
#   psql ... -c "CREATE TABLE article_stats (id SERIAL PRIMARY KEY);"
#   psql ... -c "CREATE TABLE daily_article_stats (id SERIAL PRIMARY KEY);"
#   psql ... -c "DELETE FROM drizzle.__drizzle_migrations WHERE hash IN ('<baseline>', '<drop>');"
# Flyway is unaffected; nothing in Kotlin reads these tables anyway.
```

- [ ] **Step 4: Make scripts executable, shellcheck if available**

```bash
cd ~/github/new-blog
chmod +x infra/scripts/*.sh
# Optional: shellcheck
which shellcheck >/dev/null && shellcheck infra/scripts/*.sh || echo "shellcheck not installed, skipping"
bash -n infra/scripts/deploy-api-next.sh
bash -n infra/scripts/deploy-frontend.sh
bash -n infra/scripts/rollback-to-kotlin.sh
```

`bash -n` does a syntax check without executing. All three must pass.

- [ ] **Step 5: Commit**

```bash
cd ~/github/new-blog
git add infra/scripts/deploy-api-next.sh infra/scripts/deploy-frontend.sh infra/scripts/rollback-to-kotlin.sh
git commit -m "feat(infra): add deploy + rollback scripts

deploy-api-next.sh and deploy-frontend.sh are the post-K2 blue-green
deploy scripts (detect current color, build next, healthcheck,
flip nginx upstream via sed + reload, tear down old).
rollback-to-kotlin.sh stops the Hono stack and brings the Kotlin
containers back up — leaves the frontend compose restoration to
a manual git-show step since the compose file was edited by K2."
```

---

## Task 6: Phase 1 verification

**Files:** none

- [ ] **Step 1: Full monorepo lint**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog
bunx turbo run lint --force 2>&1 | tail -10
```
Expected: 5/5 success, 0 errors. Warnings are pre-existing.

- [ ] **Step 2: Full test**

```bash
cd ~/github/new-blog
bun run test 2>&1 | tail -30
```
Expected: blog 38/38, admin-next 92/92, admin 15/15. Core may show the pre-K1 flaky failures (GitHub rate limit / Redis TTL) — those are unrelated to K2 changes.

- [ ] **Step 3: docker compose validate all composes**

```bash
cd ~/github/new-blog
for f in apps/api-next/docker-compose.yml apps/api-next/docker-compose.prod.yml apps/blog/docker-compose.yml apps/admin/docker-compose.yml infra/nginx/docker-compose.yml apps/api/docker-compose.yml; do
  echo "=== $f ==="
  dir=$(dirname "$f")
  file=$(basename "$f")
  if [ "$file" = "docker-compose.prod.yml" ] && [ "$dir" = "apps/api-next" ]; then
    # Prod compose needs dummy env vars to interpolate
    (cd "$dir" && DB_PASSWORD=x ADMIN_JWT_SECRET=$(openssl rand -hex 32) ADMIN_GOOGLE_SUB=x docker compose -f "$file" config > /dev/null)
  else
    (cd "$dir" && docker compose -f "$file" config > /dev/null)
  fi
  echo "exit=$?"
done
```
All six must exit 0. The dev compose (`docker-compose.yml`) and prod compose (`docker-compose.prod.yml`) are validated separately.

- [ ] **Step 4: Report Phase 1 summary**

Report:
- Commit hashes for Tasks 1-5
- Test and lint results
- Confirmation that all compose files validate
- Any surprises or deviations
- Explicit GO/NO-GO for starting Phase 2 cutover

**No commit** — this task is a gate.

---

# Phase 2 — Live Cutover Runbook (manual SSH, pause-and-brief)

**Every Phase 2 task is a pause-and-brief checkpoint. The agent prints the runbook, waits for the user to execute it on the production server, and waits for the user to reply "done" (or "failed: <reason>") before continuing.**

**DO NOT automate SSH from the agent. DO NOT assume state changed. DO NOT proceed past a checkpoint without explicit confirmation.**

## Task 7: Pre-flight checklist

- [ ] **Step 1: Agent presents the checklist**

Print this runbook to the user exactly:

```
═══════════════════════════════════════════════════════════════
  K2 Phase 2 — Pre-flight Checklist
═══════════════════════════════════════════════════════════════

Before anything touches the server, verify and gather:

1. SSH access to the production server
   - Confirm you can SSH in right now
   - Note the monorepo path on the server (default: /opt/blog or ~/blog)

2. Monorepo sync
   - Latest main branch merged (Phase 1 commits included)
   - On the server:
       cd <monorepo-path>
       git fetch
       git checkout main
       git pull
       git log --oneline -5
     → The top commit should match the latest Phase 1 verification commit SHA.

3. Prod environment file
   - cat apps/api-next/.env.example
   - Copy to apps/api-next/.env and fill in:
       DB_PASSWORD=<value-from-apps/api/docker-compose.yml or existing secrets>
       ADMIN_JWT_SECRET=<ideally copy from Kotlin's runtime — check docker inspect api-admin-blue>
       ADMIN_GOOGLE_SUB=<the comma-separated Google sub IDs>
   - Verify: DB_PASSWORD matches the one the Kotlin API uses today
     (docker exec giwon-blog-db env | grep POSTGRES_PASSWORD)

4. Docker network
   - docker network ls | grep blog-network
   - Expected: a single row for blog-network. If missing, something is wrong
     with the existing Kotlin stack — investigate before proceeding.

5. Port availability check (on the server)
   - ss -tlnp 2>/dev/null | grep -E ':(3000|3001|8080|8081)' || sudo lsof -iTCP -sTCP:LISTEN -P | grep -E ':(3000|3001|8080|8081)'
   - Expected: the existing Kotlin/frontend containers holding those ports.
     If anything else is listed, investigate.

6. Rollback readiness
   - Confirm Kotlin compose files still work:
       docker compose -f apps/api/docker-compose.yml config > /dev/null && echo ok
   - Note the current active blue/green color for Kotlin (from the existing deploy.sh logic)

7. DB backup
   - pg_dump the giwon_blog DB to a timestamped file:
       docker exec giwon-blog-db pg_dump -U giwon giwon_blog | gzip > /tmp/giwon_blog_pre_k2_$(date +%Y%m%d_%H%M%S).sql.gz
   - Verify file size is non-trivial.

8. Low-traffic window
   - K2 includes a ~5-10 second downtime window. Pick a time when you're
     OK with that and nobody important is reading the blog.

═══════════════════════════════════════════════════════════════
```

- [ ] **Step 2: Wait for user confirmation**

After presenting, the agent stops and waits. The user replies with either:
- "done" / "완료" — all items checked, proceed to Task 8
- "failed: <reason>" — agent helps debug the specific item, loops back

The agent does NOT proceed without a clear go signal.

---

## Task 8: Bring up Hono backends alongside Kotlin

- [ ] **Step 1: Agent presents the runbook**

```
═══════════════════════════════════════════════════════════════
  K2 Step 2 — Start Hono containers (no traffic yet)
═══════════════════════════════════════════════════════════════

On the server:

1. Build Hono images
   cd <monorepo-path>
   docker compose -f apps/api-next/docker-compose.prod.yml build api-blog-next-blue api-admin-next-blue

   Expected: two builds succeed in a few minutes. First build pulls
   oven/bun:1.3.12-alpine (~70MB). If tsc typecheck fails inside the
   build, STOP and report — we need to fix the code before cutover.

2. Start the containers
   docker compose -f apps/api-next/docker-compose.prod.yml up -d api-blog-next-blue api-admin-next-blue

3. Wait for health
   for i in $(seq 1 30); do
     blog_h=$(docker inspect --format='{{.State.Health.Status}}' api-blog-next-blue 2>/dev/null || echo starting)
     adm_h=$(docker inspect --format='{{.State.Health.Status}}' api-admin-next-blue 2>/dev/null || echo starting)
     echo "$i blog=$blog_h admin=$adm_h"
     if [ "$blog_h" = healthy ] && [ "$adm_h" = healthy ]; then break; fi
     sleep 5
   done

   Expected: both reach 'healthy' within 60 seconds (most likely <30s).

4. If either fails to go healthy:
   docker logs api-blog-next-blue --tail 100
   docker logs api-admin-next-blue --tail 100

   Common causes:
   - DB_PASSWORD wrong → fix .env, docker compose up -d --force-recreate
   - Cannot reach giwon-blog-db → the Kotlin network name changed, check
     docker network inspect blog-network
   - ADMIN_JWT_SECRET too short (< 32 chars) → fix .env

5. Verify NO traffic is flowing to Hono yet
   docker logs api-blog-next-blue | grep -c "GET " || echo "no requests yet — good"
   The Kotlin nginx is still the one accepting traffic. Hono is only
   reachable via its container name from inside the docker network.

═══════════════════════════════════════════════════════════════
```

- [ ] **Step 2: Wait for user confirmation**

User replies "done" (containers healthy, no traffic hitting them yet) or "failed: <details>". On failure, agent helps debug — do not proceed.

---

## Task 9: Apply DB migrations (baseline pre-insert + drop dead tables)

- [ ] **Step 1: Agent presents the runbook**

```
═══════════════════════════════════════════════════════════════
  K2 Step 3 — Apply DB migrations
═══════════════════════════════════════════════════════════════

This step records the drizzle baseline and drops two dead tables.
All changes are on the giwon_blog database. Flyway schema history
is untouched. Kotlin continues serving traffic throughout.

1. Find the captured baseline hash
   - It is documented in apps/api-next/packages/core/drizzle/0000_baseline.meta.md
   - Exact value: look for "Hash:" in the "Dry-run results" section
   - Example placeholder: 7b3255d657ce5f687bddd7b68a0dfae797854ba8c2ac4c03fe6820560fcf0f68

2. Pre-insert the baseline into __drizzle_migrations
   - Pipe the SQL via docker exec into the DB:
     docker exec -i giwon-blog-db psql -U giwon -d giwon_blog <<'SQL'
     CREATE SCHEMA IF NOT EXISTS drizzle;
     CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
       id SERIAL PRIMARY KEY,
       hash text NOT NULL,
       created_at bigint
     );
     INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
     VALUES ('<BASELINE_HASH_FROM_META>', 0);
     SQL

   - Confirm: SELECT hash FROM drizzle.__drizzle_migrations;
     → One row, the baseline hash.

3. Run drizzle-kit migrate from inside an api-blog-next-blue container

   This is cleaner than installing drizzle-kit on the host. The Hono
   container already has the migration files + bun + drizzle-kit.

   docker exec api-blog-next-blue sh -c 'cd packages/core && DATABASE_URL="postgresql://giwon:$DB_PASSWORD@giwon-blog-db:5432/giwon_blog" bun x drizzle-kit migrate'

   Wait — DB_PASSWORD is set as an env in the container. But drizzle-kit
   expands $VAR from the drizzle.config.ts file's process.env, and the
   container's env already has DATABASE_URL... but our compose passes
   DATABASE_URL=postgresql://giwon:${DB_PASSWORD}@... which is already
   resolved at compose time. So just use the resolved DATABASE_URL that
   the container already sees:

   docker exec api-blog-next-blue sh -c 'cd packages/core && bun x drizzle-kit migrate'

   Expected output:
     - "baseline" migration is detected as already applied (skipped)
     - "drop_dead_tables" migration is applied
     - Exit code 0

4. Verify
   docker exec giwon-blog-db psql -U giwon -d giwon_blog -c "\dt"
   → No article_stats, no daily_article_stats in the list
   → Other tables all still present

   docker exec giwon-blog-db psql -U giwon -d giwon_blog -c "SELECT hash FROM drizzle.__drizzle_migrations;"
   → Two rows (baseline + drop_dead_tables)

5. Confirm Kotlin API still happy
   Kotlin has no compile-time or runtime references to the dead tables
   (verified in Plan G2 and K1). The drop is safe. But smoke test it:
   curl -s http://localhost:8080/articles?page=0&size=3 | head
   → Still returns article data

ROLLBACK (if something goes wrong here):
  docker exec giwon-blog-db psql -U giwon -d giwon_blog <<'SQL'
  CREATE TABLE article_stats (id SERIAL PRIMARY KEY);
  CREATE TABLE daily_article_stats (id SERIAL PRIMARY KEY);
  DELETE FROM drizzle.__drizzle_migrations;
  SQL
  (This recreates empty tables — matches the original schema shape minimally.)

═══════════════════════════════════════════════════════════════
```

- [ ] **Step 2: Wait for user confirmation**

User confirms the three `SELECT` results. Any mismatch → agent helps debug.

---

## Task 10: Smoke-test Hono via internal network (still no flip)

- [ ] **Step 1: Agent presents the runbook**

```
═══════════════════════════════════════════════════════════════
  K2 Step 4 — Internal smoke (no traffic flip yet)
═══════════════════════════════════════════════════════════════

Hono is healthy, migrations applied. Now we exercise its endpoints
from INSIDE the docker network without touching nginx yet. If
anything fails here, we fix Hono (or rollback) before even thinking
about the flip.

1. Pick a container with network access and curl installed.
   The nginx container is perfect:
   docker exec giwon-blog-api-nginx sh -c 'apk add --no-cache curl 2>/dev/null || true; which curl'

   If curl is unavailable, use wget (alpine nginx image has it):
   alias http='docker exec giwon-blog-api-nginx wget -qO-'

2. Exercise representative endpoints (one per domain):

   # Health
   docker exec giwon-blog-api-nginx wget -qO- http://api-blog-next-blue:8080/health
   # Expected: {"data":{"status":"ok"}}

   docker exec giwon-blog-api-nginx wget -qO- http://api-admin-next-blue:8081/health
   # Expected: {"data":{"status":"ok"}}  (admin/health is public after Plan K Task 5)

   # Books list
   docker exec giwon-blog-api-nginx wget -qO- 'http://api-blog-next-blue:8080/books'
   # Expected: {"data":[...]}  with real book data

   # Series list
   docker exec giwon-blog-api-nginx wget -qO- 'http://api-blog-next-blue:8080/series'

   # Articles list
   docker exec giwon-blog-api-nginx wget -qO- 'http://api-blog-next-blue:8080/articles?page=0&size=3'

   # Sidebar popular articles
   docker exec giwon-blog-api-nginx wget -qO- 'http://api-blog-next-blue:8080/sidebar/popular-articles'

   # Sidebar visitors
   docker exec giwon-blog-api-nginx wget -qO- 'http://api-blog-next-blue:8080/sidebar/visitors'

   # Admin settings requires JWT — skip or mint a token with the prod secret.
   # If you want to test with JWT, you'd need to run openssl/jose against the
   # ADMIN_JWT_SECRET. Optional — browser test in Task 12 covers this.

3. Compare responses to Kotlin for the same endpoints:
   docker exec giwon-blog-api-nginx wget -qO- 'http://api-blog-blue:8080/books'
   # Should be the same shape as the Hono response above.

   Small diffs (ordering, whitespace) are fine. Material diffs (missing
   field, wrong count, 500 error) are blockers — rollback and investigate.

4. Check Hono logs for errors
   docker logs api-blog-next-blue --tail 100 | grep -iE '(error|fail|panic)' || echo "clean"
   docker logs api-admin-next-blue --tail 100 | grep -iE '(error|fail|panic)' || echo "clean"

ROLLBACK: still trivial at this point — just stop the Hono containers.
  docker compose -f apps/api-next/docker-compose.prod.yml stop api-blog-next-blue api-admin-next-blue
  Kotlin is still the only thing serving traffic.

═══════════════════════════════════════════════════════════════
```

- [ ] **Step 2: Wait for user confirmation**

User confirms "all endpoints match" or reports differences. Any ❌ → pause, investigate, possibly rollback to Phase 1 for a code fix.

---

## Task 11: The cutover flip (brief downtime window)

- [ ] **Step 1: Agent presents the runbook**

```
═══════════════════════════════════════════════════════════════
  K2 Step 5 — The Flip
═══════════════════════════════════════════════════════════════

This is THE cutover. Brief downtime (~5-10 seconds) is expected
between the time the old nginx stops and the new reverse-proxy
starts answering requests.

READ ALL STEPS FIRST. Then execute one at a time, quickly.

────────────────────────────────────────
EXECUTE (target window: under 30 seconds)
────────────────────────────────────────

# Step A: stop the old Kotlin nginx (this frees ports 8080, 8081)
docker compose -f apps/api/docker-compose.yml stop nginx

# Step B: stop the old frontend containers (frees ports 3000, 3001)
docker compose -f apps/blog/docker-compose.yml stop blog 2>/dev/null || true
docker compose -f apps/admin/docker-compose.yml stop admin 2>/dev/null || true

# Step C: start the new reverse-proxy (grabs all four ports + aliases)
docker compose -f infra/nginx/docker-compose.yml up -d

# Step D: start the renamed frontends
docker compose -f apps/blog/docker-compose.yml up -d blog-blue
docker compose -f apps/admin/docker-compose.yml up -d admin-blue

# Step E: wait ~3 seconds for everything to register
sleep 3

# Step F: smoke
curl -s -o /dev/null -w "api-blog  http=%{http_code}\n" http://localhost:8080/health
curl -s -o /dev/null -w "api-admin http=%{http_code}\n" http://localhost:8081/health
curl -s -o /dev/null -w "blog      http=%{http_code}\n" http://localhost:3000/
curl -s -o /dev/null -w "admin     http=%{http_code}\n" http://localhost:3001/

EXPECTED:
  api-blog  http=200
  api-admin http=200
  blog      http=200  (may be 307 redirect — also OK)
  admin     http=200  (may be 307 — also OK)

If api-blog or api-admin is 502 or 504:
  → The reverse-proxy cannot reach api-blog-next-blue. Run:
    docker exec giwon-blog-reverse-proxy wget -qO- http://api-blog-next-blue:8080/health
  → If that fails, the Hono container died. docker logs api-blog-next-blue

If blog/admin is 502:
  → The reverse-proxy cannot reach blog-blue / admin-blue. Check:
    docker ps --filter name=blog-blue
    docker ps --filter name=admin-blue
  → If not running, `docker compose -f apps/blog/docker-compose.yml up -d blog-blue`

If all four are ok → proceed to Task 12.

ROLLBACK (if smoke fails and you can't debug in under 2 minutes):
  bash infra/scripts/rollback-to-kotlin.sh
  → Follow its manual steps for frontend compose restoration.

═══════════════════════════════════════════════════════════════
```

- [ ] **Step 2: Wait for user confirmation**

User executes and reports the curl outputs. Only proceed when all four are 200 (or 3xx redirect for frontends).

---

## Task 12: Browser smoke + CRUD verification

- [ ] **Step 1: Agent presents the runbook**

```
═══════════════════════════════════════════════════════════════
  K2 Step 6 — Browser smoke
═══════════════════════════════════════════════════════════════

Open real browsers and click through the site. Curl is necessary
but not sufficient for a blog with client-side hydration.

BLOG (blog.giwon.dev):
  [ ] Home page loads
  [ ] An article detail page loads
  [ ] Image inside an article loads (confirms /images/* routing)
  [ ] Sidebar: popular articles render
  [ ] Sidebar: recent comments render (may be empty if GitHub 403)
  [ ] Sidebar: visitor counter shows a number
  [ ] /series, /books navigation work
  [ ] Analytics page-view tracking fires (check Hono logs:
      docker logs api-blog-next-blue --tail 20 | grep -i 'page-view')

ADMIN (admin.giwon.dev):
  [ ] Login with Google works (JWT issued; if this fails, ADMIN_JWT_SECRET
      or ADMIN_GOOGLE_SUB is wrong in apps/api-next/.env)
  [ ] Dashboard renders with real stats
  [ ] Articles list loads
  [ ] Create a new DRAFT article with a placeholder image
  [ ] Upload the image — confirm file lands under the blog-images volume:
      docker exec api-admin-next-blue ls /data/blog/images/temp
  [ ] Save the article, verify the temp URL was rewritten to /articles/<id>/
      in the database
  [ ] Delete the article, verify the image file is gone from disk

If ANY critical flow fails, document the failure and decide:
  - Minor issue (cosmetic, non-blocking) → ship K2, file a follow-up
  - Blocking issue (auth broken, data corruption, 500s) → rollback

ROLLBACK: bash infra/scripts/rollback-to-kotlin.sh

═══════════════════════════════════════════════════════════════
```

- [ ] **Step 2: Wait for user confirmation**

User reports results. Any blocking issue → pause, debug, possibly rollback.

---

## Task 13: Stop old Kotlin backends (retained for K3 rollback)

- [ ] **Step 1: Agent presents the runbook**

```
═══════════════════════════════════════════════════════════════
  K2 Step 7 — Stop Kotlin (but keep containers for rollback)
═══════════════════════════════════════════════════════════════

At this point Hono is serving traffic successfully. The Kotlin
API containers are idle but still running. Stop them to free
RAM and CPU, but do NOT remove them — we keep them around for
the K2→K3 rollback window.

1. Stop the Kotlin API backends
   docker compose -f apps/api/docker-compose.yml stop api-blog-blue api-admin-blue

   (nginx was already stopped in Step 5.)

2. Confirm they're stopped but still listed
   docker ps -a --filter name=api-blog-blue --filter name=api-admin-blue
   Expected: two rows, STATUS = Exited (0) ...

3. Leave the postgres + redis containers running — they're shared.
   docker ps --filter name=giwon-blog-db --filter name=giwon-blog-redis

4. Record the current state for the K2 close-out:
   docker ps --format '{{.Names}}\t{{.Status}}' | sort

DO NOT:
  ✗ docker rm api-blog-blue api-admin-blue
  ✗ docker image rm any Kotlin image
  ✗ Delete apps/api/ directory

Plan K3 handles all deletion after a few days of observing the new stack.

═══════════════════════════════════════════════════════════════
```

- [ ] **Step 2: Wait for user confirmation**

User confirms Kotlin is stopped but containers remain.

---

## Task 14: K2 close-out

- [ ] **Step 1: Write K2 close-out document**

Create `docs/superpowers/audits/2026-04-15-plan-k2-cutover-log.md` capturing:
- Final `docker ps` output (sanitized if any of it contains credentials)
- Commit hashes of Phase 1 tasks
- DB migration hashes applied
- Time the flip happened
- Any issues encountered + how they were resolved
- Confirmation that rollback window is OPEN
- Go/no-go decision for Plan K3

Template:

```markdown
# Plan K2 Cutover Log

**Date of flip:** <YYYY-MM-DD HH:MM TZ>
**Executed by:** <user>
**Downtime window:** ~<N> seconds

## Phase 1 commits
- Task 1 (Dockerfiles): <SHA>
- Task 2 (api-next compose): <SHA>
- Task 3 (reverse-proxy): <SHA>
- Task 4 (frontend compose): <SHA>
- Task 5 (scripts): <SHA>

## DB migrations applied
- 0000_baseline (pre-inserted, not executed): hash = <hash>
- 0001_drop_dead_tables: executed via drizzle-kit migrate, successful

## Container state at end of K2
<docker ps output>

## Kotlin retained (not deleted)
- api-blog-blue: stopped
- api-admin-blue: stopped
- Kotlin image history: preserved
- apps/api/ source: untouched

## Issues encountered
- <list or "none">

## Rollback window
- OPEN until Plan K3 ships
- Rollback script: infra/scripts/rollback-to-kotlin.sh

## Go/no-go for K3
GO ✅  /  HOLD ⏸
```

- [ ] **Step 2: Commit the log**

```bash
cd ~/github/new-blog
git add docs/superpowers/audits/2026-04-15-plan-k2-cutover-log.md
git commit -m "docs(root): record Plan K2 cutover execution log

Captures the exact flip timestamp, Phase 1 commit trail, DB
migration results, final container state, and rollback-window
status. Kotlin retained until K3."
```

- [ ] **Step 3: Report final summary**

Single message summarizing Plan K2 completion: Phase 1 commits, flip timestamp, any issues, rollback window status, readiness for K3.

---

## Plan K2 Completion Checklist

- [ ] Task 1: Dockerfiles build successfully
- [ ] Task 2: api-next/docker-compose.yml validates
- [ ] Task 3: infra/nginx/ files validate (nginx -t passes)
- [ ] Task 4: frontend compose updates validate
- [ ] Task 5: deploy + rollback scripts pass `bash -n`
- [ ] Task 6: monorepo lint 5/5 + test 4/4 (or same pre-K1 flaky state)
- [ ] Task 7: pre-flight checklist executed on server
- [ ] Task 8: Hono containers up and healthy
- [ ] Task 9: DB migrations applied, dead tables dropped
- [ ] Task 10: internal smoke passes for all domains
- [ ] Task 11: nginx flip successful, all four ports serve 200
- [ ] Task 12: browser smoke passes blog + admin CRUD
- [ ] Task 13: Kotlin backends stopped, retained on disk
- [ ] Task 14: close-out log committed

## Out of Scope

- **apps/api/ deletion** — Plan K3
- **Jenkins SCM reconfiguration** — Plan K3
- **Old frontend repo archival** — Plan K3
- **Root CLAUDE.md layout update** — Plan K3
- **Observability / metrics / alerting** — separate concern
- **Frontend source code changes** — none
- **DNS / Cloudflare changes** — none
