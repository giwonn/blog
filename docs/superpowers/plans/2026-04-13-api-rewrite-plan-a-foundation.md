# API Rewrite — Plan A: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Hono/Bun/Drizzle foundation for the new API at `apps/api-next/` (two Bun processes — `api-blog-next`, `api-admin-next` — sharing `@api-next/core`), with `/health` endpoints that hit Postgres via drizzle, admin JWT auth, and `bun:test` coverage.

**Architecture:** Nested Bun workspaces under `apps/api-next/{apps/*,packages/*}`. Blog is public and unauthenticated. Admin requires a short-lived HS256 JWT minted by the admin Next.js server actions. Both apps share a `@api-next/core` package containing the drizzle schema (generated via `drizzle-kit introspect` from the existing JPA-managed Postgres), zod-validated env, and `BusinessError` / error codes.

**Tech Stack:** Bun 1.3, Hono 4, drizzle-orm + drizzle-kit, `bun:sql` (Bun native Postgres driver), jose (JWT), zod, pino, `bun:test`.

**Design reference:** `docs/superpowers/specs/2026-04-13-api-rewrite-design.md`

---

## Scope Check

This plan is ONLY Plan A (foundation). It delivers two Bun processes each exposing `/health`, a shared `core` package with drizzle schema + env + errors + db client, and a test suite that proves the stack is wired end-to-end. No domain endpoints, no schedulers, no Docker, no Kotlin changes. Plans B–J (domains), Plan K (cutover), and Plan L (blue-green) are separate plans tracked in the design spec.

## File Structure

Final layout added/touched by this plan:

```
~/github/new-blog/
├── package.json                                      # workspaces array: add 2 globs
└── apps/api-next/
    ├── .env.example                                  # documented env vars
    ├── .gitignore                                    # .env, .env.*, !.env.example, !.env.test
    ├── .env.test                                     # committed, test fixture values only
    ├── tsconfig.base.json                            # shared TS compiler options
    ├── apps/
    │   ├── blog/
    │   │   ├── package.json                          # name: api-blog-next
    │   │   ├── tsconfig.json                         # extends ../../../tsconfig.base.json
    │   │   ├── src/
    │   │   │   ├── app.ts                            # Hono app factory (testable)
    │   │   │   ├── index.ts                          # Bun.serve entry (imports app)
    │   │   │   ├── middleware/
    │   │   │   │   ├── errorHandler.ts
    │   │   │   │   └── requestLogger.ts
    │   │   │   └── routes/
    │   │   │       └── health.ts
    │   │   └── test/
    │   │       └── health.test.ts
    │   └── admin/
    │       ├── package.json                          # name: api-admin-next
    │       ├── tsconfig.json
    │       ├── src/
    │       │   ├── app.ts
    │       │   ├── index.ts
    │       │   ├── middleware/
    │       │   │   ├── errorHandler.ts               # shared impl; imported from core later
    │       │   │   ├── requestLogger.ts
    │       │   │   └── jwtAuth.ts
    │       │   └── routes/
    │       │       └── health.ts
    │       └── test/
    │           ├── jwtAuth.test.ts
    │           └── health.test.ts
    └── packages/core/
        ├── package.json                              # name: @api-next/core
        ├── tsconfig.json
        ├── drizzle.config.ts
        └── src/
            ├── index.ts                              # re-exports env, errors, db
            ├── env.ts
            ├── errors.ts
            └── db/
                ├── client.ts
                └── schema.ts                         # drizzle-kit introspect output
```

**Responsibilities:**
- `packages/core` — all shared runtime code (db, env, errors). Apps import from `@api-next/core` or `@api-next/core/db`.
- `apps/blog` — public read API process. Only `/health` in this plan.
- `apps/admin` — admin API process + JWT auth. Only `/health` in this plan.
- `tsconfig.base.json` — one place for compiler options; each workspace extends it.

---

## Task 1: Prerequisites and dev Postgres

**Files:**
- Inspect: `apps/api/docker-compose.yml`
- Create (if missing): nothing — dev DB is reused from the existing Kotlin setup

- [ ] **Step 1: Verify tool versions**

Run:
```bash
bun --version
git --version
docker --version
```
Expected: bun ≥ 1.3 (we are on 1.3.12), git ≥ 2.30, docker installed.

- [ ] **Step 2: Start the dev Postgres from the existing Kotlin docker-compose**

Run:
```bash
cd ~/github/new-blog/apps/api && docker compose up -d postgres
docker ps --format '{{.Names}}\t{{.Status}}' | grep postgres
```
Expected: one postgres container reported as `Up`. If it was already running, that's fine.

- [ ] **Step 3: Record the DATABASE_URL**

Inspect `apps/api/docker-compose.yml` to find the postgres service's `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and the host port mapped to container 5432. Construct the URL as `postgresql://<user>:<password>@localhost:<port>/<db>`.

Verify connectivity:
```bash
psql "<DATABASE_URL>" -c "SELECT 1"
```
Expected: `?column?\n----------\n1` output. If `psql` is not installed, use `docker exec <postgres-container> psql -U <user> -d <db> -c "SELECT 1"` instead.

**Save this DATABASE_URL** — you will paste it into `apps/api-next/.env` in Task 5 and into `apps/api-next/.env.test` in Task 14.

No commits in this task.

---

## Task 2: Scaffold directory tree and register workspaces

**Files:**
- Create: `apps/api-next/` directory tree (empty for now)
- Create: `apps/api-next/.gitignore`
- Create: `apps/api-next/tsconfig.base.json`
- Modify: `package.json` (root) — add two globs to `workspaces`

- [ ] **Step 1: Create the directory tree**

Run:
```bash
cd ~/github/new-blog
mkdir -p apps/api-next/apps/blog/src/{middleware,routes} apps/api-next/apps/blog/test
mkdir -p apps/api-next/apps/admin/src/{middleware,routes} apps/api-next/apps/admin/test
mkdir -p apps/api-next/packages/core/src/db
```

- [ ] **Step 2: Create `apps/api-next/.gitignore`**

Write `~/github/new-blog/apps/api-next/.gitignore`:

```gitignore
node_modules/
dist/
.turbo/
*.log

# Env files
.env
.env.local
.env.*.local
!.env.example
!.env.test

# Drizzle-kit introspect staging (schema.ts is the real output and IS committed)
drizzle/meta/
```

- [ ] **Step 3: Create `apps/api-next/tsconfig.base.json`**

Write `~/github/new-blog/apps/api-next/tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "types": ["bun"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowJs": false,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 4: Add workspaces globs to root `package.json`**

Edit `~/github/new-blog/package.json` — update the `workspaces` array to:

```json
  "workspaces": [
    "apps/blog",
    "apps/admin",
    "apps/api-next/apps/*",
    "apps/api-next/packages/*",
    "packages/*"
  ],
```

- [ ] **Step 5: Commit the scaffold shell**

```bash
cd ~/github/new-blog
git add apps/api-next/.gitignore apps/api-next/tsconfig.base.json package.json
git commit -m "chore(api): scaffold api-next directory and register bun workspaces

Adds the apps/api-next/ tree placeholder with a shared tsconfig.base.json
and registers apps/api-next/{apps,packages}/* globs in the monorepo
workspaces list. Subsequent tasks populate the actual workspaces."
```

---

## Task 3: Create `@api-next/core` package and install shared dependencies

**Files:**
- Create: `apps/api-next/packages/core/package.json`
- Create: `apps/api-next/packages/core/tsconfig.json`
- Modify: `bun.lock` (auto-updated by `bun install`)

- [ ] **Step 1: Create `packages/core/package.json`**

Write `~/github/new-blog/apps/api-next/packages/core/package.json`:

```json
{
  "name": "@api-next/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./db": "./src/db/client.ts",
    "./env": "./src/env.ts",
    "./errors": "./src/errors.ts"
  },
  "scripts": {
    "db:introspect": "bunx drizzle-kit introspect",
    "lint": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "drizzle-orm": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "drizzle-kit": "latest",
    "typescript": "^5.6.0",
    "@types/bun": "latest"
  }
}
```

- [ ] **Step 2: Create `packages/core/tsconfig.json`**

Write `~/github/new-blog/apps/api-next/packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts", "drizzle.config.ts"]
}
```

- [ ] **Step 3: Install from the monorepo root**

Run:
```bash
cd ~/github/new-blog && bun install
```
Expected: bun resolves the new workspace, adds drizzle-orm/drizzle-kit/zod/typescript/@types/bun. No errors about duplicate workspace names.

- [ ] **Step 4: Verify workspace is visible**

Run:
```bash
bun pm ls --all 2>&1 | grep -E '@api-next/core|drizzle-orm|drizzle-kit|zod' | head
```
Expected: lines showing `@api-next/core`, `drizzle-orm`, `drizzle-kit`, `zod`.

- [ ] **Step 5: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/package.json apps/api-next/packages/core/tsconfig.json bun.lock
git commit -m "feat(api): create @api-next/core package with drizzle/zod deps"
```

---

## Task 4: Introspect existing Postgres schema into `schema.ts`

**Files:**
- Create: `apps/api-next/packages/core/drizzle.config.ts`
- Create: `apps/api-next/packages/core/src/db/schema.ts` (generated)
- Create (temporary): `apps/api-next/.env` (gitignored, holds DATABASE_URL for local use)

- [ ] **Step 1: Create the temporary local `.env`**

Write `~/github/new-blog/apps/api-next/.env` (gitignored, do not commit):

```
DATABASE_URL=<paste the URL from Task 1 Step 3>
ADMIN_JWT_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef
ADMIN_GOOGLE_SUB=dev-local-sub
NODE_ENV=development
LOG_LEVEL=info
BLOG_PORT=8080
ADMIN_PORT=8081
```

Verify it is gitignored:
```bash
cd ~/github/new-blog && git status --short apps/api-next/.env
```
Expected: no output (ignored).

- [ ] **Step 2: Create `drizzle.config.ts`**

Write `~/github/new-blog/apps/api-next/packages/core/drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  introspect: {
    casing: "preserve",
  },
});
```

- [ ] **Step 3: Run introspect**

Run from the core package dir (Bun auto-loads `../../.env` only for the same dir, so export manually):
```bash
cd ~/github/new-blog/apps/api-next/packages/core
export $(grep -v '^#' ../../.env | xargs)
bunx drizzle-kit introspect
```
Expected: prints a summary ("Pulled X tables, Y enums") and writes `src/db/schema.ts` plus a `drizzle/` directory with meta.

- [ ] **Step 4: Sanity-check the generated schema**

Run:
```bash
head -40 ~/github/new-blog/apps/api-next/packages/core/src/db/schema.ts
grep -E '^export const ' ~/github/new-blog/apps/api-next/packages/core/src/db/schema.ts | head -20
```
Expected: at minimum, exports for `articles`, `series`, `books`, `visitorSessions` (or `visitor_sessions`), and `dailyArticleStats` (naming depends on introspect `casing: "preserve"`). If any of the core tables listed in the design spec are missing, STOP and check whether the Postgres DB is the correct one — the JPA app may need to be booted once to let Flyway/Liquibase run migrations.

- [ ] **Step 5: Commit the generated schema**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/drizzle.config.ts apps/api-next/packages/core/src/db/schema.ts
git commit -m "feat(api): introspect existing Postgres into drizzle schema

Generated via drizzle-kit introspect from the dev DB managed by the
legacy Kotlin/JPA app. This schema.ts is treated as read-only until
Plan K's cutover hands schema ownership to drizzle."
```

`apps/api-next/packages/core/drizzle/` stays gitignored — only `schema.ts` is committed.

---

## Task 5: `@api-next/core` runtime modules (env, errors, db client, entry)

**Files:**
- Create: `apps/api-next/packages/core/src/env.ts`
- Create: `apps/api-next/packages/core/src/errors.ts`
- Create: `apps/api-next/packages/core/src/db/client.ts`
- Create: `apps/api-next/packages/core/src/index.ts`
- Create: `apps/api-next/packages/core/test/env.test.ts`
- Create: `apps/api-next/packages/core/test/errors.test.ts`

- [ ] **Step 1: Write `src/env.ts`**

Write `~/github/new-blog/apps/api-next/packages/core/src/env.ts`:

```ts
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  ADMIN_JWT_SECRET: z.string().min(32, "ADMIN_JWT_SECRET must be at least 32 chars"),
  ADMIN_GOOGLE_SUB: z
    .string()
    .min(1)
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  BLOG_PORT: z.coerce.number().int().positive().default(8080),
  ADMIN_PORT: z.coerce.number().int().positive().default(8081),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${formatted}`);
  }
  return result.data;
}

export const env = loadEnv();
```

- [ ] **Step 2: Write `test/env.test.ts`**

Write `~/github/new-blog/apps/api-next/packages/core/test/env.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { loadEnv } from "../src/env";

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  ADMIN_JWT_SECRET: "x".repeat(32),
  ADMIN_GOOGLE_SUB: "google-sub-1,google-sub-2",
};

describe("loadEnv", () => {
  it("parses a valid env and applies defaults", () => {
    const env = loadEnv(base as NodeJS.ProcessEnv);
    expect(env.DATABASE_URL).toBe(base.DATABASE_URL);
    expect(env.ADMIN_GOOGLE_SUB).toEqual(["google-sub-1", "google-sub-2"]);
    expect(env.NODE_ENV).toBe("development");
    expect(env.BLOG_PORT).toBe(8080);
    expect(env.ADMIN_PORT).toBe(8081);
  });

  it("rejects a short ADMIN_JWT_SECRET", () => {
    expect(() =>
      loadEnv({ ...base, ADMIN_JWT_SECRET: "short" } as NodeJS.ProcessEnv),
    ).toThrow(/ADMIN_JWT_SECRET/);
  });

  it("rejects a missing DATABASE_URL", () => {
    const { DATABASE_URL: _, ...rest } = base;
    expect(() => loadEnv(rest as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });
});
```

- [ ] **Step 3: Run the env test and watch it fail on import (module-level `env` parse)**

Run:
```bash
cd ~/github/new-blog/apps/api-next/packages/core
export $(grep -v '^#' ../../.env | xargs)
bun test test/env.test.ts
```
Expected: 3 passing tests. The module-level `export const env = loadEnv()` only runs because env vars are exported above. If the test runner complains about the top-level `loadEnv()` call, proceed — the tests use their own `loadEnv(source)` call with a local object.

If the module-level parse is fragile in tests, convert `src/env.ts` to lazy-init:

```ts
let _env: Env | undefined;
export function getEnv(): Env {
  if (!_env) _env = loadEnv();
  return _env;
}
```

and update callers to use `getEnv()` instead of `env`. Prefer this form if the initial form breaks tests.

- [ ] **Step 4: Write `src/errors.ts`**

Write `~/github/new-blog/apps/api-next/packages/core/src/errors.ts`:

```ts
export type ErrorCodeValue = {
  status: number;
  message: string;
};

export const ErrorCode = {
  UNAUTHORIZED: { status: 401, message: "Unauthorized" },
  INTERNAL: { status: 500, message: "Internal server error" },
} as const satisfies Record<string, ErrorCodeValue>;

export type ErrorCodeKey = keyof typeof ErrorCode;

export class BusinessError extends Error {
  readonly status: number;
  readonly code?: ErrorCodeKey;

  constructor(status: number, message: string, code?: ErrorCodeKey) {
    super(message);
    this.name = "BusinessError";
    this.status = status;
    this.code = code;
  }

  static from(code: ErrorCodeKey): BusinessError {
    const entry = ErrorCode[code];
    return new BusinessError(entry.status, entry.message, code);
  }
}
```

- [ ] **Step 5: Write `test/errors.test.ts`**

Write `~/github/new-blog/apps/api-next/packages/core/test/errors.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { BusinessError, ErrorCode } from "../src/errors";

describe("BusinessError", () => {
  it("carries status, message, and optional code", () => {
    const err = new BusinessError(418, "teapot", "UNAUTHORIZED");
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(418);
    expect(err.message).toBe("teapot");
    expect(err.code).toBe("UNAUTHORIZED");
  });

  it("constructs from an ErrorCode", () => {
    const err = BusinessError.from("UNAUTHORIZED");
    expect(err.status).toBe(401);
    expect(err.message).toBe("Unauthorized");
    expect(err.code).toBe("UNAUTHORIZED");
  });

  it("exposes canonical error entries", () => {
    expect(ErrorCode.INTERNAL).toEqual({ status: 500, message: "Internal server error" });
  });
});
```

- [ ] **Step 6: Run errors test**

Run:
```bash
cd ~/github/new-blog/apps/api-next/packages/core
bun test test/errors.test.ts
```
Expected: 3 passing tests.

- [ ] **Step 7: Write `src/db/client.ts`**

Write `~/github/new-blog/apps/api-next/packages/core/src/db/client.ts`:

```ts
import { drizzle } from "drizzle-orm/bun-sql";
import { env } from "../env";
import * as schema from "./schema";

export const db = drizzle(env.DATABASE_URL, { schema });
export type DB = typeof db;
export { schema };
```

- [ ] **Step 8: Write `src/index.ts`**

Write `~/github/new-blog/apps/api-next/packages/core/src/index.ts`:

```ts
export { env, loadEnv, type Env } from "./env";
export { BusinessError, ErrorCode, type ErrorCodeKey } from "./errors";
export { db, schema, type DB } from "./db/client";
```

- [ ] **Step 9: Type-check core in isolation**

Run:
```bash
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
```
Expected: no output, exit 0. If `drizzle-orm/bun-sql` cannot be found, ensure `drizzle-orm` is installed (rerun `bun install` at the monorepo root).

- [ ] **Step 10: Commit core**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src apps/api-next/packages/core/test
git commit -m "feat(api): add @api-next/core runtime modules (env, errors, db client)

- env.ts: zod-validated process.env with typed output
- errors.ts: BusinessError + initial ErrorCode record
- db/client.ts: drizzle/bun-sql client singleton
- index.ts: re-exports
Includes bun:test coverage for env and errors."
```

---

## Task 6: Scaffold `api-blog-next` package

**Files:**
- Create: `apps/api-next/apps/blog/package.json`
- Create: `apps/api-next/apps/blog/tsconfig.json`

- [ ] **Step 1: Write `apps/blog/package.json`**

Write `~/github/new-blog/apps/api-next/apps/blog/package.json`:

```json
{
  "name": "api-blog-next",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun --hot run src/index.ts",
    "start": "bun run src/index.ts",
    "lint": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "@api-next/core": "workspace:*",
    "hono": "latest",
    "pino": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/bun": "latest"
  }
}
```

- [ ] **Step 2: Write `apps/blog/tsconfig.json`**

Write `~/github/new-blog/apps/api-next/apps/blog/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: Install**

Run:
```bash
cd ~/github/new-blog && bun install
```
Expected: `api-blog-next` resolved as workspace; hono/pino/zod added.

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/blog/package.json apps/api-next/apps/blog/tsconfig.json bun.lock
git commit -m "feat(api): scaffold api-blog-next workspace"
```

---

## Task 7: Blog middleware (error handler + request logger)

**Files:**
- Create: `apps/api-next/apps/blog/src/middleware/errorHandler.ts`
- Create: `apps/api-next/apps/blog/src/middleware/requestLogger.ts`

- [ ] **Step 1: Write `errorHandler.ts`**

Write `~/github/new-blog/apps/api-next/apps/blog/src/middleware/errorHandler.ts`:

```ts
import type { ErrorHandler } from "hono";
import { BusinessError, ErrorCode } from "@api-next/core";

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof BusinessError) {
    return c.json({ message: err.message }, err.status as 400);
  }
  console.error("[unhandled]", err);
  const internal = ErrorCode.INTERNAL;
  return c.json({ message: internal.message }, internal.status as 500);
};
```

(The `as 400` / `as 500` casts satisfy Hono's typed status code parameter. Hono accepts numeric status via its `StatusCode` union; casting to a known literal is the simplest workaround for a dynamic status from `BusinessError`.)

- [ ] **Step 2: Write `requestLogger.ts`**

Write `~/github/new-blog/apps/api-next/apps/blog/src/middleware/requestLogger.ts`:

```ts
import type { MiddlewareHandler } from "hono";
import { pino } from "pino";
import { env } from "@api-next/core";

const logger = pino({ level: env.LOG_LEVEL, name: "api-blog-next" });

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const start = performance.now();
  await next();
  const ms = (performance.now() - start).toFixed(1);
  logger.info(
    { method: c.req.method, path: c.req.path, status: c.res.status, ms },
    "request",
  );
};

export { logger };
```

- [ ] **Step 3: Type-check**

Run:
```bash
cd ~/github/new-blog/apps/api-next/apps/blog
bunx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/blog/src/middleware
git commit -m "feat(api): add blog error handler and pino request logger middleware"
```

---

## Task 8: Blog `/health` route (TDD)

**Files:**
- Create: `apps/api-next/apps/blog/src/app.ts`
- Create: `apps/api-next/apps/blog/src/routes/health.ts`
- Create: `apps/api-next/apps/blog/test/health.test.ts`

- [ ] **Step 1: Write the failing test first**

Write `~/github/new-blog/apps/api-next/apps/blog/test/health.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { createApp } from "../src/app";

describe("GET /health", () => {
  const app = createApp();

  it("returns 200 with the success envelope after querying the DB", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ data: { status: "ok" } });
  });

  it("does not leak stack traces on unknown routes", async () => {
    const res = await app.request("/does-not-exist");
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run:
```bash
cd ~/github/new-blog/apps/api-next/apps/blog
export $(grep -v '^#' ../../.env | xargs)
bun test test/health.test.ts
```
Expected: FAIL — `Cannot find module '../src/app'`.

- [ ] **Step 3: Implement the health route**

Write `~/github/new-blog/apps/api-next/apps/blog/src/routes/health.ts`:

```ts
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db } from "@api-next/core";

export const healthRoute = new Hono();

healthRoute.get("/", async (c) => {
  await db.execute(sql`SELECT 1`);
  return c.json({ data: { status: "ok" } });
});
```

- [ ] **Step 4: Implement the app factory**

Write `~/github/new-blog/apps/api-next/apps/blog/src/app.ts`:

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { errorHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";
import { healthRoute } from "./routes/health";

export function createApp() {
  const app = new Hono();
  app.use("*", requestLogger);
  app.use("*", cors({ origin: "*" }));
  app.route("/health", healthRoute);
  app.onError(errorHandler);
  return app;
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run:
```bash
cd ~/github/new-blog/apps/api-next/apps/blog
export $(grep -v '^#' ../../.env | xargs)
bun test test/health.test.ts
```
Expected: 2 passing tests. If the DB test fails with a connection error, check that the Postgres container from Task 1 is still up and the DATABASE_URL is correct.

- [ ] **Step 6: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/blog/src/app.ts apps/api-next/apps/blog/src/routes apps/api-next/apps/blog/test
git commit -m "feat(api): add blog /health endpoint with drizzle SELECT 1 + tests"
```

---

## Task 9: Blog `index.ts` entry + `bun run dev` smoke

**Files:**
- Create: `apps/api-next/apps/blog/src/index.ts`

- [ ] **Step 1: Write the entry**

Write `~/github/new-blog/apps/api-next/apps/blog/src/index.ts`:

```ts
import { createApp } from "./app";
import { env } from "@api-next/core";

const app = createApp();

export default {
  fetch: app.fetch,
  port: env.BLOG_PORT,
};
```

- [ ] **Step 2: Start it and curl `/health`**

Run (in one terminal):
```bash
cd ~/github/new-blog/apps/api-next/apps/blog
export $(grep -v '^#' ../../.env | xargs)
bun run src/index.ts &
BLOG_PID=$!
sleep 1
curl -s http://localhost:8080/health
kill $BLOG_PID 2>/dev/null
```
Expected: `{"data":{"status":"ok"}}` printed. No stack traces on shutdown.

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/blog/src/index.ts
git commit -m "feat(api): add blog index.ts entry (port 8080)"
```

---

## Task 10: Scaffold `api-admin-next` package

**Files:**
- Create: `apps/api-next/apps/admin/package.json`
- Create: `apps/api-next/apps/admin/tsconfig.json`

- [ ] **Step 1: Write `apps/admin/package.json`**

Write `~/github/new-blog/apps/api-next/apps/admin/package.json`:

```json
{
  "name": "api-admin-next",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun --hot run src/index.ts",
    "start": "bun run src/index.ts",
    "lint": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "@api-next/core": "workspace:*",
    "hono": "latest",
    "jose": "latest",
    "pino": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/bun": "latest"
  }
}
```

- [ ] **Step 2: Write `apps/admin/tsconfig.json`**

Write `~/github/new-blog/apps/api-next/apps/admin/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: Install**

Run:
```bash
cd ~/github/new-blog && bun install
```
Expected: `api-admin-next` resolved; `jose` added.

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/admin/package.json apps/api-next/apps/admin/tsconfig.json bun.lock
git commit -m "feat(api): scaffold api-admin-next workspace"
```

---

## Task 11: Admin `jwtAuth` middleware (TDD — 4 cases)

**Files:**
- Create: `apps/api-next/apps/admin/src/middleware/jwtAuth.ts`
- Create: `apps/api-next/apps/admin/src/middleware/errorHandler.ts` (same impl as blog, import from local)
- Create: `apps/api-next/apps/admin/src/middleware/requestLogger.ts`
- Create: `apps/api-next/apps/admin/test/jwtAuth.test.ts`

- [ ] **Step 1: Copy error handler + request logger from blog**

Write `~/github/new-blog/apps/api-next/apps/admin/src/middleware/errorHandler.ts`:

```ts
import type { ErrorHandler } from "hono";
import { BusinessError, ErrorCode } from "@api-next/core";

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof BusinessError) {
    return c.json({ message: err.message }, err.status as 400);
  }
  console.error("[unhandled]", err);
  const internal = ErrorCode.INTERNAL;
  return c.json({ message: internal.message }, internal.status as 500);
};
```

Write `~/github/new-blog/apps/api-next/apps/admin/src/middleware/requestLogger.ts`:

```ts
import type { MiddlewareHandler } from "hono";
import { pino } from "pino";
import { env } from "@api-next/core";

const logger = pino({ level: env.LOG_LEVEL, name: "api-admin-next" });

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const start = performance.now();
  await next();
  const ms = (performance.now() - start).toFixed(1);
  logger.info(
    {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms,
      sub: c.get("userSub"),
    },
    "request",
  );
};

export { logger };
```

(These files are duplicated from blog intentionally. DRY is addressed in a later plan when we extract shared middleware into `@api-next/core/middleware`; doing it now adds coupling before there's a second consumer with real divergence to measure.)

- [ ] **Step 2: Write the failing `jwtAuth.test.ts` first**

Write `~/github/new-blog/apps/api-next/apps/admin/test/jwtAuth.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { SignJWT } from "jose";
import { jwtAuth } from "../src/middleware/jwtAuth";
import { env } from "@api-next/core";

const secret = new TextEncoder().encode(env.ADMIN_JWT_SECRET);

async function mintToken(opts: {
  sub: string;
  expSecondsFromNow?: number;
  secretOverride?: Uint8Array;
}) {
  return await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(opts.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + (opts.expSecondsFromNow ?? 300))
    .sign(opts.secretOverride ?? secret);
}

function buildTestApp() {
  const app = new Hono();
  app.use("*", jwtAuth);
  app.get("/ping", (c) => c.json({ data: { sub: c.get("userSub") } }));
  return app;
}

describe("jwtAuth middleware", () => {
  let validToken: string;
  const allowedSub = env.ADMIN_GOOGLE_SUB[0]!;

  beforeAll(async () => {
    validToken = await mintToken({ sub: allowedSub });
  });

  it("allows a valid token whose sub is in the allowlist", async () => {
    const app = buildTestApp();
    const res = await app.request("/ping", {
      headers: { authorization: `Bearer ${validToken}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { sub: allowedSub } });
  });

  it("rejects a missing Authorization header", async () => {
    const app = buildTestApp();
    const res = await app.request("/ping");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ message: "Unauthorized" });
  });

  it("rejects a token signed with the wrong secret", async () => {
    const wrongSecret = new TextEncoder().encode("w".repeat(32));
    const bad = await mintToken({ sub: allowedSub, secretOverride: wrongSecret });
    const app = buildTestApp();
    const res = await app.request("/ping", {
      headers: { authorization: `Bearer ${bad}` },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a valid signature with a sub not in the allowlist", async () => {
    const bad = await mintToken({ sub: "not-you" });
    const app = buildTestApp();
    const res = await app.request("/ping", {
      headers: { authorization: `Bearer ${bad}` },
    });
    expect(res.status).toBe(401);
  });

  it("rejects an expired token", async () => {
    const bad = await mintToken({ sub: allowedSub, expSecondsFromNow: -10 });
    const app = buildTestApp();
    const res = await app.request("/ping", {
      headers: { authorization: `Bearer ${bad}` },
    });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 3: Run it and verify it fails**

Run:
```bash
cd ~/github/new-blog/apps/api-next/apps/admin
export $(grep -v '^#' ../../.env | xargs)
bun test test/jwtAuth.test.ts
```
Expected: FAIL — cannot import `../src/middleware/jwtAuth`.

- [ ] **Step 4: Implement `jwtAuth.ts`**

Write `~/github/new-blog/apps/api-next/apps/admin/src/middleware/jwtAuth.ts`:

```ts
import type { MiddlewareHandler } from "hono";
import { jwtVerify } from "jose";
import { env } from "@api-next/core";

declare module "hono" {
  interface ContextVariableMap {
    userSub: string;
  }
}

const secret = new TextEncoder().encode(env.ADMIN_JWT_SECRET);
const allowlist = new Set(env.ADMIN_GOOGLE_SUB);

export const jwtAuth: MiddlewareHandler = async (c, next) => {
  const header = c.req.header("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return c.json({ message: "Unauthorized" }, 401);
  }
  const token = header.slice(7);
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    if (!sub || !allowlist.has(sub)) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    c.set("userSub", sub);
    await next();
    return;
  } catch {
    return c.json({ message: "Unauthorized" }, 401);
  }
};
```

- [ ] **Step 5: Run the test and watch it pass**

Run:
```bash
cd ~/github/new-blog/apps/api-next/apps/admin
export $(grep -v '^#' ../../.env | xargs)
bun test test/jwtAuth.test.ts
```
Expected: 5 passing tests.

- [ ] **Step 6: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/admin/src/middleware apps/api-next/apps/admin/test/jwtAuth.test.ts
git commit -m "feat(api): add admin jwtAuth middleware with HS256 + sub allowlist

Verifies Bearer tokens minted by the admin Next.js server actions,
enforces the ADMIN_GOOGLE_SUB allowlist, and rejects missing/wrongly
signed/expired/unknown-sub tokens. Covered by 5 bun:test cases."
```

---

## Task 12: Admin `/health` route (TDD)

**Files:**
- Create: `apps/api-next/apps/admin/src/app.ts`
- Create: `apps/api-next/apps/admin/src/routes/health.ts`
- Create: `apps/api-next/apps/admin/test/health.test.ts`

- [ ] **Step 1: Write the failing test**

Write `~/github/new-blog/apps/api-next/apps/admin/test/health.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "bun:test";
import { SignJWT } from "jose";
import { createApp } from "../src/app";
import { env } from "@api-next/core";

const secret = new TextEncoder().encode(env.ADMIN_JWT_SECRET);

async function mintValidToken() {
  return await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(env.ADMIN_GOOGLE_SUB[0]!)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
    .sign(secret);
}

describe("admin GET /health", () => {
  const app = createApp();
  let token: string;

  beforeAll(async () => {
    token = await mintValidToken();
  });

  it("returns 200 with envelope when the JWT is valid", async () => {
    const res = await app.request("/health", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { status: "ok" } });
  });

  it("returns 401 without a JWT", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run it and verify failure**

Run:
```bash
cd ~/github/new-blog/apps/api-next/apps/admin
export $(grep -v '^#' ../../.env | xargs)
bun test test/health.test.ts
```
Expected: FAIL — cannot import `../src/app`.

- [ ] **Step 3: Implement the health route**

Write `~/github/new-blog/apps/api-next/apps/admin/src/routes/health.ts`:

```ts
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db } from "@api-next/core";

export const healthRoute = new Hono();

healthRoute.get("/", async (c) => {
  await db.execute(sql`SELECT 1`);
  return c.json({ data: { status: "ok" } });
});
```

- [ ] **Step 4: Implement the admin app factory**

Write `~/github/new-blog/apps/api-next/apps/admin/src/app.ts`:

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { errorHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";
import { jwtAuth } from "./middleware/jwtAuth";
import { healthRoute } from "./routes/health";

export function createApp() {
  const app = new Hono();
  app.use("*", requestLogger);
  app.use("*", cors({ origin: "http://localhost:3001", credentials: true }));
  app.use("*", jwtAuth);
  app.route("/health", healthRoute);
  app.onError(errorHandler);
  return app;
}
```

- [ ] **Step 5: Run and watch it pass**

Run:
```bash
cd ~/github/new-blog/apps/api-next/apps/admin
export $(grep -v '^#' ../../.env | xargs)
bun test test/health.test.ts
```
Expected: 2 passing tests.

- [ ] **Step 6: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/admin/src/app.ts apps/api-next/apps/admin/src/routes apps/api-next/apps/admin/test/health.test.ts
git commit -m "feat(api): add admin /health endpoint gated by jwtAuth + tests"
```

---

## Task 13: Admin `index.ts` entry + smoke

**Files:**
- Create: `apps/api-next/apps/admin/src/index.ts`

- [ ] **Step 1: Write the entry**

Write `~/github/new-blog/apps/api-next/apps/admin/src/index.ts`:

```ts
import { createApp } from "./app";
import { env } from "@api-next/core";

const app = createApp();

export default {
  fetch: app.fetch,
  port: env.ADMIN_PORT,
};
```

- [ ] **Step 2: Start it and verify with curl**

Run:
```bash
cd ~/github/new-blog/apps/api-next/apps/admin
export $(grep -v '^#' ../../.env | xargs)
bun run src/index.ts &
ADMIN_PID=$!
sleep 1
echo "--- no auth (should be 401) ---"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8081/health
kill $ADMIN_PID 2>/dev/null
```
Expected: `401` printed.

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/admin/src/index.ts
git commit -m "feat(api): add admin index.ts entry (port 8081)"
```

---

## Task 14: `.env.example`, `.env.test`, and root integration

**Files:**
- Create: `apps/api-next/.env.example`
- Create: `apps/api-next/.env.test`
- Modify: `apps/api-next/apps/blog/package.json` and `apps/admin/package.json` (add a `bunfig.toml`-free env loader for tests — actually use each workspace's own `.env.test` symlinked, or rely on `NODE_ENV=test bun test`)

Bun automatically loads `.env.test` when `NODE_ENV=test`, but only from the directory where `bun test` runs. Simplest approach: put a single `.env.test` at each workspace root that sources `../../.env.test`. To avoid the indirection, we commit the fixture `.env.test` at `apps/api-next/` once and symlink it into each workspace.

- [ ] **Step 1: Create `.env.example`**

Write `~/github/new-blog/apps/api-next/.env.example`:

```
# Copy to apps/api-next/.env and fill in real values for local development.
# Required.
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/blog
ADMIN_JWT_SECRET=CHANGE_ME_at_least_32_characters_long_secret
ADMIN_GOOGLE_SUB=your-google-sub-here

# Optional (defaults shown).
NODE_ENV=development
LOG_LEVEL=info
BLOG_PORT=8080
ADMIN_PORT=8081
```

- [ ] **Step 2: Create `.env.test`**

Write `~/github/new-blog/apps/api-next/.env.test`:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/blog
ADMIN_JWT_SECRET=test-secret-test-secret-test-secret-test
ADMIN_GOOGLE_SUB=test-allowed-sub
NODE_ENV=test
LOG_LEVEL=fatal
BLOG_PORT=8080
ADMIN_PORT=8081
```

Note: the `DATABASE_URL` must match your local dev Postgres. If your dev DB credentials differ from the defaults above, edit this file locally and DO NOT commit the change — but the committed fixture exists so CI or another dev machine has a sensible starting point.

- [ ] **Step 3: Symlink `.env.test` into each workspace so `bun test` picks it up**

Run:
```bash
cd ~/github/new-blog/apps/api-next/apps/blog && ln -sf ../../.env.test .env.test
cd ~/github/new-blog/apps/api-next/apps/admin && ln -sf ../../.env.test .env.test
cd ~/github/new-blog/apps/api-next/packages/core && ln -sf ../../.env.test .env.test
```

- [ ] **Step 4: Add the symlinks to the api-next gitignore safelist**

Edit `~/github/new-blog/apps/api-next/.gitignore` — the existing `.env.*.local` / `.env` rules already ignore `.env.test` in subworkspaces as symlinks? Actually symlinks ARE tracked by git if not ignored. We want them tracked. Update the existing gitignore to add explicit exemptions:

```gitignore
# (prepend to the existing Env files section)
!apps/*/\.env.test
!packages/*/\.env.test
```

Actually, simplest: the root-level `apps/api-next/.gitignore` contains `.env.local` and `.env.*.local` but NOT `.env.test`, so symlinks named `.env.test` inside subworkspaces are already not ignored. Verify with:

```bash
cd ~/github/new-blog
git check-ignore -v apps/api-next/apps/blog/.env.test apps/api-next/apps/admin/.env.test apps/api-next/packages/core/.env.test
```
Expected: no output (not ignored). If any of them ARE ignored, add an explicit `!` rule to `apps/api-next/.gitignore` for that path.

- [ ] **Step 5: Run each workspace's tests under `NODE_ENV=test`**

Run from each workspace dir:
```bash
cd ~/github/new-blog/apps/api-next/packages/core && NODE_ENV=test bun test
cd ~/github/new-blog/apps/api-next/apps/blog && NODE_ENV=test bun test
cd ~/github/new-blog/apps/api-next/apps/admin && NODE_ENV=test bun test
```
Expected for each: all tests pass. Tests now use values from `.env.test` (via the symlinks) — no more manual `export $(grep -v '^#' ../../.env | xargs)`.

- [ ] **Step 6: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/.env.example apps/api-next/.env.test \
  apps/api-next/apps/blog/.env.test apps/api-next/apps/admin/.env.test apps/api-next/packages/core/.env.test \
  apps/api-next/.gitignore
git commit -m "chore(api): add .env.example and .env.test fixture with workspace symlinks"
```

---

## Task 15: Monorepo-level verification via turbo

**Files:** (no file changes unless a workspace needs a missing script)

- [ ] **Step 1: Verify turbo sees all new workspaces**

Run:
```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog && bunx turbo ls
```
Expected: 5 packages listed — `blog`, `admin`, `api-blog-next`, `api-admin-next`, `@api-next/core`.

- [ ] **Step 2: Run `turbo run lint` across everything**

Run:
```bash
cd ~/github/new-blog && bunx turbo run lint
```
Expected: all 5 packages' lint tasks pass. For the three new api-next workspaces, `lint` is `tsc --noEmit` and should succeed. If blog or admin (the frontends) show lint regressions, they are pre-existing issues unrelated to this plan.

- [ ] **Step 3: Run `turbo run test` across everything**

Run:
```bash
cd ~/github/new-blog && NODE_ENV=test bunx turbo run test
```
Expected: `api-blog-next`, `api-admin-next`, `@api-next/core`, and `admin` (Next.js vitest) all pass. `blog` (Next.js) has no `test` script and turbo skips it.

- [ ] **Step 4: Start both dev servers and confirm they come up clean**

Run in two separate terminals (or sequentially in the background):
```bash
cd ~/github/new-blog/apps/api-next/apps/blog
export $(grep -v '^#' ../../.env | xargs)
bun run dev &
BLOG_PID=$!
sleep 2
curl -s http://localhost:8080/health
kill $BLOG_PID 2>/dev/null

cd ~/github/new-blog/apps/api-next/apps/admin
export $(grep -v '^#' ../../.env | xargs)
bun run dev &
ADMIN_PID=$!
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8081/health
kill $ADMIN_PID 2>/dev/null
```
Expected: blog prints `{"data":{"status":"ok"}}`, admin prints `401`.

- [ ] **Step 5: Final git status + log summary**

Run:
```bash
cd ~/github/new-blog && git status --short && echo "---" && git log --oneline | head -20
```
Expected: clean working tree; recent log showing ~14 commits from this plan with `(api)` scope for most and `(root)` scope for the workspace-registration commit.

No commits in this task — it is verification only.

---

## Plan A Completion Checklist

Before declaring Plan A done, confirm each deliverable from the design spec:

- [ ] `apps/api-next/` is a recognized set of Bun workspaces (Task 2, 3, 6, 10)
- [ ] All required deps installed (Task 3, 6, 10)
- [ ] `packages/core/src/db/schema.ts` committed, generated from dev Postgres (Task 4)
- [ ] `env.ts` validates env with zod and fails fast (Task 5)
- [ ] `errors.ts` exports `BusinessError` and `ErrorCode` (Task 5)
- [ ] blog has `errorHandler`, `requestLogger`, `cors` (Task 7, 8)
- [ ] admin has `errorHandler`, `requestLogger`, `cors`, `jwtAuth` (Task 11)
- [ ] blog `/health` hits DB and returns envelope (Task 8)
- [ ] admin `/health` requires valid JWT + sub allowlist (Task 11, 12)
- [ ] bun:test covers env, errors, blog /health (2 tests), admin jwtAuth (5 tests), admin /health (2 tests) (Tasks 5, 8, 11, 12)
- [ ] `bun run dev` in both apps starts cleanly (Task 9, 13, 15)
- [ ] `bunx turbo run lint / test / build` at the monorepo root succeed including new workspaces (Task 15)
- [ ] `.env.example` and `.env.test` committed; real `.env` gitignored (Task 14)

## Out of Scope (Handled by Later Plans)

- No domain endpoints beyond `/health` (Plans B–J)
- No Redis (future caching plan)
- No schedulers (Plans B–J add them as their owning domains are ported)
- No Docker / deploy changes (Plan L)
- No changes to blog/admin frontend env vars (Plan K cutover)
- No changes to the existing Kotlin `apps/api` tree
- No `@api-next/core/middleware` extraction — blog and admin currently duplicate `errorHandler` and `requestLogger`. Revisit once Plans B–J reveal real divergence.
