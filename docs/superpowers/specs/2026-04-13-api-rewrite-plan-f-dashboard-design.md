# API Rewrite — Plan F: Dashboard Design

**Date:** 2026-04-13
**Status:** Approved for planning
**Parent design:** `docs/superpowers/specs/2026-04-13-api-rewrite-design.md`

## Goal

Port the single Kotlin `dashboard` endpoint (`GET /admin/dashboard/popular-articles`) to Hono. The work is 90% an analytics query; it introduces a minimal `domains/analytics/` stub that Plan G (full analytics) and Plan I (sidebar) will both expand.

## Endpoint Inventory

| Method | Path | App | Status | Notes |
|---|---|---|---|---|
| GET | `/admin/dashboard/popular-articles` | admin | port | Top 5 articles by `/articles/<id>` page views in last 30 days |

## Architectural Decisions

### Analytics Stub (`domains/analytics/`)

Following the Plan C (articles stub) → Plan E (articles expansion) pattern, Plan F creates a minimal `domains/analytics/` with just the function dashboard needs. Plan G's full analytics work adds the remaining 10+ reader functions, the write path, the schedulers, etc.

```
packages/core/src/domains/analytics/
├── types.ts      # PopularArticle TS type
├── repo.ts       # findPopularArticles(limit, days)
└── index.ts      # analyticsFindPopularArticles re-export
```

`service.ts` is NOT created in Plan F — there's no business logic beyond the query. Plan G adds the service layer when it becomes useful.

### Query Implementation — Raw SQL

The Kotlin `findTopPages` uses a QueryDSL expression with `CAST(SUBSTRING(path, 11) AS long)` and a join. Drizzle can express this but it's clunky because:

- The substring-and-cast is postgres-specific SQL
- The join is on a derived expression, not a column

Drizzle's raw `sql\`\`` template + `db.execute(...)` is the cleanest path:

```ts
export async function findPopularArticles(limit: number, days: number): Promise<PopularArticle[]> {
  const rows = await db.execute(sql`
    SELECT a.id AS id, a.title AS title, COUNT(pv.id)::bigint AS view_count
    FROM page_views pv
    JOIN articles a ON a.id = CAST(SUBSTRING(pv.path FROM 11) AS bigint)
    WHERE pv.created_at >= NOW() - (${days} || ' days')::interval
      AND pv.path LIKE '/articles/%'
    GROUP BY a.id, a.title
    ORDER BY view_count DESC
    LIMIT ${limit}
  `);
  return (rows as unknown as { id: number | bigint; title: string; view_count: number | bigint }[]).map((r) => ({
    id: Number(r.id),
    title: r.title,
    viewCount: Number(r.view_count),
  }));
}
```

**Why raw SQL is acceptable here:** the query is a one-off aggregation with a derived-column join that the ORM has no good shorthand for. Using raw SQL keeps the intent visible and avoids drizzle wrapper gymnastics. The return shape is narrowed to `PopularArticle[]` at the boundary.

**Path format reminder**: `page_views.path` is a numeric article ID, not a slug (`/articles/42` not `/articles/hello-world`). The frontend tracking payload uses the article ID. Substring offset 11 strips `/articles/` (10 chars) and casts the remainder to bigint.

### Types (`types.ts`)

```ts
export type PopularArticle = {
  id: number;
  title: string;
  viewCount: number;
};
```

No Zod schemas in Plan F — the endpoint has no request body, no path params (hardcoded route), no query params. Limit and days are hardcoded at the service call site (`limit=5`, `days=30`) to match Kotlin.

### Route

`apps/api-next/apps/admin/src/routes/dashboard.ts`:

```ts
import { Hono } from "hono";
import { analyticsFindPopularArticles } from "@api-next/core";

export const dashboardRoute = new Hono();

dashboardRoute.get("/popular-articles", async (c) => {
  const data = await analyticsFindPopularArticles(5, 30);
  return c.json({ data });
});
```

Mount: `app.route("/admin/dashboard", dashboardRoute)` in admin `app.ts`.

### ErrorCode

No new codes. The endpoint can only fail with database errors (handled by the existing `errorHandler` middleware returning 500). There is no 404 case — an empty result returns `{ data: [] }` with HTTP 200.

### Core Barrel Update

```ts
export {
  type PopularArticle,
  analyticsFindPopularArticles,
} from "./domains/analytics";
```

### Test Plan

`apps/api-next/apps/admin/test/dashboard.test.ts` — 4 cases (`beforeEach: await resetDb()`):

1. **Empty**: No page_views → returns `{ data: [] }` with HTTP 200.
2. **Top N with counts**: Seed 3 articles and several page_views hitting each one different numbers of times. Response is sorted by viewCount descending, titles match.
3. **Older than 30 days excluded**: Seed a page_view with `created_at = NOW() - 31 days`. That article's count must be 0 in the response (not in list, or excluded entirely).
4. **Non-`/articles/*` paths excluded**: Seed a page_view with path `/about` or similar. Response does not include that path.
5. **401 without JWT**: single combined test.

Test fixture helpers will use raw drizzle inserts into `articles` (with numeric IDs that match the path format) and `page_views` with varying `created_at`. Format the path as `/articles/{articleId}`.

## Plan F Deliverables

1. `packages/core/src/domains/analytics/types.ts` created with `PopularArticle`
2. `packages/core/src/domains/analytics/repo.ts` created with `findPopularArticles`
3. `packages/core/src/domains/analytics/index.ts` barrel
4. `packages/core/src/index.ts` re-exports `PopularArticle` + `analyticsFindPopularArticles`
5. `apps/api-next/apps/admin/src/routes/dashboard.ts` created and mounted at `/admin/dashboard`
6. `apps/api-next/apps/admin/test/dashboard.test.ts` ~5 cases pass
7. `bunx turbo run lint` 5/5 (0 errors)
8. `bun run test` (root, serial) 4/4
9. Manual smoke test: seed page_views + articles → curl `/admin/dashboard/popular-articles` → verify response

## Plan F Non-Goals

- Full analytics domain (Plan G) — schedulers, aggregators, all other reader functions
- Service layer for analytics — not needed for Plan F (no business logic)
- Caching — deferred to a later plan
- Zod schemas — endpoint has no input
- `@api-next/core/middleware` extraction — still deferred
