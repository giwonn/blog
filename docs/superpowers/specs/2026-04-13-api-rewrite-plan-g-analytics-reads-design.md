# API Rewrite — Plan G: Analytics Reads Design

**Date:** 2026-04-13
**Status:** Approved for planning
**Parent design:** `docs/superpowers/specs/2026-04-13-api-rewrite-design.md`
**Split from original Plan G scope:** the write path + Redis visitor counter + scheduler + external geo resolver become **Plan G2** (inserted between Plan H and Plan I).

## Goal

Port the 8 admin analytics read endpoints from Kotlin to Hono. Expands the `domains/analytics/` stub (from Plan F) with the full set of real-time reader functions and the query service layer. No schedulers, no Redis, no external HTTP, no write path — those are all Plan G2.

## Why Split

The original Plan G scope would have ~20 tasks mixing reads, writes, Redis, external HTTP, and a scheduler. That's too large to execute reliably in one session. Splitting along the read/write boundary is clean because:

- **Reads are stateless and self-contained** — drizzle queries against existing tables that Kotlin populates.
- **Writes add external dependencies** — Redis, IP geolocation HTTP, and cron scheduling, each of which has its own compat and setup questions.
- **Cutover timing** — during the rewrite period, Kotlin is still serving `POST /analytics/page-view` and running the scheduler, so the new write path is not production-critical until Plan K. The reads, by contrast, are worth having early because admin frontend reads analytics to show dashboards.

## Plan Sequence Update

```
G:   analytics reads (this plan)   ← next
H:   comment (GitHub)
G2:  analytics writes + infra       ← inserted here
I:   sidebar (needs G2)
J:   image
K:   cutover
L:   blue-green deploy
```

## Endpoint Inventory

All under `/admin/analytics/*`, JWT-gated, query params `from` (YYYY-MM-DD), `to` (YYYY-MM-DD), `tz` (IANA timezone, default `UTC`).

| Method | Path | Returns |
|---|---|---|
| GET | `/admin/analytics/overview` | `AnalyticsOverview` (totals + top lists for the range) |
| GET | `/admin/analytics/page-views` | `DailyPageViewCount[]` |
| GET | `/admin/analytics/daily-visitors` | `DailyVisitorCount[]` |
| GET | `/admin/analytics/top-pages` | `PageViewCount[]` |
| GET | `/admin/analytics/referrers` | `ReferrerCount[]` |
| GET | `/admin/analytics/visitor-locations` | `VisitorLocation[]` |
| GET | `/admin/analytics/ip-access-history?ip=` | `IpAccessHistory[]` |
| GET | `/admin/analytics/article-access-history?articleId=` | `ArticleAccessHistory[]` |

## Architectural Decisions

### Timezone Handling — `date-fns-tz`

Kotlin uses `ZoneId` to convert a local-date range in the user's timezone to a UTC datetime range. The JS stdlib does not have a clean equivalent; rolling it by hand with `Intl.DateTimeFormat` is ~30 lines of date math and fragile. Install **`date-fns-tz`** (~10KB) in `@api-next/core` and use `fromZonedTime`:

```ts
import { fromZonedTime } from "date-fns-tz";

export function toUtcDateRange(fromDate: string, toDate: string, tz: string): {
  fromUtc: Date;
  toUtcExclusive: Date;
} {
  const fromUtc = fromZonedTime(`${fromDate}T00:00:00`, tz);
  // Exclusive end = start of (to + 1 day) in tz
  const toNext = new Date(toDate);
  toNext.setUTCDate(toNext.getUTCDate() + 1);
  const toNextIso = toNext.toISOString().slice(0, 10);
  const toUtcExclusive = fromZonedTime(`${toNextIso}T00:00:00`, tz);
  return { fromUtc, toUtcExclusive };
}
```

This mirrors Kotlin's `toUtcRange` logic verbatim.

Lives in `packages/core/src/timezone.ts`.

### Types (`domains/analytics/types.ts` expansion)

Mirrors the Kotlin data classes in `AnalyticsReader.kt`. The existing `PopularArticle` from Plan F stays (for dashboard/sidebar compat); the new admin analytics endpoints return their own shapes:

```ts
export type PageViewCount = {
  articleId: number;
  title: string;
  viewCount: number;
};

export type ReferrerCount = {
  referrer: string;
  viewCount: number;
};

export type DailyPageViewCount = {
  date: string;   // "YYYY-MM-DD"
  viewCount: number;
};

export type DailyVisitorCount = {
  date: string;
  visitorCount: number;
};

export type VisitorCount = {
  count: number;
};

export type VisitorLocation = {
  ipAddress: string;
  latitude: number;
  longitude: number;
  country: string | null;
  city: string | null;
  visitCount: number;
  lastVisitedAt: string;
};

export type IpAccessHistory = {
  path: string;
  ipAddress: string;
  country: string | null;
  city: string | null;
  createdAt: string;
};

export type ArticleAccessHistory = {
  ipAddress: string;
  country: string | null;
  city: string | null;
  createdAt: string;
};

export type AnalyticsOverview = {
  totalPageViews: number;
  topPages: PageViewCount[];
};
```

Kotlin's `AnalyticsOverview` is just `{ totalPageViews, topPages }`; we mirror it.

### Real-time Queries — Raw SQL for the Complex Ones

Following Plan F, complex aggregation queries use drizzle's raw `sql\`\`` template. Simple queries use the fluent query builder. The split:

- **Raw SQL** (derived joins, CASE expressions, CTEs): `findTopPages`, `findTopReferrers`, `findDailyPageViews`, `findDailyVisitors`, `findVisitorLocations`, `findIpAccessHistory`, `findArticleAccessHistory`, `countDistinctSessions`
- **Fluent builder** (single-table SELECT with SUM/COUNT): `getTotalVisitorCount`, `getVisitorCountByDate`

### Refactor Plan F: `findPopularArticles` → `findTopPages`

Plan F's `findPopularArticles(limit, days)` computes what Kotlin's `findTopPages(from, to)` computes, but with different parameterization. Plan G refactors:

1. Rename `findPopularArticles` → `findTopPages` in `domains/analytics/repo.ts`.
2. Change signature: `(from: Date, to: Date): Promise<PageViewCount[]>` — returns the new `PageViewCount` shape (with `articleId`) and no limit.
3. Update the core barrel re-export: `articlesFindTopPages` replaces `analyticsFindPopularArticles`.
4. Update Plan F's `apps/admin/src/routes/dashboard.ts` to:
   - Compute `from = now - 30d`, `to = now`
   - Call `analyticsFindTopPages(from, to)`
   - Slice to 5, map `{articleId, title, viewCount}` → `{id, title, viewCount}` for the `PopularArticle` response shape
5. Plan F's dashboard tests stay green (output shape unchanged).

This keeps one source of truth for the query and aligns with Kotlin's reader interface.

### Service Layer (`domains/analytics/service.ts`)

Mirrors Kotlin's `AnalyticsQueryService`:

```ts
export async function getOverview(from: Date, to: Date): Promise<AnalyticsOverview> {
  const topPages = await repo.findTopPages(from, to);
  const totalPageViews = topPages.reduce((acc, p) => acc + p.viewCount, 0);
  return { totalPageViews, topPages };
}

export async function getDailyPageViews(from: Date, to: Date): Promise<DailyPageViewCount[]> {
  return await repo.findDailyPageViews(from, to);
}

export async function getDailyVisitors(from: Date, to: Date, tz: string): Promise<DailyVisitorCount[]> {
  return await repo.findDailyVisitors(from, to, tz);
}

// ... similar passthroughs for top pages, referrers, visitor locations, IP history, article history
```

No business logic beyond `getOverview`'s simple sum. Keep it thin.

`VisitorStatsService` (with the Redis fallback chain) is **not** in Plan G — that's Plan G2.

### Route File (`apps/admin/src/routes/analytics.ts`)

One file with 8 handlers. Each handler:
1. Validates `from`, `to`, `tz` query params via Zod (`ISO date`, `non-empty string`)
2. Converts to UTC range via `toUtcDateRange`
3. Calls the service function
4. Returns `{ data: <result> }` envelope

Custom zValidator error hook, same as Plans B/C/D/E.

### Response Envelope

Same as the rest of the API: `{ data: <result> }` for success, `{ message }` with HTTP 4xx/5xx for errors.

### Error Codes

No new error codes. Analytics is all read-only with no business-rule failures — just query results or 500 on DB error.

### File Structure

```
apps/api-next/packages/core/
├── src/
│   ├── timezone.ts                           # NEW: toUtcDateRange helper
│   ├── index.ts                              # +timezone + expanded analytics exports
│   └── domains/analytics/
│       ├── types.ts                          # MODIFY: +9 new types
│       ├── repo.ts                           # MODIFY: +10 reader functions (keep Plan F one, rename)
│       ├── service.ts                        # NEW
│       └── index.ts                          # MODIFY: +new exports
└── package.json                              # +date-fns-tz dep

apps/api-next/apps/admin/
├── src/
│   ├── app.ts                                # +mount /admin/analytics
│   └── routes/
│       ├── analytics.ts                      # NEW: 8 handlers
│       └── dashboard.ts                      # MODIFY: refactor to use new findTopPages
└── test/
    └── analytics.test.ts                     # NEW: ~17 cases
```

## Test Plan (TDD)

`apps/api-next/apps/admin/test/analytics.test.ts` — ~17 cases, all using `resetDb()` + raw drizzle inserts into `page_views` and `visitor_sessions`.

Representative coverage:

1. **Overview empty** → `{ data: { totalPageViews: 0, topPages: [] } }`
2. **Overview with data** → totals match sum of viewCounts
3. **Daily page views** with 3 days of data → array with 3 entries, correct counts per day
4. **Daily visitors** with 5 sessions across 2 days → array with 2 entries
5. **Top pages** matches Plan F dashboard logic for a custom range
6. **Referrers** with mix of null and non-null referrers → null becomes `(직접 접속)` label (Kotlin behavior) — verify the CASE works
7. **Visitor locations** with geo-enriched rows → array sorted by visitCount desc
8. **IP access history** for a specific IP → returns only that IP's page views
9. **Article access history** for a specific article ID → returns only page views matching `/articles/<id>`
10. **Timezone handling**: query with `tz=Asia/Seoul` and a `from=2026-04-13` → UTC range converts to `2026-04-12T15:00:00Z`–`2026-04-13T15:00:00Z`; verify a page_view at `2026-04-13T00:00:00Z` (which is `2026-04-13T09:00:00 KST`) is included, and one at `2026-04-12T14:00:00Z` (which is `2026-04-12T23:00:00 KST`) is excluded
11. **Bad tz param** (e.g. `tz=Invalid/Nowhere`) → 400 with validation message
12. **Missing from/to** → 400
13. **401 without JWT** (combined test for all 8 endpoints)
14. **All endpoints 200 with valid JWT + empty data** (8 endpoints, 1 test per, smoke-level)
15. **Dashboard still passes** (no new test, existing dashboard.test.ts goes green after the refactor)

## Plan G Deliverables

1. `date-fns-tz` installed in `@api-next/core`
2. `packages/core/src/timezone.ts` with `toUtcDateRange`
3. `packages/core/src/domains/analytics/types.ts` extended with 9 new types
4. `packages/core/src/domains/analytics/repo.ts`:
   - `findPopularArticles` refactored to `findTopPages(from, to)` returning `PageViewCount[]`
   - 9 new reader functions
5. `packages/core/src/domains/analytics/service.ts` created with the query service
6. `packages/core/src/domains/analytics/index.ts` barrel updated
7. Core barrel re-exports the new surface
8. `apps/admin/src/routes/analytics.ts` mounted at `/admin/analytics`
9. `apps/admin/src/routes/dashboard.ts` refactored to use `findTopPages` + map to `PopularArticle` shape
10. `apps/admin/test/analytics.test.ts` ~17 cases pass
11. `apps/admin/test/dashboard.test.ts` still passes (Plan F tests unchanged)
12. `bunx turbo run lint` 5/5 (0 errors)
13. `bun run test` (root, serial) 4/4
14. Manual smoke test: seed page_views/visitor_sessions → curl `/admin/analytics/overview` → verify shape matches Kotlin JSON

## Plan G Non-Goals (Deferred to Plan G2)

- `POST /analytics/page-view` (public, blog) write endpoint
- `AnalyticsCollectionService` with async page view recording
- `RedisVisitorCounter` + local Redis in docker-compose
- `GeoLocationResolver` (ip-api.com HTTP client)
- `VisitorStatsAggregator` scheduler (Bun cron)
- `VisitorStatsService.getVisitorSummary` (Redis → DB → raw fallback chain)
- `daily_visitor_stats` write path

These are all moved to Plan G2 which runs after Plan H (comment).

## Other Non-Goals

- `findTopArticleStats` and `article_stats` / `daily_article_stats` table reads — confirmed dead code during brainstorm. Not ported; tables will be dropped in post-cutover cleanup.
- `@api-next/core/middleware` extraction — still deferred.
- `hono-pino` migration — still deferred.
- Renaming Plan B settings exports — separate refactor.
