# API Rewrite: Kotlin/Spring Boot → Hono/Bun — Design

**Date:** 2026-04-13
**Status:** Approved for planning
**Scope:** Full rewrite of `apps/api` (Kotlin/Spring Boot/JPA) to Hono/Bun/Drizzle, delivered as a sequence of plans. This document is the design shared by all those plans.

## Motivation

1. **Stack unification** — blog/admin are TS/Next.js. Running a JVM service alongside forces dual-language context switching and dual dependency management.
2. **Resource/cost** — JVM memory + boot time are disproportionate for a personal blog's traffic.
3. **Developer productivity** — Gradle/Spring setup complexity, shared TS types with the frontends later.
4. **Learning** — get hands-on with Hono, Drizzle, and the Bun-native backend stack.

## Migration Strategy

**Phased rewrite on a feature branch, cutover at the end.** Old Kotlin API stays running in production the whole time; the new Hono API has no production traffic until the final cutover plan.

**Rejected:**
- *Big bang single plan* — 114 Kotlin files and ~10 domains don't fit in one plan without losing context and cementing wrong patterns across everything.
- *Strangler pattern* — running two services in parallel behind nginx routing is overkill infrastructure for a personal blog, with no meaningful payoff vs the phased approach.

## Plan Sequence (for context — each has its own plan file)

| # | Plan | Scope |
|---|---|---|
| A | Foundation | Scaffold, Drizzle introspect, auth middleware, `/health` endpoint, test harness |
| B–J | Domain rewrites (9 plans) | One domain per plan: sidebar → settings → book → series → article → analytics → comment → dashboard → image |
| K | Cutover | blog/admin env var swap, delete old Kotlin `apps/api`, rename `apps/api-next` → `apps/api` |
| L | Unified blue-green deploy | Extend existing api deploy script to cover blog + admin + api, atomic nginx upstream swap when all four next-color containers pass health checks |

**This document focuses on Plan A (Foundation) details.** Plans B–J reuse the same decisions. Plans K and L are described at a high level only.

---

## Architectural Decisions

### Process Topology

Two independent Bun processes, mirroring the existing Kotlin split:

- **`api-blog-next`** — port 8080, public read API, no auth, stateless.
- **`api-admin-next`** — port 8081, admin-only, JWT auth required, owns all background schedulers.

**Rationale:** The existing system has schedulers (`TempImageCleanupScheduler`, `VisitorStatsAggregator`, `ArticleStatsAggregator`). Running them in the same process as public traffic would mix request latency with background batch work. Two processes also give clean network-level isolation: blog port is public, admin port binds localhost-only behind nginx.

### Directory Layout

```
apps/api-next/
├── apps/
│   ├── blog/            # Hono app, port 8080 (public)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── routes/
│   │   │   └── middleware/
│   │   ├── package.json # name: "api-blog-next"
│   │   └── tsconfig.json
│   └── admin/           # Hono app + schedulers, port 8081 (auth)
│       ├── src/
│       │   ├── index.ts
│       │   ├── routes/
│       │   ├── middleware/
│       │   └── schedulers/
│       ├── package.json # name: "api-admin-next"
│       └── tsconfig.json
└── packages/
    └── core/            # Shared domain layer consumed by both apps
        ├── src/
        │   ├── db/
        │   │   ├── schema.ts       # drizzle-kit introspect output
        │   │   └── client.ts       # bun:sql + drizzle factory
        │   ├── domains/            # added one-per-plan in Plans B–J
        │   ├── errors.ts
        │   └── env.ts
        └── package.json # name: "@api-next/core"
```

`apps/api-next/apps/*` and `apps/api-next/packages/*` are added to the root `package.json` `workspaces` array. If Bun's nested workspace support is flaky, fall back to flattening to `apps/api-next-blog`, `apps/api-next-admin`, `apps/api-next-core` at the monorepo root.

After the cutover plan (K), `apps/api-next` is renamed to `apps/api` and the old Kotlin tree is deleted.

### Runtime Stack

| Concern | Choice | Rationale |
|---|---|---|
| Runtime | Bun | Given. |
| HTTP framework | Hono | Given. Standard with Bun. |
| DB client | Drizzle ORM + `bun:sql` | Native Bun driver. No native query-engine binary. Closest-to-SQL ergonomics match the learning goal. Schema introspection via `drizzle-kit introspect` fits the migration pattern: read existing JPA-managed Postgres schema → generate `schema.ts`. |
| Schema ownership | JPA (Kotlin) remains canonical during rewrite; Drizzle schema is a read-only reflection | No risk of two tools fighting over migrations. Plan K's cutover hands schema ownership to Drizzle. |
| Test runner | `bun:test` | Zero config, bundled with Bun, Jest-compatible API, pairs with Hono's `app.request()` pattern. admin frontend using vitest is unrelated (different test concerns: React components vs HTTP handlers). |
| Validation | Zod + `@hono/zod-validator` | Hono's standard validator integration. Full type inference for request bodies, query params, and path params. |
| Logger | `pino` (JSON) + `hono-pino` middleware | Structured logs. Overkill for current traffic, cheap to add now, eases future observability. |
| Env/config | `env.ts` with a Zod schema that parses `process.env`; fails fast on boot | Single source of truth, type-safe in app code. |

### Authentication (admin)

The current Kotlin admin API has **no server-side authentication** — protection is only CORS + network isolation. The rewrite will add proper user-level auth because it is the right fix and the incremental cost is small.

**Chosen approach:** short-lived HS256 JWT minted by the admin Next.js server actions, verified by Hono admin middleware, with an allowlist on the token's `sub` claim.

**Flow:**
1. admin Next.js already uses NextAuth v5 with Google OAuth for the human login UI.
2. When admin Next.js makes a server-side fetch to `api-admin-next`, the server action first calls `auth()` to get the NextAuth session. If present, it mints a new HS256 JWT via `jose.SignJWT` with `{ sub: <google-id-from-session>, exp: now + 5min }` and a shared secret.
3. The JWT is attached as `Authorization: Bearer <token>` to the fetch.
4. `api-admin-next` Hono middleware verifies the JWT with `jose.jwtVerify(secret)`. On success, it checks `sub` against `ADMIN_GOOGLE_SUB` (CSV env var). On any failure, returns 401 `{ message: "Unauthorized" }`.

**Why this flavor (not NextAuth internal JWE):** NextAuth v5's default session JWT is encrypted (JWE) using keys derived from `NEXTAUTH_SECRET`. Decrypting it in another service couples that service to NextAuth's internal format across versions. A separately-minted short-lived HS256 token decouples admin API from NextAuth's internals — the only shared surface is "a standard signed JWT with a shared secret" which is stable.

**Environment variables:**
- `ADMIN_JWT_SECRET` — HS256 secret, same on both admin Next.js and admin API processes.
- `ADMIN_GOOGLE_SUB` — comma-separated list of allowed Google `sub` values. Typically just one (the owner). Requests whose JWT `sub` is not in the list are rejected.

### Response Envelope

**Identical to Kotlin, for zero frontend churn at cutover:**

- **Success:** HTTP 2xx, body `{ "data": <T> }`
- **Error (business):** HTTP 4xx/5xx, body `{ "message": <string> }`

Implemented via a helper on the Hono context (e.g. `c.json({ data })`) and a global `app.onError` handler that catches `BusinessError` and unknown errors, serializes to `{ message }` with the appropriate status. A later (out-of-scope) plan can unify the shape once both frontends are ready for the change.

### Error Handling

- Custom `BusinessError` class mirroring Kotlin's `BusinessException` (fields: `status: number`, `message: string`, optional `code: string`).
- An `ErrorCode` enum/record in `packages/core/src/errors.ts` corresponding to Kotlin's existing error codes. Populated incrementally in Plans B–J as each domain is ported.
- Hono `app.onError((err, c) => ...)` in each app's `index.ts`: if `err instanceof BusinessError`, respond `{ message: err.message }` with `err.status`; otherwise log via pino and respond 500 `{ message: "Internal server error" }`.

### Database Access

- `packages/core/src/db/client.ts` exports a singleton drizzle instance created from `bun:sql` using `env.DATABASE_URL`.
- `packages/core/src/db/schema.ts` is generated once via `drizzle-kit introspect` against the dev Postgres at the start of Plan A, then committed and treated as read-only until Plan K.
- Domain code in `packages/core/src/domains/<domain>/repo.ts` imports tables from `schema.ts` and builds queries with the drizzle query builder.
- No connection pool tuning beyond Bun defaults in Plan A. Revisit if needed later.

### Logging

- `pino` in JSON mode, piped through `hono-pino` middleware for request logging.
- Each request gets a log line with method, path, status, duration, and (on admin) the `sub` from the verified JWT.
- In dev, wrap pino output with `pino-pretty` for readable terminal output.

---

## Plan A Deliverables (Foundation)

On completion of Plan A, the following MUST be true:

1. `apps/api-next/` exists with the directory layout above and is recognized as Bun workspaces by `bun install` at the monorepo root.
2. `drizzle`, `drizzle-kit`, `hono`, `zod`, `@hono/zod-validator`, `jose`, `pino`, `hono-pino` are installed in the appropriate workspace.
3. `packages/core/src/db/schema.ts` has been generated by `drizzle-kit introspect` from the dev Postgres instance and committed. The file contains tables for at least: `articles`, `series`, `books`, `visitor_sessions`, `daily_article_stats`, `daily_visitor_stats`, `page_views`, `batch_job_log`, `settings`, and any others the introspection surfaces.
4. `packages/core/src/env.ts` exports a validated `env` object built from `process.env` via Zod. Required keys: `DATABASE_URL`, `ADMIN_JWT_SECRET`, `ADMIN_GOOGLE_SUB`, `NODE_ENV`, `LOG_LEVEL`.
5. `packages/core/src/errors.ts` exports `BusinessError` and an (initially empty) `ErrorCode` record.
6. Common middleware modules exist under each app's `src/middleware/`: `errorHandler`, `requestLogger`, `cors`. The admin app additionally has `jwtAuth`.
7. `apps/blog/src/index.ts` boots a Hono app on port 8080 with a single route `GET /health` that issues `SELECT 1` against the DB via drizzle and responds `{ data: { status: "ok" } }`.
8. `apps/admin/src/index.ts` boots a Hono app on port 8081 with the JWT middleware applied to all routes and a single route `GET /health` behaving identically to blog's health endpoint. No schedulers are registered yet.
9. `bun:test` integration tests exist and pass:
   - blog: `GET /health` returns 200 with the expected envelope and DB was actually queried.
   - admin: `GET /health` with valid JWT returns 200; with missing JWT returns 401; with invalid-signature JWT returns 401; with valid signature but `sub` not in allowlist returns 401.
10. `bun run dev` at `apps/api-next/apps/blog` and `apps/api-next/apps/admin` both start cleanly with no unhandled errors or missing-env crashes (given the `.env` has been populated).
11. `turbo run build`, `turbo run lint`, `turbo run test` at the monorepo root all succeed including the new workspaces.
12. A local `.env.example` at `apps/api-next/` documents every env variable. The real `.env` is gitignored.

### Plan A Non-Goals

- No domain endpoints besides `/health`.
- No Redis.
- No schedulers (added in Plans B–J as their domains are ported).
- No Docker images, Dockerfiles, or deploy script changes (Plan L).
- No changes to blog/admin frontend env vars (Plan K).
- No changes to the existing Kotlin `apps/api` tree.

---

## Out of Scope for This Document

- The detailed task breakdown for Plans B–J (each gets its own planning session, reusing decisions from this design).
- Exact contents of Plan K and Plan L (written when their predecessors complete).
- Envelope shape unification (`{ data, error }`) — deferred to a post-cutover plan once both frontends can be updated together.
- Redis caching layer port.
- Image storage refactor (if the current local-disk strategy changes).
