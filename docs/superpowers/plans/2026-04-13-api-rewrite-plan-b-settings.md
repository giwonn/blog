# API Rewrite — Plan B: Settings Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Kotlin `settings` domain (3 admin-only endpoints backed by a single JSONB row) to Hono/Drizzle in `apps/api-next/apps/admin`, and in doing so establish the domain-layer template, `@hono/zod-validator` integration, and `resetDb()` test helper that Plans C–J will reuse.

**Architecture:** Zod schemas in `types.ts` are the single source of truth for both runtime validation and TS types. `repo.ts` does raw drizzle `get`/`save` against the `settings` table. `service.ts` applies defaults (via `SiteSettingsSchema.parse({})`), merges partial updates, and is the only layer the route handlers call. Tests run against the local dev Postgres with `TRUNCATE ... RESTART IDENTITY CASCADE` between each case.

**Tech Stack:** Hono 4, `@hono/zod-validator`, Drizzle ORM + `bun:sql`, Zod, `bun:test`, jose (for minting test JWTs — already installed).

**Design reference:** `docs/superpowers/specs/2026-04-13-api-rewrite-plan-b-settings-design.md`

---

## Scope Check

This plan ports exactly one domain (`settings`) and establishes reusable plumbing. It does NOT touch any other domain, any frontend, or any Kotlin code. It assumes Plan A has been merged to `main`: `apps/api-next/` exists with working `api-blog-next` and `api-admin-next` workspaces, `@api-next/core` has env/errors/db/schema, and admin JWT auth is in place.

## File Structure

```
apps/api-next/
├── apps/
│   ├── admin/
│   │   ├── package.json                        # +@hono/zod-validator
│   │   ├── src/
│   │   │   ├── app.ts                          # +route mount for /admin/settings
│   │   │   └── routes/
│   │   │       └── settings.ts                 # NEW: 3 handlers + zValidator
│   │   └── test/
│   │       └── settings.test.ts                # NEW: 6 TDD cases
│   └── blog/
│       └── package.json                        # +@hono/zod-validator (consistency only, unused in B)
└── packages/core/
    ├── package.json                            # +./test-helpers export entry
    └── src/
        ├── index.ts                            # +re-exports from domains/settings
        ├── domains/
        │   └── settings/
        │       ├── types.ts                    # NEW: Zod schemas + inferred types
        │       ├── repo.ts                     # NEW: drizzle get/save
        │       ├── service.ts                  # NEW: default + merge + update
        │       └── index.ts                    # NEW: barrel re-export (public surface)
        └── test-helpers/
            └── index.ts                        # NEW: resetDb()
```

**Responsibilities:**

- `types.ts` — Zod schemas; derives TS types via `z.infer`. No runtime side effects.
- `repo.ts` — `getSettingsConfig()`: raw `select` returning `unknown | null`. `saveSettings(settings)`: upsert via `ON CONFLICT`. No business logic.
- `service.ts` — `getSiteSettings()`: applies defaults, parses/validates the JSONB with a safe fallback. `updateBlogConfig(blog)` / `updateAnalyticsConfig(analytics)`: read-modify-write, returns fresh `SiteSettings`. Only layer route handlers import.
- `domains/settings/index.ts` — re-exports types + service. `repo.ts` is **not** re-exported (enforces the "go through service" rule).
- `test-helpers/index.ts` — `resetDb()` runs `TRUNCATE <APP_TABLES> RESTART IDENTITY CASCADE` in one statement.
- `apps/admin/src/routes/settings.ts` — 3 Hono handlers using `@hono/zod-validator` for body parsing + a shared error hook that maps Zod issues to `{ message }`.
- `apps/admin/test/settings.test.ts` — 6 integration cases, mints JWTs inline, `resetDb()` in `beforeEach`.

---

## Task 1: Install `@hono/zod-validator` in both api-next HTTP workspaces

**Files:**
- Modify: `apps/api-next/apps/admin/package.json` (add dep)
- Modify: `apps/api-next/apps/blog/package.json` (add dep)
- Modify: `bun.lock` (auto)

- [ ] **Step 1: Install in `api-admin-next`**

Run:
```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/apps/admin
bun add @hono/zod-validator
```
Expected: bun adds the package, prints the resolved version (e.g. `@hono/zod-validator@0.x.y`), updates the root `bun.lock`.

- [ ] **Step 2: Install in `api-blog-next`**

Run:
```bash
cd ~/github/new-blog/apps/api-next/apps/blog
bun add @hono/zod-validator
```
Expected: resolves to the same version as admin, minimal additional install since the package is already cached from step 1.

- [ ] **Step 3: Verify both workspaces list the dep**

Run:
```bash
grep -A 1 '"@hono/zod-validator"' ~/github/new-blog/apps/api-next/apps/admin/package.json ~/github/new-blog/apps/api-next/apps/blog/package.json
```
Expected: both files contain `"@hono/zod-validator": "^x.y.z"` with the same version. If one is pinned differently, copy the admin version into blog's `package.json` by hand and re-run `bun install` at the monorepo root.

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/admin/package.json apps/api-next/apps/blog/package.json bun.lock
git commit -m "chore(api): install @hono/zod-validator in admin and blog workspaces

Deferred from Plan A because Plan A had no request bodies. Plan B's
settings PUT endpoints are the first user of it; blog gets the same
dep for consistency since Plan C (book) will need it too."
```

---

## Task 2: Add `resetDb()` test helper and expose it via `@api-next/core/test-helpers`

**Files:**
- Create: `apps/api-next/packages/core/src/test-helpers/index.ts`
- Modify: `apps/api-next/packages/core/package.json` (add `./test-helpers` to `exports`)

- [ ] **Step 1: Create `test-helpers/index.ts`**

Write `~/github/new-blog/apps/api-next/packages/core/src/test-helpers/index.ts`:

```ts
import { sql } from "drizzle-orm";
import { db } from "../db/client";

// App-owned tables only. `flyway_schema_history` is deliberately excluded —
// it is managed by the legacy JPA app's Flyway migrations and resetting it
// would break any dev loop that relies on Flyway tracking.
const APP_TABLES = [
  "settings",
  "articles",
  "series",
  "books",
  "visitor_sessions",
  "page_views",
  "daily_article_stats",
  "daily_visitor_stats",
  "article_stats",
  "batch_job_log",
] as const;

/**
 * Truncates all app-owned tables and resets identity sequences.
 * Intended for `beforeEach` in integration tests that share the local dev DB.
 *
 * Uses a single TRUNCATE statement with CASCADE so foreign-key order doesn't
 * matter. Runs in a few milliseconds against an empty schema.
 */
export async function resetDb(): Promise<void> {
  await db.execute(
    sql.raw(`TRUNCATE ${APP_TABLES.join(", ")} RESTART IDENTITY CASCADE`),
  );
}
```

- [ ] **Step 2: Add `./test-helpers` to `packages/core/package.json` exports**

Edit `~/github/new-blog/apps/api-next/packages/core/package.json` — the `exports` block:

```json
  "exports": {
    ".": "./src/index.ts",
    "./db": "./src/db/client.ts",
    "./env": "./src/env.ts",
    "./errors": "./src/errors.ts",
    "./test-helpers": "./src/test-helpers/index.ts"
  },
```

- [ ] **Step 3: Verify the type-check still passes**

Run:
```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
```
Expected: exit 0, no output. If tsc complains about `drizzle-orm` `sql.raw` not being resolvable, confirm `drizzle-orm` is installed at the monorepo root (`bun install`).

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/test-helpers apps/api-next/packages/core/package.json
git commit -m "feat(api): add resetDb() test helper in @api-next/core/test-helpers

TRUNCATE-based reset used by Plan B+ integration tests to isolate DB
state between cases. Single statement with CASCADE; identity sequences
reset. flyway_schema_history intentionally excluded."
```

---

## Task 3: Write the settings integration test file (failing)

**Files:**
- Create: `apps/api-next/apps/admin/test/settings.test.ts`

This task commits a file that does not yet pass. That is intentional — it locks in the behavior contract before any domain code exists, and the subsequent tasks make it green one layer at a time.

- [ ] **Step 1: Write the full test file**

Write `~/github/new-blog/apps/api-next/apps/admin/test/settings.test.ts`:

```ts
import { describe, it, expect, beforeEach, beforeAll } from "bun:test";
import { SignJWT } from "jose";
import { createApp } from "../src/app";
import { env } from "@api-next/core";
import { resetDb } from "@api-next/core/test-helpers";

const secret = new TextEncoder().encode(env.ADMIN_JWT_SECRET);

async function mintValidToken() {
  return await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(env.ADMIN_GOOGLE_SUB[0]!)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
    .sign(secret);
}

function authHeaders(token: string): HeadersInit {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

describe("admin settings endpoints", () => {
  const app = createApp();
  let token: string;

  beforeAll(async () => {
    token = await mintValidToken();
  });

  beforeEach(async () => {
    await resetDb();
  });

  it("GET /admin/settings returns defaults when no row exists", async () => {
    const res = await app.request("/admin/settings", { headers: authHeaders(token) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: {
        blog: { name: "Blog", description: "", profileImage: null },
        analytics: { trackingEnabled: true },
      },
    });
  });

  it("PUT /admin/settings/blog stores and returns the updated config", async () => {
    const res = await app.request("/admin/settings/blog", {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({
        name: "Giwon's Blog",
        description: "dev notes",
        profileImage: "https://example.com/me.jpg",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.blog).toEqual({
      name: "Giwon's Blog",
      description: "dev notes",
      profileImage: "https://example.com/me.jpg",
    });
    expect(body.data.analytics).toEqual({ trackingEnabled: true });
  });

  it("PUT /admin/settings/blog preserves a previously-updated analytics config", async () => {
    // First, update analytics to a non-default value.
    const analyticsRes = await app.request("/admin/settings/analytics", {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ trackingEnabled: false }),
    });
    expect(analyticsRes.status).toBe(200);

    // Then, update blog. Analytics must survive.
    const blogRes = await app.request("/admin/settings/blog", {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ name: "N", description: "D", profileImage: null }),
    });
    expect(blogRes.status).toBe(200);
    const body = await blogRes.json();
    expect(body.data.blog).toEqual({ name: "N", description: "D", profileImage: null });
    expect(body.data.analytics).toEqual({ trackingEnabled: false });
  });

  it("PUT /admin/settings/blog rejects a malformed body with 400", async () => {
    const res = await app.request("/admin/settings/blog", {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ name: 123 }), // wrong type for name
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("message");
    expect(typeof body.message).toBe("string");
  });

  it("PUT /admin/settings/analytics updates only analytics", async () => {
    const res = await app.request("/admin/settings/analytics", {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ trackingEnabled: false }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.analytics).toEqual({ trackingEnabled: false });
    expect(body.data.blog).toEqual({ name: "Blog", description: "", profileImage: null });
  });

  it("all three endpoints return 401 without a JWT", async () => {
    const g = await app.request("/admin/settings");
    expect(g.status).toBe(401);
    const pb = await app.request("/admin/settings/blog", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "X", description: "", profileImage: null }),
    });
    expect(pb.status).toBe(401);
    const pa = await app.request("/admin/settings/analytics", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trackingEnabled: true }),
    });
    expect(pa.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails on an import error**

Run:
```bash
cd ~/github/new-blog/apps/api-next/apps/admin
bun test test/settings.test.ts 2>&1 | tail -15
```
Expected: FAIL, with an error like `Cannot find module '@api-next/core/test-helpers'` or similar. (Task 2 added the export entry but the tsconfig path mapping only takes effect once re-install has happened; if the error is different but still a module-resolution failure, that's OK.)

If the error is instead "Cannot find module '../src/app'", the earlier `app.ts` may be missing the `createApp` export — check Plan A's `apps/admin/src/app.ts` exists.

- [ ] **Step 3: Commit the failing test**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/admin/test/settings.test.ts
git commit -m "test(api): add failing settings integration tests (TDD red)

Six cases covering GET defaults, PUT merge semantics, Zod validation
error, analytics update, and 401 on all three endpoints without JWT.
Will go green as Tasks 4–8 add the domain layer and route."
```

---

## Task 4: Implement Zod schemas for settings (`types.ts`)

**Files:**
- Create: `apps/api-next/packages/core/src/domains/settings/types.ts`

- [ ] **Step 1: Create the directory and file**

Run:
```bash
mkdir -p ~/github/new-blog/apps/api-next/packages/core/src/domains/settings
```

Write `~/github/new-blog/apps/api-next/packages/core/src/domains/settings/types.ts`:

```ts
import { z } from "zod";

export const BlogConfigSchema = z.object({
  name: z.string().default("Blog"),
  description: z.string().default(""),
  profileImage: z.string().nullable().default(null),
});

export const AnalyticsConfigSchema = z.object({
  trackingEnabled: z.boolean().default(true),
});

export const SiteSettingsSchema = z.object({
  blog: BlogConfigSchema.default(() => ({})),
  analytics: AnalyticsConfigSchema.default(() => ({})),
});

export type BlogConfig = z.infer<typeof BlogConfigSchema>;
export type AnalyticsConfig = z.infer<typeof AnalyticsConfigSchema>;
export type SiteSettings = z.infer<typeof SiteSettingsSchema>;
```

- [ ] **Step 2: Verify types.ts type-checks in isolation**

Run:
```bash
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
```
Expected: exit 0, no output. If it complains about an unused import or a schema method, fix locally before moving on.

**Sanity check**: open a Bun REPL and verify `SiteSettingsSchema.parse({})` resolves to the default tree:

```bash
cd ~/github/new-blog/apps/api-next/packages/core
bun -e '
import { SiteSettingsSchema } from "./src/domains/settings/types";
console.log(JSON.stringify(SiteSettingsSchema.parse({}), null, 2));
'
```
Expected output:
```json
{
  "blog": { "name": "Blog", "description": "", "profileImage": null },
  "analytics": { "trackingEnabled": true }
}
```

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/domains/settings/types.ts
git commit -m "feat(api): add settings Zod schemas and types"
```

---

## Task 5: Implement settings repo (`repo.ts`)

**Files:**
- Create: `apps/api-next/packages/core/src/domains/settings/repo.ts`

- [ ] **Step 1: Write `repo.ts`**

Write `~/github/new-blog/apps/api-next/packages/core/src/domains/settings/repo.ts`:

```ts
import { eq } from "drizzle-orm";
import { db, schema } from "../../db/client";
import type { SiteSettings } from "./types";

const SETTINGS_ROW_ID = 1;

/**
 * Raw fetch of the JSONB config column. Returns `null` when no row exists.
 * Does not validate the shape — the service layer is responsible for that.
 */
export async function getSettingsConfig(): Promise<unknown | null> {
  const rows = await db
    .select({ config: schema.settings.config })
    .from(schema.settings)
    .where(eq(schema.settings.id, SETTINGS_ROW_ID))
    .limit(1);
  return rows[0]?.config ?? null;
}

/**
 * Upserts the settings row. Single atomic SQL statement — no transaction
 * wrapper needed. The service layer calls this with a complete SiteSettings
 * object that has already been merged from a prior read.
 */
export async function saveSettings(settings: SiteSettings): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ id: SETTINGS_ROW_ID, config: settings })
    .onConflictDoUpdate({
      target: schema.settings.id,
      set: { config: settings },
    });
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
```
Expected: exit 0. If tsc complains about `schema.settings.id` type (bigint vs number), the introspected schema declares it as `bigint({ mode: "number" })` so passing a JS number literal is correct. If the error is about the `config` column type, pass `settings as any` temporarily and investigate — but this should work because drizzle types `jsonb()` columns as `unknown`.

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/domains/settings/repo.ts
git commit -m "feat(api): add settings repo (drizzle get/upsert on id=1)"
```

---

## Task 6: Implement settings service (`service.ts`)

**Files:**
- Create: `apps/api-next/packages/core/src/domains/settings/service.ts`

- [ ] **Step 1: Write `service.ts`**

Write `~/github/new-blog/apps/api-next/packages/core/src/domains/settings/service.ts`:

```ts
import { getSettingsConfig, saveSettings } from "./repo";
import {
  SiteSettingsSchema,
  type BlogConfig,
  type AnalyticsConfig,
  type SiteSettings,
} from "./types";

/**
 * Returns the current site settings, falling back to schema defaults when no
 * row exists or when the stored JSONB fails schema validation (e.g. legacy
 * row from before a schema change). A validation fallback is logged but not
 * thrown so the admin UI stays usable.
 */
export async function getSiteSettings(): Promise<SiteSettings> {
  const raw = await getSettingsConfig();
  if (raw === null) {
    return SiteSettingsSchema.parse({});
  }
  const parsed = SiteSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn(
      "[settings] stored config failed SiteSettingsSchema validation, returning defaults",
      parsed.error.flatten(),
    );
    return SiteSettingsSchema.parse({});
  }
  return parsed.data;
}

export async function updateBlogConfig(blog: BlogConfig): Promise<SiteSettings> {
  const current = await getSiteSettings();
  const next: SiteSettings = { ...current, blog };
  await saveSettings(next);
  return next;
}

export async function updateAnalyticsConfig(
  analytics: AnalyticsConfig,
): Promise<SiteSettings> {
  const current = await getSiteSettings();
  const next: SiteSettings = { ...current, analytics };
  await saveSettings(next);
  return next;
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/domains/settings/service.ts
git commit -m "feat(api): add settings service with default fallback and merge updates"
```

---

## Task 7: Expose settings public surface (`domains/settings/index.ts` + core barrel)

**Files:**
- Create: `apps/api-next/packages/core/src/domains/settings/index.ts`
- Modify: `apps/api-next/packages/core/src/index.ts`

- [ ] **Step 1: Create the domain barrel**

Write `~/github/new-blog/apps/api-next/packages/core/src/domains/settings/index.ts`:

```ts
export {
  BlogConfigSchema,
  AnalyticsConfigSchema,
  SiteSettingsSchema,
  type BlogConfig,
  type AnalyticsConfig,
  type SiteSettings,
} from "./types";

export {
  getSiteSettings,
  updateBlogConfig,
  updateAnalyticsConfig,
} from "./service";

// repo.ts is intentionally NOT re-exported — route handlers go through service.
```

- [ ] **Step 2: Extend the core barrel**

Edit `~/github/new-blog/apps/api-next/packages/core/src/index.ts`. Append, after the existing `export { sql } from "drizzle-orm"` line:

```ts
export {
  BlogConfigSchema,
  AnalyticsConfigSchema,
  SiteSettingsSchema,
  type BlogConfig,
  type AnalyticsConfig,
  type SiteSettings,
  getSiteSettings,
  updateBlogConfig,
  updateAnalyticsConfig,
} from "./domains/settings";
```

- [ ] **Step 3: Type-check**

Run:
```bash
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/domains/settings/index.ts apps/api-next/packages/core/src/index.ts
git commit -m "feat(api): export settings public surface from @api-next/core

Schemas, types, and service functions are public. repo.ts stays private
so route handlers and other consumers go through the service layer."
```

---

## Task 8: Implement the admin settings route and wire it into `app.ts`

**Files:**
- Create: `apps/api-next/apps/admin/src/routes/settings.ts`
- Modify: `apps/api-next/apps/admin/src/app.ts`

- [ ] **Step 1: Write `routes/settings.ts`**

Write `~/github/new-blog/apps/api-next/apps/admin/src/routes/settings.ts`:

```ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  BlogConfigSchema,
  AnalyticsConfigSchema,
  getSiteSettings,
  updateBlogConfig,
  updateAnalyticsConfig,
} from "@api-next/core";
import type { ZodError } from "zod";

// Maps a Zod error to the Plan A envelope shape `{ message: string }`.
// Other domains can import this helper once it graduates to a shared module,
// but for Plan B the duplication overhead is two lines per route so we keep
// it local.
function validationErrorMessage(error: ZodError): string {
  const first = error.issues[0];
  if (!first) return "Invalid request body";
  const path = first.path.join(".");
  return path ? `${path}: ${first.message}` : first.message;
}

export const settingsRoute = new Hono();

settingsRoute.get("/", async (c) => {
  const data = await getSiteSettings();
  return c.json({ data });
});

settingsRoute.put(
  "/blog",
  zValidator("json", BlogConfigSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const data = await updateBlogConfig(c.req.valid("json"));
    return c.json({ data });
  },
);

settingsRoute.put(
  "/analytics",
  zValidator("json", AnalyticsConfigSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const data = await updateAnalyticsConfig(c.req.valid("json"));
    return c.json({ data });
  },
);
```

- [ ] **Step 2: Mount the route in `app.ts`**

Edit `~/github/new-blog/apps/api-next/apps/admin/src/app.ts`. Add the import alongside the existing `healthRoute` import:

```ts
import { healthRoute } from "./routes/health";
import { settingsRoute } from "./routes/settings";
```

And add the mount line inside `createApp()` immediately after the existing `app.route("/health", healthRoute);`:

```ts
app.route("/health", healthRoute);
app.route("/admin/settings", settingsRoute);
```

- [ ] **Step 3: Run all admin tests**

Run:
```bash
cd ~/github/new-blog/apps/api-next/apps/admin
bun test 2>&1 | tail -30
```
Expected: **15 tests pass** (5 jwtAuth + 2 health + 6 settings + 2 boot-sanity = 15... wait, recount: jwtAuth has 5, health has 2, settings has 6 → 13 total). The exact pass count depends on whether the test runner reports describe groups. The important thing is `0 fail`.

If any settings test fails:

- **GET default test fails**: inspect `SiteSettingsSchema.parse({})` output — may need to explicitly default nested objects. Revisit Task 4.
- **Merge test fails**: the service layer may be overwriting instead of spreading. Revisit Task 6.
- **400 test returns 500**: the `jsonBody` hook in Step 1 isn't intercepting the Zod error — verify the hook's return value.
- **401 tests fail with 200**: the `jwtAuth` middleware should already apply globally; confirm `app.use("*", jwtAuth)` is present in `app.ts` (from Plan A).

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/admin/src/routes/settings.ts apps/api-next/apps/admin/src/app.ts
git commit -m "feat(api): add /admin/settings route (GET, PUT blog, PUT analytics)

Wires the settings service into admin Hono app. Uses @hono/zod-validator
with a custom error hook that maps Zod issues to the Plan A
\`{ message }\` envelope instead of zValidator's default shape."
```

---

## Task 9: Monorepo-wide verification and smoke test

**Files:** (no changes unless a lint or type error surfaces)

- [ ] **Step 1: `turbo run lint` across the monorepo**

Run:
```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog
bunx turbo run lint --force 2>&1 | tail -15
```
Expected: all 5 workspaces pass. api-next tasks run `tsc --noEmit`; blog/admin frontends run eslint and may still emit warnings (pre-existing). Zero errors is the requirement.

- [ ] **Step 2: `turbo run test` across the monorepo**

Run:
```bash
cd ~/github/new-blog
NODE_ENV=test bunx turbo run test --force 2>&1 | tail -20
```
Expected: `@api-next/core` (6 env/errors tests), `api-blog-next` (2 health), `api-admin-next` (5 jwtAuth + 2 health + 6 settings), `admin` (15 vitest). All tasks `successful`, `0 fail` across the board.

If `@api-next/core` tests hang, it is the eager-env issue resurfacing — confirm Plan A's lazy Proxy refactor is in place in `packages/core/src/env.ts`.

- [ ] **Step 3: Manual smoke test — GET with real JWT, then PUT, then GET again**

Terminal 1 (run the admin server):
```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/apps/admin
export $(grep -v '^#' ../../.env | xargs)
export ADMIN_PORT=9081
bun run src/index.ts
```
Leave it running.

Terminal 2 (mint a token and hit the API):
```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/apps/admin
export $(grep -v '^#' ../../.env | xargs)

TOKEN=$(bun -e '
import { SignJWT } from "jose";
const secret = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET);
const jwt = await new SignJWT({})
  .setProtectedHeader({ alg: "HS256" })
  .setSubject(process.env.ADMIN_GOOGLE_SUB.split(",")[0])
  .setIssuedAt()
  .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
  .sign(secret);
console.log(jwt);
')
echo "token length: ${#TOKEN}"

echo "--- GET defaults ---"
curl -s -H "authorization: Bearer $TOKEN" http://localhost:9081/admin/settings
echo

echo "--- PUT blog ---"
curl -s -X PUT -H "authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"name":"Test","description":"smoke","profileImage":null}' \
  http://localhost:9081/admin/settings/blog
echo

echo "--- GET after PUT ---"
curl -s -H "authorization: Bearer $TOKEN" http://localhost:9081/admin/settings
echo
```

Expected:
- First GET: `{"data":{"blog":{"name":"Blog","description":"","profileImage":null},"analytics":{"trackingEnabled":true}}}`
- PUT: `{"data":{"blog":{"name":"Test","description":"smoke","profileImage":null},"analytics":{"trackingEnabled":true}}}`
- Second GET: same as PUT response (the row was persisted).

Also verify Postgres directly:
```bash
docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "SELECT config FROM settings WHERE id = 1"
```
Expected: one row whose `config` is a JSON object containing `{"name":"Test",...}`.

Stop the admin server in terminal 1 with Ctrl+C.

- [ ] **Step 4: Clean up the smoke-test state**

The smoke test left a real row in the dev DB. Reset it so subsequent manual testing starts fresh:

```bash
docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "TRUNCATE settings RESTART IDENTITY CASCADE"
```

No commit — verification only.

---

## Plan B Completion Checklist

Before declaring done, confirm every spec deliverable:

- [ ] `packages/core/src/domains/settings/{types.ts,repo.ts,service.ts,index.ts}` all exist and implement the behavior from the design spec (Tasks 4–7)
- [ ] `packages/core/src/test-helpers/index.ts` exports `resetDb()` and `@api-next/core/test-helpers` is a resolvable subpath (Task 2)
- [ ] `@api-next/core` barrel re-exports settings public surface but NOT repo (Task 7)
- [ ] `apps/admin/src/routes/settings.ts` implements the three endpoints via `@hono/zod-validator` with a shared error hook (Task 8)
- [ ] `@hono/zod-validator` is installed in both `api-admin-next` and `api-blog-next` workspaces (Task 1)
- [ ] `apps/admin/test/settings.test.ts` covers all 6 required cases and passes (Tasks 3, 8)
- [ ] `bunx turbo run lint` passes on all 5 workspaces (Task 9 Step 1)
- [ ] `bunx turbo run test` passes monorepo-wide with `NODE_ENV=test` (Task 9 Step 2)
- [ ] Manual smoke test proves real persistence: GET → PUT → GET round trip succeeds and the row is in Postgres (Task 9 Step 3)

## Out of Scope (Handled by Later Plans)

- No blog public endpoint for settings (Kotlin doesn't have one; settings are admin-only)
- No settings versioning/audit/history
- No hono-pino migration — hand-rolled logger stays
- No schedulers or caching
- No changes to any other domain or any frontend
- No `apps/api` (Kotlin) changes
