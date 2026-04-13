# API Rewrite — Plan B: Settings Domain Design

**Date:** 2026-04-13
**Status:** Approved for planning
**Parent design:** `docs/superpowers/specs/2026-04-13-api-rewrite-design.md`
**Scope:** Port the `settings` domain (3 admin-only endpoints) from Kotlin to Hono, establishing the domain-layer pattern for all subsequent Plans C–J.

## Why settings as the first domain

The parent design initially listed `sidebar` as Plan B, but inspection of the Kotlin `SidebarController` revealed it aggregates three services (`PopularArticleService`, `GitHubCommentService`, `VisitorStatsService`), one of which makes external HTTP calls to the GitHub API. Porting sidebar requires the analytics and comment domains to exist first, so it cannot be a genuine "first domain."

`settings` is a better starting point because it is:

- **Single-table, single-row** (id=1, JSONB `config` column)
- **Admin-only** (reuses the existing `jwtAuth` middleware from Plan A)
- **No external I/O** (no GitHub, no other services)
- **Write-inclusive** (two `PUT` endpoints), so it exercises Zod body validation, upserts, and the TRUNCATE test-isolation strategy that Plan A did not
- **Self-contained**, so patterns established here (repo/service/types split, Zod schemas as single source of truth, route wiring, test reset) become the template for Plans C–J

## Reordered Plan Sequence

| # | Plan | Notes |
|---|---|---|
| A | Foundation | Done |
| **B** | **settings** | **This document** |
| C | book | Public read-only CRUD, single table |
| D | series | Same shape as book |
| E | article | Core domain, reuses B–D patterns |
| F | dashboard | Admin aggregation view |
| G | analytics | Complex, schedulers |
| H | comment | GitHub external integration |
| I | sidebar | Aggregates H + G, so goes after both |
| J | image | Admin upload, filesystem |
| K | Cutover | blog/admin env swap, delete Kotlin |
| L | Unified blue-green deploy | blog + admin + api atomic swap |

---

## Architectural Decisions

### Domain Layer Structure

Establishes the template for Plans C–J:

```
apps/api-next/packages/core/src/domains/settings/
├── types.ts      # Zod schemas + inferred TS types (single source of truth)
├── repo.ts       # drizzle queries; raw DB access only, no business logic
└── service.ts    # domain logic: defaults, merges, transactions
```

**Rule of thumb for future domains:**

- **types.ts** — Zod schemas first. Types are derived via `z.infer<typeof Schema>`. Request body validators (via `@hono/zod-validator`) and JSONB read parsers both reuse these schemas.
- **repo.ts** — knows about drizzle and the schema table. Returns raw rows or `null`. Does not apply defaults or merge state.
- **service.ts** — knows about domain semantics. Applies defaults, composes multi-step operations, is the only layer a route handler should call.

Routes import from `service.ts`, never directly from `repo.ts`.

### Zod Schemas (types.ts)

Mirror the Kotlin `SiteSettings`/`BlogConfig`/`AnalyticsConfig` data classes exactly:

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

The `.default()` calls propagate through `SiteSettingsSchema.parse({})` so a totally empty object resolves to the canonical default tree. This is how the service layer builds the "no row yet" response without a hand-written default object.

### Repo (repo.ts)

Two methods, both thin:

```ts
export async function getSettings(): Promise<unknown | null> {
  const rows = await db.select().from(schema.settings).where(eq(schema.settings.id, 1n));
  return rows[0]?.config ?? null;
}

export async function saveSettings(settings: SiteSettings): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ id: 1n, config: settings })
    .onConflictDoUpdate({
      target: schema.settings.id,
      set: { config: settings },
    });
}
```

- `getSettings()` returns the raw `config` JSONB value as `unknown` — the service layer is responsible for parsing/validating it. The repo does not know about `SiteSettings`.
- `saveSettings()` upserts via `INSERT ... ON CONFLICT DO UPDATE`, matching Kotlin's find-or-create semantics in one atomic SQL statement.
- No transaction wrapper here; each call is a single statement and is already atomic.

### Service (service.ts)

Three functions, one per endpoint:

```ts
export async function getSiteSettings(): Promise<SiteSettings> {
  const raw = await getSettings();
  if (raw === null) return SiteSettingsSchema.parse({});
  const parsed = SiteSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn("[settings] config row failed schema validation, falling back to defaults", parsed.error);
    return SiteSettingsSchema.parse({});
  }
  return parsed.data;
}

export async function updateBlogConfig(blog: BlogConfig): Promise<SiteSettings> {
  const current = await getSiteSettings();
  const next = { ...current, blog };
  await saveSettings(next);
  return next;
}

export async function updateAnalyticsConfig(analytics: AnalyticsConfig): Promise<SiteSettings> {
  const current = await getSiteSettings();
  const next = { ...current, analytics };
  await saveSettings(next);
  return next;
}
```

Both update functions return the fresh `SiteSettings` so the route handler can respond with it without a second read.

**Concurrency note:** The Kotlin service also uses a read-then-write pattern under `@Transactional`, but the blog is single-writer (one admin). No optimistic locking needed. If Plan F/G introduces multi-writer settings, revisit.

### Route (apps/admin/src/routes/settings.ts)

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

export const settingsRoute = new Hono();

settingsRoute.get("/", async (c) => {
  const data = await getSiteSettings();
  return c.json({ data });
});

settingsRoute.put("/blog", zValidator("json", BlogConfigSchema), async (c) => {
  const data = await updateBlogConfig(c.req.valid("json"));
  return c.json({ data });
});

settingsRoute.put("/analytics", zValidator("json", AnalyticsConfigSchema), async (c) => {
  const data = await updateAnalyticsConfig(c.req.valid("json"));
  return c.json({ data });
});
```

Wired into `admin/src/app.ts` with:

```ts
import { settingsRoute } from "./routes/settings";
// ...
app.route("/admin/settings", settingsRoute);
```

The `/admin` prefix is preserved because the Kotlin admin API uses `/admin/settings`. Preserving URL paths keeps the cutover plan trivial — the admin Next.js frontend does not change its fetch URLs on cutover day.

### Response Envelope

- Success: `{ "data": <SiteSettings> }` (HTTP 200)
- Zod validation failure (via `@hono/zod-validator`): HTTP 400, body shape determined by zValidator's default error hook. We will pass a custom hook that maps the validation error into `{ "message": "<first issue>" }` so it stays consistent with Plan A's error envelope. Implemented once here in the route file and reused for future routes.

### Core Package Exports

Expand the existing `packages/core/src/index.ts` barrel:

```ts
// existing exports...
export { db, schema, type DB } from "./db/client";
export { sql } from "drizzle-orm";

// new for Plan B
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

`domains/settings/index.ts` re-exports from `types.ts` and `service.ts`. `repo.ts` is **not** re-exported — route handlers should only go through the service.

### Test Isolation: `resetDb()` Helper

```
apps/api-next/packages/core/src/test-helpers/
└── index.ts    # exports resetDb()
```

```ts
import { sql } from "drizzle-orm";
import { db } from "../db/client";

// Flyway's metadata table is intentionally NOT reset — truncating it would
// break any dev/test setup that relies on Flyway tracking. App tables only.
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
];

export async function resetDb(): Promise<void> {
  await db.execute(
    sql.raw(`TRUNCATE ${APP_TABLES.join(", ")} RESTART IDENTITY CASCADE`),
  );
}
```

Exported via `@api-next/core/test-helpers` subpath. Tests import it and call it in `beforeEach`.

### Test Plan (TDD)

New file: `apps/api-next/apps/admin/test/settings.test.ts`

Each test wraps itself with a fresh DB state via `beforeEach(async () => await resetDb())` and mints a valid JWT via the shared pattern from `jwtAuth.test.ts`.

Required cases:

1. **GET with no row** → 200, body equals `{ data: { blog: { name: "Blog", description: "", profileImage: null }, analytics: { trackingEnabled: true } } }`. Verifies the default fallback path.
2. **GET after PUT /blog** → body reflects updated blog + default analytics.
3. **PUT /blog merges cleanly** → analytics first updated to `{ trackingEnabled: false }`, then blog updated → response preserves the prior analytics value.
4. **PUT /blog with invalid body** (e.g. `{ name: 123 }`) → 400 with `{ message: <string> }`.
5. **PUT /analytics** → only analytics changes.
6. **No JWT** → 401 on all three endpoints (one test per endpoint).

**Not tested** (out of scope):

- Repo methods in isolation — covered transitively by service/integration tests
- Zod schemas in isolation — Zod itself is trusted
- JWT edge cases — covered in Plan A's `jwtAuth.test.ts`

### `@hono/zod-validator` Installation

Added to `apps/api-next/apps/admin/package.json` dependencies. The plan file will pin the concrete caret range picked up from `bun install` (same approach as all other deps in `api-next`). Also added to `apps/api-next/apps/blog/package.json` even though blog has no request bodies yet — the dep is trivial and consistency avoids a future "why isn't it in blog" surprise in Plan C (book will need it).

The design spec's original stack table listed this as a Plan A dep; it was deferred because Plan A had no request bodies.

---

## Plan B Deliverables

On completion, these must all be true:

1. `apps/api-next/packages/core/src/domains/settings/{types.ts,repo.ts,service.ts,index.ts}` exist and implement the behavior above.
2. `apps/api-next/packages/core/src/test-helpers/index.ts` exports `resetDb()`, and `@api-next/core/test-helpers` is a resolvable subpath export.
3. `@api-next/core` barrel re-exports the public settings surface (schemas, types, service functions) but NOT the repo.
4. `apps/api-next/apps/admin/src/routes/settings.ts` implements the three endpoints using `@hono/zod-validator`, and is mounted at `/admin/settings` in `admin/src/app.ts`.
5. `@hono/zod-validator` is installed in both `api-admin-next` and `api-blog-next` workspaces.
6. `apps/api-next/apps/admin/test/settings.test.ts` covers all 6 required cases and passes.
7. `bunx turbo run lint` passes on all 5 workspaces.
8. `bunx turbo run test` passes across the entire monorepo with `NODE_ENV=test`.
9. Manual smoke test: `curl` with a valid JWT can `GET` and `PUT /blog` against a locally running admin process and observe the state change in Postgres.

## Plan B Non-Goals

- No public blog endpoint for settings — Kotlin doesn't have one, and settings are admin-only.
- No settings versioning, audit trail, or change history.
- No multi-tenant support — id=1 remains the only row.
- No background schedulers or caching.
- No `hono-pino` migration — the hand-rolled pino logger stays.
- No changes to blog app or core runtime modules outside the new `domains/settings/` subtree, barrel updates, and test-helpers additions.
- No touching `apps/api` (Kotlin) at all.
