# API Rewrite — Plan G: Analytics Reads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the 8 admin analytics read endpoints from Kotlin to Hono. Expand `domains/analytics/` with all real-time reader functions and the query service. Refactor Plan F's `findPopularArticles` into the shared `findTopPages` the rest of the analytics surface will use.

**Architecture:** Timezone conversion via `date-fns-tz`. Real-time drizzle queries (raw SQL for aggregations, fluent builder for the simple counts). Thin service layer: all 8 endpoints are essentially passthroughs except `getOverview` which sums top-page view counts. No writes, no Redis, no scheduler — all deferred to Plan G2.

**Tech Stack:** Hono 4, `@hono/zod-validator`, Drizzle ORM raw `sql\`\``, `date-fns-tz`, Zod 4, `bun:test`, jose.

**Design reference:** `docs/superpowers/specs/2026-04-13-api-rewrite-plan-g-analytics-reads-design.md`

---

## Scope Check

One plan, 9 tasks, all within `domains/analytics/` + `apps/admin/`. Only external edit is Plan F's `apps/admin/src/routes/dashboard.ts` (refactor to consume the new shared repo function). No other domain touched.

## File Structure

```
apps/api-next/packages/core/
├── package.json                              # +date-fns-tz dep
└── src/
    ├── timezone.ts                           # NEW
    ├── index.ts                              # +timezone + analytics surface
    └── domains/analytics/
        ├── types.ts                          # MODIFY: +9 types
        ├── repo.ts                           # MODIFY: rename findPopularArticles, +9 readers
        ├── service.ts                        # NEW
        └── index.ts                          # MODIFY: new exports

apps/api-next/apps/admin/
├── src/
│   ├── app.ts                                # +mount /admin/analytics
│   └── routes/
│       ├── analytics.ts                      # NEW
│       └── dashboard.ts                      # MODIFY: use findTopPages + map shape
└── test/
    └── analytics.test.ts                     # NEW: ~17 cases
```

---

## Task 1: Install `date-fns-tz` + create `timezone.ts` util

**Files:**
- Modify: `apps/api-next/packages/core/package.json` (add dep)
- Modify: `bun.lock` (auto)
- Create: `apps/api-next/packages/core/src/timezone.ts`
- Modify: `apps/api-next/packages/core/src/index.ts` (re-export)

- [ ] **Step 1: Install `date-fns-tz`**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/packages/core
bun add date-fns-tz
```
Expected: resolves and pins a `^3.x` or `^2.x` version.

- [ ] **Step 2: Write `timezone.ts`**

Write `~/github/new-blog/apps/api-next/packages/core/src/timezone.ts`:

```ts
import { fromZonedTime } from "date-fns-tz";

/**
 * Converts a date-only range `[fromDate, toDate]` in the given IANA timezone
 * to a UTC datetime range with an exclusive upper bound.
 *
 * Example: `toUtcDateRange("2026-04-13", "2026-04-13", "Asia/Seoul")` returns
 *   { fromUtc: 2026-04-12T15:00:00Z, toUtcExclusive: 2026-04-13T15:00:00Z }
 *
 * Mirrors the Kotlin AnalyticsController.toUtcRange helper.
 *
 * @param fromDate YYYY-MM-DD (inclusive, midnight local)
 * @param toDate   YYYY-MM-DD (inclusive, whole day in local tz)
 * @param tz       IANA timezone name, e.g. "Asia/Seoul", "UTC"
 */
export function toUtcDateRange(
  fromDate: string,
  toDate: string,
  tz: string,
): { fromUtc: Date; toUtcExclusive: Date } {
  const fromUtc = fromZonedTime(`${fromDate}T00:00:00`, tz);
  // Exclusive upper bound = start of (toDate + 1) in tz.
  const toNext = nextDayString(toDate);
  const toUtcExclusive = fromZonedTime(`${toNext}T00:00:00`, tz);
  return { fromUtc, toUtcExclusive };
}

function nextDayString(yyyyMmDd: string): string {
  // Parse as UTC date-only and add 1 day. Safe because we never cross DST here —
  // we're just computing "the calendar date after this one".
  const d = new Date(`${yyyyMmDd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 3: Re-export from core barrel**

Read `~/github/new-blog/apps/api-next/packages/core/src/index.ts`. Append at the end:

```ts
export { toUtcDateRange } from "./timezone";
```

- [ ] **Step 4: Type-check**

```bash
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 5: Sanity check the conversion**

```bash
bun -e '
import { toUtcDateRange } from "./src/timezone";
console.log(toUtcDateRange("2026-04-13", "2026-04-13", "Asia/Seoul"));
console.log(toUtcDateRange("2026-04-13", "2026-04-13", "UTC"));
'
```
Expected:
- Seoul: `fromUtc` ≈ `2026-04-12T15:00:00.000Z`, `toUtcExclusive` ≈ `2026-04-13T15:00:00.000Z`
- UTC: `fromUtc` = `2026-04-13T00:00:00.000Z`, `toUtcExclusive` = `2026-04-14T00:00:00.000Z`

- [ ] **Step 6: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/package.json apps/api-next/packages/core/src/timezone.ts apps/api-next/packages/core/src/index.ts bun.lock
git commit -m "feat(api): add toUtcDateRange timezone helper via date-fns-tz

Mirrors the Kotlin AnalyticsController.toUtcRange logic: converts a
date-only range in a user-facing IANA timezone to a UTC datetime range
with an exclusive upper bound (start of next-day midnight in the tz)."
```

---

## Task 2: Extend `domains/analytics/types.ts`

**Files:**
- Modify: `apps/api-next/packages/core/src/domains/analytics/types.ts`

- [ ] **Step 1: Append new types**

Read the current file. It only has `PopularArticle` from Plan F. APPEND to the end:

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

`PopularArticle` stays untouched — dashboard still uses it.

- [ ] **Step 2: Type-check**

```bash
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/domains/analytics/types.ts
git commit -m "feat(api): add 9 analytics read-side types

PageViewCount, ReferrerCount, DailyPageViewCount, DailyVisitorCount,
VisitorCount, VisitorLocation, IpAccessHistory, ArticleAccessHistory,
AnalyticsOverview. Mirrors Kotlin's AnalyticsReader.kt data classes."
```

---

## Task 3: Refactor `findPopularArticles` → `findTopPages` + add all readers

**Files:**
- Modify: `apps/api-next/packages/core/src/domains/analytics/repo.ts`

- [ ] **Step 1: Replace `findPopularArticles` with `findTopPages`**

Read the current `repo.ts`. Replace the existing single function with the full set of readers. The final file should look like this:

```ts
import { sql } from "drizzle-orm";
import { db } from "../../db/client";
import type {
  PageViewCount,
  ReferrerCount,
  DailyPageViewCount,
  DailyVisitorCount,
  VisitorCount,
  VisitorLocation,
  IpAccessHistory,
  ArticleAccessHistory,
} from "./types";

type RawRow = Record<string, unknown>;

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") return Number(v);
  return 0;
}

function toStringOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

/**
 * Top pages by view count within a UTC datetime range.
 * Mirrors Kotlin AnalyticsReader.findTopPages. Joins page_views to articles
 * via CAST(SUBSTRING(path, 11) AS bigint) — frontend tracks with
 * path = '/articles/<numeric-id>'.
 */
export async function findTopPages(from: Date, to: Date): Promise<PageViewCount[]> {
  const rows = (await db.execute(sql`
    SELECT a.id AS article_id, a.title AS title, COUNT(pv.id)::bigint AS view_count
    FROM page_views pv
    JOIN articles a ON a.id = CAST(SUBSTRING(pv.path FROM 11) AS bigint)
    WHERE pv.created_at >= ${from.toISOString()}::timestamp
      AND pv.created_at < ${to.toISOString()}::timestamp
      AND pv.path LIKE '/articles/%'
    GROUP BY a.id, a.title
    ORDER BY view_count DESC
  `)) as unknown as RawRow[];
  return rows.map((r) => ({
    articleId: toNumber(r.article_id),
    title: String(r.title),
    viewCount: toNumber(r.view_count),
  }));
}

/**
 * Top referrers. Null referrers are bucketed as the Korean label `(직접 접속)`
 * (direct access), mirroring Kotlin's CaseBuilder logic.
 */
export async function findTopReferrers(from: Date, to: Date): Promise<ReferrerCount[]> {
  const rows = (await db.execute(sql`
    SELECT COALESCE(pv.referrer, '(직접 접속)') AS referrer,
           COUNT(pv.id)::bigint AS view_count
    FROM page_views pv
    WHERE pv.created_at >= ${from.toISOString()}::timestamp
      AND pv.created_at < ${to.toISOString()}::timestamp
    GROUP BY COALESCE(pv.referrer, '(직접 접속)')
    ORDER BY view_count DESC
  `)) as unknown as RawRow[];
  return rows.map((r) => ({
    referrer: String(r.referrer),
    viewCount: toNumber(r.view_count),
  }));
}

/**
 * Page views per day within a range. Grouped by UTC date of `created_at`.
 */
export async function findDailyPageViews(from: Date, to: Date): Promise<DailyPageViewCount[]> {
  const rows = (await db.execute(sql`
    SELECT TO_CHAR(pv.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
           COUNT(pv.id)::bigint AS view_count
    FROM page_views pv
    WHERE pv.created_at >= ${from.toISOString()}::timestamp
      AND pv.created_at < ${to.toISOString()}::timestamp
    GROUP BY TO_CHAR(pv.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
    ORDER BY date ASC
  `)) as unknown as RawRow[];
  return rows.map((r) => ({
    date: String(r.date),
    viewCount: toNumber(r.view_count),
  }));
}

/**
 * Unique visitors per day, grouped in the caller's timezone.
 */
export async function findDailyVisitors(
  from: Date,
  to: Date,
  tz: string,
): Promise<DailyVisitorCount[]> {
  const rows = (await db.execute(sql`
    SELECT TO_CHAR(pv.created_at AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS date,
           COUNT(DISTINCT pv.session_id)::bigint AS visitor_count
    FROM page_views pv
    WHERE pv.created_at >= ${from.toISOString()}::timestamp
      AND pv.created_at < ${to.toISOString()}::timestamp
      AND pv.session_id IS NOT NULL
    GROUP BY TO_CHAR(pv.created_at AT TIME ZONE ${tz}, 'YYYY-MM-DD')
    ORDER BY date ASC
  `)) as unknown as RawRow[];
  return rows.map((r) => ({
    date: String(r.date),
    visitorCount: toNumber(r.visitor_count),
  }));
}

/**
 * Count distinct session ids within a range. Used by the overview and by
 * VisitorStatsService (Plan G2) as the raw-table fallback.
 */
export async function countDistinctSessions(from: Date, to: Date): Promise<number> {
  const rows = (await db.execute(sql`
    SELECT COUNT(DISTINCT pv.session_id)::bigint AS n
    FROM page_views pv
    WHERE pv.created_at >= ${from.toISOString()}::timestamp
      AND pv.created_at < ${to.toISOString()}::timestamp
      AND pv.session_id IS NOT NULL
  `)) as unknown as RawRow[];
  return toNumber(rows[0]?.n ?? 0);
}

/**
 * Visitor locations aggregated by IP address. Returns only rows that have
 * geo data populated (lat/lng non-null).
 */
export async function findVisitorLocations(from: Date, to: Date): Promise<VisitorLocation[]> {
  const rows = (await db.execute(sql`
    SELECT pv.ip_address AS ip_address,
           pv.latitude AS latitude,
           pv.longitude AS longitude,
           MAX(pv.country) AS country,
           MAX(pv.city) AS city,
           COUNT(pv.id)::bigint AS visit_count,
           MAX(pv.created_at) AS last_visited_at
    FROM page_views pv
    WHERE pv.created_at >= ${from.toISOString()}::timestamp
      AND pv.created_at < ${to.toISOString()}::timestamp
      AND pv.latitude IS NOT NULL
      AND pv.longitude IS NOT NULL
    GROUP BY pv.ip_address, pv.latitude, pv.longitude
    ORDER BY visit_count DESC
  `)) as unknown as RawRow[];
  return rows.map((r) => ({
    ipAddress: String(r.ip_address),
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    country: toStringOrNull(r.country),
    city: toStringOrNull(r.city),
    visitCount: toNumber(r.visit_count),
    lastVisitedAt: String(r.last_visited_at),
  }));
}

/**
 * Page view history for a specific IP within a range.
 */
export async function findIpAccessHistory(
  ipAddress: string,
  from: Date,
  to: Date,
): Promise<IpAccessHistory[]> {
  const rows = (await db.execute(sql`
    SELECT pv.path AS path,
           pv.ip_address AS ip_address,
           pv.country AS country,
           pv.city AS city,
           pv.created_at AS created_at
    FROM page_views pv
    WHERE pv.ip_address = ${ipAddress}
      AND pv.created_at >= ${from.toISOString()}::timestamp
      AND pv.created_at < ${to.toISOString()}::timestamp
    ORDER BY pv.created_at DESC
  `)) as unknown as RawRow[];
  return rows.map((r) => ({
    path: String(r.path),
    ipAddress: String(r.ip_address),
    country: toStringOrNull(r.country),
    city: toStringOrNull(r.city),
    createdAt: String(r.created_at),
  }));
}

/**
 * Page view history filtered to `/articles/<articleId>` paths.
 */
export async function findArticleAccessHistory(
  articleId: number,
  from: Date,
  to: Date,
): Promise<ArticleAccessHistory[]> {
  const rows = (await db.execute(sql`
    SELECT pv.ip_address AS ip_address,
           pv.country AS country,
           pv.city AS city,
           pv.created_at AS created_at
    FROM page_views pv
    WHERE pv.path = ${"/articles/" + articleId}
      AND pv.created_at >= ${from.toISOString()}::timestamp
      AND pv.created_at < ${to.toISOString()}::timestamp
    ORDER BY pv.created_at DESC
  `)) as unknown as RawRow[];
  return rows.map((r) => ({
    ipAddress: String(r.ip_address),
    country: toStringOrNull(r.country),
    city: toStringOrNull(r.city),
    createdAt: String(r.created_at),
  }));
}

/**
 * Total lifetime visitor count from the daily_visitor_stats aggregated table.
 * This reader is useful but the full VisitorStatsService fallback chain
 * lives in Plan G2.
 */
export async function getTotalVisitorCount(): Promise<number> {
  const rows = (await db.execute(sql`
    SELECT COALESCE(SUM(visitor_count), 0)::bigint AS total
    FROM daily_visitor_stats
  `)) as unknown as RawRow[];
  return toNumber(rows[0]?.total ?? 0);
}

/**
 * Visitor count for a specific date from daily_visitor_stats. Returns 0 if
 * the row doesn't exist (scheduler hasn't run yet for that day).
 */
export async function getVisitorCountByDate(date: string): Promise<VisitorCount> {
  const rows = (await db.execute(sql`
    SELECT COALESCE(visitor_count, 0)::bigint AS count
    FROM daily_visitor_stats
    WHERE date = ${date}
  `)) as unknown as RawRow[];
  return { count: toNumber(rows[0]?.count ?? 0) };
}
```

This replaces the prior file entirely. The old `findPopularArticles` is removed.

- [ ] **Step 2: Type-check**

```bash
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
```
Expected: exit 0. Dashboard (`apps/admin/src/routes/dashboard.ts`) imports `analyticsFindPopularArticles` from the core barrel — that import will break until Task 5 updates the barrel and Task 6 refactors dashboard. `tsc` in core only checks core, so core itself should type-check clean now.

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/domains/analytics/repo.ts
git commit -m "feat(api): replace findPopularArticles with full analytics read surface

10 reader functions matching Kotlin's AnalyticsReader interface:
findTopPages (previously findPopularArticles), findTopReferrers,
findDailyPageViews, findDailyVisitors, countDistinctSessions,
findVisitorLocations, findIpAccessHistory, findArticleAccessHistory,
getTotalVisitorCount, getVisitorCountByDate. Raw SQL for complex
aggregations; small helper functions to normalize bigint / null
values from db.execute return rows."
```

---

## Task 4: Create analytics `service.ts`

**Files:**
- Create: `apps/api-next/packages/core/src/domains/analytics/service.ts`

- [ ] **Step 1: Write `service.ts`**

Write `~/github/new-blog/apps/api-next/packages/core/src/domains/analytics/service.ts`:

```ts
import * as repo from "./repo";
import type {
  PageViewCount,
  ReferrerCount,
  DailyPageViewCount,
  DailyVisitorCount,
  VisitorLocation,
  IpAccessHistory,
  ArticleAccessHistory,
  AnalyticsOverview,
} from "./types";

/**
 * Overview: total page views + top pages within the range.
 * Mirrors Kotlin AnalyticsQueryService.getOverview.
 */
export async function getOverview(from: Date, to: Date): Promise<AnalyticsOverview> {
  const topPages = await repo.findTopPages(from, to);
  const totalPageViews = topPages.reduce((acc, p) => acc + p.viewCount, 0);
  return { totalPageViews, topPages };
}

export async function getTopPages(from: Date, to: Date): Promise<PageViewCount[]> {
  return await repo.findTopPages(from, to);
}

export async function getTopReferrers(from: Date, to: Date): Promise<ReferrerCount[]> {
  return await repo.findTopReferrers(from, to);
}

export async function getDailyPageViews(from: Date, to: Date): Promise<DailyPageViewCount[]> {
  return await repo.findDailyPageViews(from, to);
}

export async function getDailyVisitors(
  from: Date,
  to: Date,
  tz: string,
): Promise<DailyVisitorCount[]> {
  return await repo.findDailyVisitors(from, to, tz);
}

export async function getVisitorLocations(from: Date, to: Date): Promise<VisitorLocation[]> {
  return await repo.findVisitorLocations(from, to);
}

export async function getIpAccessHistory(
  ip: string,
  from: Date,
  to: Date,
): Promise<IpAccessHistory[]> {
  return await repo.findIpAccessHistory(ip, from, to);
}

export async function getArticleAccessHistory(
  articleId: number,
  from: Date,
  to: Date,
): Promise<ArticleAccessHistory[]> {
  return await repo.findArticleAccessHistory(articleId, from, to);
}
```

- [ ] **Step 2: Type-check**

```bash
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/domains/analytics/service.ts
git commit -m "feat(api): add analytics query service

Mirrors Kotlin AnalyticsQueryService: getOverview (with total sum),
getTopPages, getTopReferrers, getDailyPageViews, getDailyVisitors,
getVisitorLocations, getIpAccessHistory, getArticleAccessHistory.
Thin passthroughs except getOverview which aggregates top-page totals."
```

---

## Task 5: Update analytics + core barrels

**Files:**
- Modify: `apps/api-next/packages/core/src/domains/analytics/index.ts`
- Modify: `apps/api-next/packages/core/src/index.ts`

- [ ] **Step 1: Rewrite `domains/analytics/index.ts`**

Replace the entire file contents with:

```ts
export {
  type PopularArticle,
  type PageViewCount,
  type ReferrerCount,
  type DailyPageViewCount,
  type DailyVisitorCount,
  type VisitorCount,
  type VisitorLocation,
  type IpAccessHistory,
  type ArticleAccessHistory,
  type AnalyticsOverview,
} from "./types";

export {
  findTopPages as analyticsFindTopPages,
  findTopReferrers as analyticsFindTopReferrers,
  findDailyPageViews as analyticsFindDailyPageViews,
  findDailyVisitors as analyticsFindDailyVisitors,
  countDistinctSessions as analyticsCountDistinctSessions,
  findVisitorLocations as analyticsFindVisitorLocations,
  findIpAccessHistory as analyticsFindIpAccessHistory,
  findArticleAccessHistory as analyticsFindArticleAccessHistory,
  getTotalVisitorCount as analyticsGetTotalVisitorCount,
  getVisitorCountByDate as analyticsGetVisitorCountByDate,
} from "./repo";

export {
  getOverview as analyticsGetOverview,
  getTopPages as analyticsGetTopPages,
  getTopReferrers as analyticsGetTopReferrers,
  getDailyPageViews as analyticsGetDailyPageViews,
  getDailyVisitors as analyticsGetDailyVisitors,
  getVisitorLocations as analyticsGetVisitorLocations,
  getIpAccessHistory as analyticsGetIpAccessHistory,
  getArticleAccessHistory as analyticsGetArticleAccessHistory,
} from "./service";
```

Note: `analyticsFindPopularArticles` is **gone**. Dashboard will use `analyticsFindTopPages` directly in Task 6.

- [ ] **Step 2: Update core barrel**

Read `~/github/new-blog/apps/api-next/packages/core/src/index.ts`. Find the existing Plan F line:

```ts
export { type PopularArticle, analyticsFindPopularArticles } from "./domains/analytics";
```

Replace it with:

```ts
export {
  type PopularArticle,
  type PageViewCount,
  type ReferrerCount,
  type DailyPageViewCount,
  type DailyVisitorCount,
  type VisitorCount,
  type VisitorLocation,
  type IpAccessHistory,
  type ArticleAccessHistory,
  type AnalyticsOverview,
  analyticsFindTopPages,
  analyticsFindTopReferrers,
  analyticsFindDailyPageViews,
  analyticsFindDailyVisitors,
  analyticsCountDistinctSessions,
  analyticsFindVisitorLocations,
  analyticsFindIpAccessHistory,
  analyticsFindArticleAccessHistory,
  analyticsGetTotalVisitorCount,
  analyticsGetVisitorCountByDate,
  analyticsGetOverview,
  analyticsGetTopPages,
  analyticsGetTopReferrers,
  analyticsGetDailyPageViews,
  analyticsGetDailyVisitors,
  analyticsGetVisitorLocations,
  analyticsGetIpAccessHistory,
  analyticsGetArticleAccessHistory,
} from "./domains/analytics";
```

- [ ] **Step 3: Type-check core**

```bash
cd ~/github/new-blog/apps/api-next/packages/core
bunx tsc --noEmit
```
Expected: exit 0.

Note: admin workspace will now have broken imports in `apps/admin/src/routes/dashboard.ts` (uses `analyticsFindPopularArticles`). Task 6 fixes this. Do NOT run admin tsc yet.

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/domains/analytics/index.ts apps/api-next/packages/core/src/index.ts
git commit -m "feat(api): export analytics read surface with namespaced names

10 repo readers + 8 service functions re-exported with analytics* prefix.
analyticsFindPopularArticles is removed — dashboard (Task 6) will be
refactored to use analyticsFindTopPages directly."
```

---

## Task 6: Refactor dashboard.ts to use `findTopPages`

**Files:**
- Modify: `apps/api-next/apps/admin/src/routes/dashboard.ts`

- [ ] **Step 1: Rewrite `dashboard.ts`**

Replace the entire file contents with:

```ts
import { Hono } from "hono";
import { analyticsFindTopPages, type PopularArticle } from "@api-next/core";

export const dashboardRoute = new Hono();

dashboardRoute.get("/popular-articles", async (c) => {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 30);
  const topPages = await analyticsFindTopPages(from, to);
  const data: PopularArticle[] = topPages.slice(0, 5).map((p) => ({
    id: p.articleId,
    title: p.title,
    viewCount: p.viewCount,
  }));
  return c.json({ data });
});
```

This preserves the Plan F response shape (`PopularArticle` with `id` field) while delegating the query to the shared repo function.

- [ ] **Step 2: Run admin tests**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/apps/admin
bun test test/dashboard.test.ts 2>&1 | tail -15
```
Expected: 5 pass / 0 fail. Plan F's dashboard tests stay green because the response shape is unchanged — `id`, `title`, `viewCount`.

If failing:
- `id` wrong (maybe undefined): check the `.map` returns `id: p.articleId`
- Date range issue: confirm `from.setDate(from.getDate() - 30)` gives exactly 30 days ago

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/admin/src/routes/dashboard.ts
git commit -m "refactor(api): dashboard uses shared analyticsFindTopPages

Replaces the Plan F hardcoded findPopularArticles(5, 30) with the
general-purpose findTopPages(from, to) + a local slice(0, 5) + field
rename to the PopularArticle legacy response shape. Plan F's existing
dashboard tests stay green because the output envelope is identical."
```

---

## Task 7: Failing admin analytics integration test (TDD red)

**Files:**
- Create: `apps/api-next/apps/admin/test/analytics.test.ts`

- [ ] **Step 1: Write the test file**

Write `~/github/new-blog/apps/api-next/apps/admin/test/analytics.test.ts`:

```ts
import { describe, it, expect, beforeEach, beforeAll } from "bun:test";
import { SignJWT } from "jose";
import { createApp } from "../src/app";
import { env, db, schema } from "@api-next/core";
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

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

async function seedArticle(title: string) {
  const now = new Date().toISOString();
  const inserted = await db
    .insert(schema.articles)
    .values({
      title,
      slug: title.toLowerCase().replace(/\s+/g, "-"),
      content: "body",
      status: "PUBLIC",
      created_at: now,
      updated_at: now,
      published_at: now,
    })
    .returning({ id: schema.articles.id });
  return inserted[0]!.id;
}

async function seedPageView(opts: {
  path: string;
  createdAt?: string;
  ip?: string;
  sessionId?: string | null;
  referrer?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  country?: string | null;
  city?: string | null;
}) {
  await db.insert(schema.page_views).values({
    path: opts.path,
    ip_address: opts.ip ?? "127.0.0.1",
    user_agent: null,
    referrer: opts.referrer ?? null,
    session_id: opts.sessionId !== undefined ? opts.sessionId : "s-default",
    latitude: opts.latitude ?? null,
    longitude: opts.longitude ?? null,
    country: opts.country ?? null,
    city: opts.city ?? null,
    created_at: opts.createdAt ?? new Date().toISOString(),
  });
}

const today = new Date().toISOString().slice(0, 10);
const todayQuery = `from=${today}&to=${today}&tz=UTC`;

describe("admin GET /admin/analytics/overview", () => {
  const app = createApp();
  let token: string;
  beforeAll(async () => {
    token = await mintValidToken();
  });
  beforeEach(async () => {
    await resetDb();
  });

  it("empty returns zeros", async () => {
    const res = await app.request(`/admin/analytics/overview?${todayQuery}`, {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { totalPageViews: number; topPages: unknown[] } };
    expect(body.data.totalPageViews).toBe(0);
    expect(body.data.topPages).toEqual([]);
  });

  it("sums top-page view counts", async () => {
    const id = await seedArticle("Hello");
    await seedPageView({ path: `/articles/${id}` });
    await seedPageView({ path: `/articles/${id}` });
    const res = await app.request(`/admin/analytics/overview?${todayQuery}`, {
      headers: authHeaders(token),
    });
    const body = (await res.json()) as { data: { totalPageViews: number; topPages: { articleId: number; viewCount: number }[] } };
    expect(body.data.totalPageViews).toBe(2);
    expect(body.data.topPages[0]?.articleId).toBe(id);
    expect(body.data.topPages[0]?.viewCount).toBe(2);
  });
});

describe("admin GET /admin/analytics/page-views", () => {
  const app = createApp();
  let token: string;
  beforeAll(async () => {
    token = await mintValidToken();
  });
  beforeEach(async () => {
    await resetDb();
  });

  it("returns daily totals grouped by UTC date", async () => {
    const id = await seedArticle("A");
    const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await seedPageView({ path: `/articles/${id}`, createdAt: yesterdayIso });
    await seedPageView({ path: `/articles/${id}`, createdAt: yesterdayIso });
    await seedPageView({ path: `/articles/${id}` });
    const yesterday = yesterdayIso.slice(0, 10);
    const res = await app.request(
      `/admin/analytics/page-views?from=${yesterday}&to=${today}&tz=UTC`,
      { headers: authHeaders(token) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { date: string; viewCount: number }[] };
    expect(body.data.length).toBeGreaterThanOrEqual(2);
    const byDate = Object.fromEntries(body.data.map((d) => [d.date, d.viewCount]));
    expect(byDate[yesterday]).toBe(2);
    expect(byDate[today]).toBe(1);
  });
});

describe("admin GET /admin/analytics/daily-visitors", () => {
  const app = createApp();
  let token: string;
  beforeAll(async () => {
    token = await mintValidToken();
  });
  beforeEach(async () => {
    await resetDb();
  });

  it("counts distinct sessions per day", async () => {
    const id = await seedArticle("A");
    await seedPageView({ path: `/articles/${id}`, sessionId: "s1" });
    await seedPageView({ path: `/articles/${id}`, sessionId: "s1" });
    await seedPageView({ path: `/articles/${id}`, sessionId: "s2" });
    const res = await app.request(
      `/admin/analytics/daily-visitors?${todayQuery}`,
      { headers: authHeaders(token) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { date: string; visitorCount: number }[] };
    expect(body.data[0]?.visitorCount).toBe(2);
  });
});

describe("admin GET /admin/analytics/top-pages", () => {
  const app = createApp();
  let token: string;
  beforeAll(async () => {
    token = await mintValidToken();
  });
  beforeEach(async () => {
    await resetDb();
  });

  it("returns PageViewCount shape sorted desc", async () => {
    const a = await seedArticle("A");
    const b = await seedArticle("B");
    await seedPageView({ path: `/articles/${a}` });
    await seedPageView({ path: `/articles/${b}` });
    await seedPageView({ path: `/articles/${b}` });
    const res = await app.request(`/admin/analytics/top-pages?${todayQuery}`, {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { articleId: number; title: string; viewCount: number }[] };
    expect(body.data[0]?.articleId).toBe(b);
    expect(body.data[0]?.viewCount).toBe(2);
    expect(body.data[1]?.articleId).toBe(a);
  });
});

describe("admin GET /admin/analytics/referrers", () => {
  const app = createApp();
  let token: string;
  beforeAll(async () => {
    token = await mintValidToken();
  });
  beforeEach(async () => {
    await resetDb();
  });

  it("null referrer is bucketed as (직접 접속)", async () => {
    const id = await seedArticle("A");
    await seedPageView({ path: `/articles/${id}`, referrer: null });
    await seedPageView({ path: `/articles/${id}`, referrer: "https://google.com" });
    const res = await app.request(`/admin/analytics/referrers?${todayQuery}`, {
      headers: authHeaders(token),
    });
    const body = (await res.json()) as { data: { referrer: string; viewCount: number }[] };
    const refs = body.data.map((r) => r.referrer);
    expect(refs).toContain("(직접 접속)");
    expect(refs).toContain("https://google.com");
  });
});

describe("admin GET /admin/analytics/visitor-locations", () => {
  const app = createApp();
  let token: string;
  beforeAll(async () => {
    token = await mintValidToken();
  });
  beforeEach(async () => {
    await resetDb();
  });

  it("groups by ip + lat/lng, excludes rows without geo", async () => {
    const id = await seedArticle("A");
    await seedPageView({
      path: `/articles/${id}`,
      ip: "1.1.1.1",
      latitude: 37.5,
      longitude: 127.0,
      country: "South Korea",
      city: "Seoul",
    });
    await seedPageView({
      path: `/articles/${id}`,
      ip: "1.1.1.1",
      latitude: 37.5,
      longitude: 127.0,
      country: "South Korea",
      city: "Seoul",
    });
    await seedPageView({ path: `/articles/${id}`, ip: "2.2.2.2" }); // no geo
    const res = await app.request(
      `/admin/analytics/visitor-locations?${todayQuery}`,
      { headers: authHeaders(token) },
    );
    const body = (await res.json()) as { data: { ipAddress: string; visitCount: number }[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.ipAddress).toBe("1.1.1.1");
    expect(body.data[0]?.visitCount).toBe(2);
  });
});

describe("admin GET /admin/analytics/ip-access-history", () => {
  const app = createApp();
  let token: string;
  beforeAll(async () => {
    token = await mintValidToken();
  });
  beforeEach(async () => {
    await resetDb();
  });

  it("filters to one ip", async () => {
    const id = await seedArticle("A");
    await seedPageView({ path: `/articles/${id}`, ip: "1.1.1.1" });
    await seedPageView({ path: "/about", ip: "1.1.1.1" });
    await seedPageView({ path: `/articles/${id}`, ip: "2.2.2.2" });
    const res = await app.request(
      `/admin/analytics/ip-access-history?ip=1.1.1.1&${todayQuery}`,
      { headers: authHeaders(token) },
    );
    const body = (await res.json()) as { data: { path: string; ipAddress: string }[] };
    expect(body.data).toHaveLength(2);
    for (const row of body.data) expect(row.ipAddress).toBe("1.1.1.1");
  });
});

describe("admin GET /admin/analytics/article-access-history", () => {
  const app = createApp();
  let token: string;
  beforeAll(async () => {
    token = await mintValidToken();
  });
  beforeEach(async () => {
    await resetDb();
  });

  it("filters to one article", async () => {
    const a = await seedArticle("A");
    const b = await seedArticle("B");
    await seedPageView({ path: `/articles/${a}`, ip: "1.1.1.1" });
    await seedPageView({ path: `/articles/${a}`, ip: "2.2.2.2" });
    await seedPageView({ path: `/articles/${b}`, ip: "1.1.1.1" });
    const res = await app.request(
      `/admin/analytics/article-access-history?articleId=${a}&${todayQuery}`,
      { headers: authHeaders(token) },
    );
    const body = (await res.json()) as { data: { ipAddress: string }[] };
    expect(body.data).toHaveLength(2);
  });
});

describe("admin analytics validation and auth", () => {
  const app = createApp();
  let token: string;
  beforeAll(async () => {
    token = await mintValidToken();
  });
  beforeEach(async () => {
    await resetDb();
  });

  it("missing from/to → 400", async () => {
    const res = await app.request("/admin/analytics/overview", {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(400);
  });

  it("all endpoints 401 without JWT", async () => {
    const endpoints = [
      `/admin/analytics/overview?${todayQuery}`,
      `/admin/analytics/page-views?${todayQuery}`,
      `/admin/analytics/daily-visitors?${todayQuery}`,
      `/admin/analytics/top-pages?${todayQuery}`,
      `/admin/analytics/referrers?${todayQuery}`,
      `/admin/analytics/visitor-locations?${todayQuery}`,
      `/admin/analytics/ip-access-history?ip=1.1.1.1&${todayQuery}`,
      `/admin/analytics/article-access-history?articleId=1&${todayQuery}`,
    ];
    for (const url of endpoints) {
      const res = await app.request(url);
      expect(res.status).toBe(401);
    }
  });
});
```

- [ ] **Step 2: Run and verify red**

```bash
cd ~/github/new-blog/apps/api-next/apps/admin
bun test test/analytics.test.ts 2>&1 | tail -15
```
Expected: most tests fail (no `/admin/analytics` route yet). 401 combined test likely passes.

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/admin/test/analytics.test.ts
git commit -m "test(api): add failing admin analytics integration tests (TDD red)

Covers overview, page-views, daily-visitors, top-pages, referrers,
visitor-locations, ip-access-history, article-access-history + 400
validation + 401 auth. Goes green in Task 8 when the route lands."
```

---

## Task 8: Admin analytics route + wire-up

**Files:**
- Create: `apps/api-next/apps/admin/src/routes/analytics.ts`
- Modify: `apps/api-next/apps/admin/src/app.ts`

- [ ] **Step 1: Write `routes/analytics.ts`**

Write `~/github/new-blog/apps/api-next/apps/admin/src/routes/analytics.ts`:

```ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  toUtcDateRange,
  analyticsGetOverview,
  analyticsGetTopPages,
  analyticsGetTopReferrers,
  analyticsGetDailyPageViews,
  analyticsGetDailyVisitors,
  analyticsGetVisitorLocations,
  analyticsGetIpAccessHistory,
  analyticsGetArticleAccessHistory,
} from "@api-next/core";

type ZodIssueLike = { path: PropertyKey[]; message: string };
type ZodErrorLike = { issues: ZodIssueLike[] };

function validationErrorMessage(error: ZodErrorLike): string {
  const first = error.issues[0];
  if (!first) return "Invalid request";
  const path = first.path.join(".");
  return path ? `${path}: ${first.message}` : first.message;
}

const dateRangeQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  tz: z.string().min(1).default("UTC"),
});

const ipHistoryQuerySchema = dateRangeQuerySchema.extend({
  ip: z.string().min(1),
});

const articleHistoryQuerySchema = dateRangeQuerySchema.extend({
  articleId: z.coerce.number().int().positive(),
});

const queryHook = <T>(schema: z.ZodType<T>) =>
  zValidator("query", schema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  });

export const analyticsRoute = new Hono();

analyticsRoute.get("/overview", queryHook(dateRangeQuerySchema), async (c) => {
  const { from, to, tz } = c.req.valid("query");
  const { fromUtc, toUtcExclusive } = toUtcDateRange(from, to, tz);
  const data = await analyticsGetOverview(fromUtc, toUtcExclusive);
  return c.json({ data });
});

analyticsRoute.get("/page-views", queryHook(dateRangeQuerySchema), async (c) => {
  const { from, to, tz } = c.req.valid("query");
  const { fromUtc, toUtcExclusive } = toUtcDateRange(from, to, tz);
  const data = await analyticsGetDailyPageViews(fromUtc, toUtcExclusive);
  return c.json({ data });
});

analyticsRoute.get("/daily-visitors", queryHook(dateRangeQuerySchema), async (c) => {
  const { from, to, tz } = c.req.valid("query");
  const { fromUtc, toUtcExclusive } = toUtcDateRange(from, to, tz);
  const data = await analyticsGetDailyVisitors(fromUtc, toUtcExclusive, tz);
  return c.json({ data });
});

analyticsRoute.get("/top-pages", queryHook(dateRangeQuerySchema), async (c) => {
  const { from, to, tz } = c.req.valid("query");
  const { fromUtc, toUtcExclusive } = toUtcDateRange(from, to, tz);
  const data = await analyticsGetTopPages(fromUtc, toUtcExclusive);
  return c.json({ data });
});

analyticsRoute.get("/referrers", queryHook(dateRangeQuerySchema), async (c) => {
  const { from, to, tz } = c.req.valid("query");
  const { fromUtc, toUtcExclusive } = toUtcDateRange(from, to, tz);
  const data = await analyticsGetTopReferrers(fromUtc, toUtcExclusive);
  return c.json({ data });
});

analyticsRoute.get("/visitor-locations", queryHook(dateRangeQuerySchema), async (c) => {
  const { from, to, tz } = c.req.valid("query");
  const { fromUtc, toUtcExclusive } = toUtcDateRange(from, to, tz);
  const data = await analyticsGetVisitorLocations(fromUtc, toUtcExclusive);
  return c.json({ data });
});

analyticsRoute.get("/ip-access-history", queryHook(ipHistoryQuerySchema), async (c) => {
  const { from, to, tz, ip } = c.req.valid("query");
  const { fromUtc, toUtcExclusive } = toUtcDateRange(from, to, tz);
  const data = await analyticsGetIpAccessHistory(ip, fromUtc, toUtcExclusive);
  return c.json({ data });
});

analyticsRoute.get("/article-access-history", queryHook(articleHistoryQuerySchema), async (c) => {
  const { from, to, tz, articleId } = c.req.valid("query");
  const { fromUtc, toUtcExclusive } = toUtcDateRange(from, to, tz);
  const data = await analyticsGetArticleAccessHistory(articleId, fromUtc, toUtcExclusive);
  return c.json({ data });
});
```

- [ ] **Step 2: Mount in admin app.ts**

Read `~/github/new-blog/apps/api-next/apps/admin/src/app.ts`. Add the import:

```ts
import { analyticsRoute } from "./routes/analytics";
```

Inside `createApp()`, after `app.route("/admin/dashboard", dashboardRoute);`, add:

```ts
app.route("/admin/analytics", analyticsRoute);
```

- [ ] **Step 3: Run admin tests**

```bash
cd ~/github/new-blog/apps/api-next/apps/admin
bun test 2>&1 | tail -25
```
Expected: all admin tests pass including new analytics cases.

Troubleshooting:
- `(직접 접속)` test fails: confirm `COALESCE(pv.referrer, '(직접 접속)')` in repo matches exactly
- visitor-locations empty despite seeds: confirm latitude/longitude NOT NULL filter in the WHERE
- daily-visitors with single session returns 0: check the `session_id IS NOT NULL` filter
- article-access-history returns empty for valid article: check the `path = '/articles/' + articleId` concatenation
- Timezone test off by hours: verify `toUtcDateRange` converts correctly via the sanity check from Task 1

- [ ] **Step 4: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/apps/admin/src/routes/analytics.ts apps/api-next/apps/admin/src/app.ts
git commit -m "feat(api): add /admin/analytics route (8 read endpoints)

Each handler parses from/to/tz query params via Zod, converts to a
UTC datetime range via toUtcDateRange, and delegates to the service
layer. Daily visitors passes the raw tz to the service so postgres
groups in the caller's timezone."
```

---

## Task 9: Monorepo verification + smoke test

**Files:** (no changes unless errors)

- [ ] **Step 1: `turbo run lint`**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog
bunx turbo run lint --force 2>&1 | tail -10
```
Expected: 5/5 success, 0 errors.

- [ ] **Step 2: `bun run test`**

```bash
cd ~/github/new-blog
bun run test 2>&1 | tail -15
```
Expected: 4/4 successful. admin count grows by ~10 (analytics cases), dashboard still at 5.

- [ ] **Step 3: Manual smoke test**

Terminal 1:
```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/apps/admin
export $(grep -v '^#' ../../.env | xargs)
export ADMIN_PORT=9081
bun run src/index.ts
```

Terminal 2:
```bash
# Seed some page views
docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "
INSERT INTO articles (title, slug, content, status, created_at, updated_at, published_at)
VALUES ('Smoke', 'smoke', 'body', 'PUBLIC', NOW(), NOW(), NOW()) RETURNING id;
"
docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "
INSERT INTO page_views (path, ip_address, session_id, referrer, latitude, longitude, country, city, created_at)
VALUES
  ('/articles/1', '1.1.1.1', 's1', 'https://google.com', 37.5, 127.0, 'Korea', 'Seoul', NOW()),
  ('/articles/1', '1.1.1.1', 's1', NULL, 37.5, 127.0, 'Korea', 'Seoul', NOW()),
  ('/articles/1', '2.2.2.2', 's2', 'https://twitter.com', NULL, NULL, NULL, NULL, NOW());
"

TODAY=$(date +%F)
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

echo "--- overview ---"
curl -s -H "authorization: Bearer $TOKEN" "http://localhost:9081/admin/analytics/overview?from=$TODAY&to=$TODAY&tz=UTC"
echo
echo "--- top-pages ---"
curl -s -H "authorization: Bearer $TOKEN" "http://localhost:9081/admin/analytics/top-pages?from=$TODAY&to=$TODAY&tz=UTC"
echo
echo "--- referrers ---"
curl -s -H "authorization: Bearer $TOKEN" "http://localhost:9081/admin/analytics/referrers?from=$TODAY&to=$TODAY&tz=UTC"
echo
echo "--- visitor-locations ---"
curl -s -H "authorization: Bearer $TOKEN" "http://localhost:9081/admin/analytics/visitor-locations?from=$TODAY&to=$TODAY&tz=UTC"
echo

docker exec api-next-dev-db psql -U api_next -d api_next_dev -c "TRUNCATE page_views, articles RESTART IDENTITY CASCADE"
```

Stop server.

Expected:
- **overview**: `totalPageViews: 3, topPages: [{articleId: 1, title: "Smoke", viewCount: 3}]`
- **top-pages**: same 1 entry
- **referrers**: 3 buckets — `(직접 접속)` with 1, `https://google.com` with 1, `https://twitter.com` with 1
- **visitor-locations**: 1 entry (only 1.1.1.1 has geo), `visitCount: 2`

No commit.

---

## Plan G Completion Checklist

- [ ] `date-fns-tz` installed in core; `toUtcDateRange` helper created (Task 1)
- [ ] `domains/analytics/types.ts` extended with 9 new types (Task 2)
- [ ] `domains/analytics/repo.ts` has 10 reader functions, `findPopularArticles` replaced with `findTopPages` (Task 3)
- [ ] `domains/analytics/service.ts` created (Task 4)
- [ ] Analytics + core barrels updated with namespaced exports (Task 5)
- [ ] `apps/admin/src/routes/dashboard.ts` refactored to use `analyticsFindTopPages` (Task 6)
- [ ] `apps/admin/test/dashboard.test.ts` still passes (Task 6)
- [ ] `apps/admin/test/analytics.test.ts` ~10 test blocks (17+ cases) pass (Tasks 7, 8)
- [ ] `apps/admin/src/routes/analytics.ts` mounted at `/admin/analytics` (Task 8)
- [ ] `bunx turbo run lint` 5/5, 0 errors (Task 9)
- [ ] `bun run test` 4/4 (Task 9)
- [ ] Smoke test confirms all 4 key endpoints return expected shapes (Task 9)

## Out of Scope (Plan G2 or later)

- `POST /analytics/page-view` write endpoint, `AnalyticsCollectionService`, Redis `VisitorCounter`, `GeoLocationResolver`, `VisitorStatsAggregator` scheduler, `VisitorStatsService` fallback chain — all Plan G2
- `findTopArticleStats`, `article_stats`, `daily_article_stats` — dead in Kotlin, not ported
- Sort param parsing on paginated endpoints (already noted as Plan E non-goal, not reintroduced here)
- `@api-next/core/middleware` extraction
- `hono-pino` migration
